-- Additive Phase 1.2 upgrade; old migrations are immutable.
alter table public.accounts drop constraint accounts_platform_role_check;
alter table public.accounts add constraint accounts_platform_role_check check(platform_role in ('volunteer','admin','super_admin','volunteer_manager','ngo_manager','auditor'));
create function app_private.can_manage_volunteers() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.accounts where id=auth.uid() and status='active' and platform_role in ('admin','super_admin','volunteer_manager')); $$;
create function app_private.can_manage_ngos() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.accounts where id=auth.uid() and status='active' and platform_role in ('admin','super_admin','ngo_manager')); $$;
create function app_private.can_audit() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.accounts where id=auth.uid() and status='active' and platform_role in ('admin','super_admin','auditor')); $$;
revoke all on function app_private.can_manage_volunteers(),app_private.can_manage_ngos(),app_private.can_audit() from public,anon,authenticated;
grant execute on function app_private.can_manage_volunteers(),app_private.can_manage_ngos(),app_private.can_audit() to authenticated;
create or replace function app_private.can_read_profile(subject uuid) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.is_active() and (subject=auth.uid() or app_private.can_manage_volunteers() or exists(select 1 from public.profile_shares s join public.accounts a on a.id=s.user_id join public.volunteer_profiles p on p.user_id=s.user_id where s.user_id=subject and a.status='active' and p.status<>'suspended' and app_private.ngo_admin(s.organization_id))); $$;
alter policy accounts_read on public.accounts using(id=auth.uid() or app_private.can_manage_ngos() or app_private.can_manage_volunteers());
alter policy org_read on public.organizations using(app_private.is_active() and (status='active' or app_private.can_manage_ngos() or exists(select 1 from public.organization_memberships m where m.organization_id=id and m.user_id=auth.uid()) or exists(select 1 from public.profile_shares s where s.organization_id=id and s.user_id=auth.uid())));
alter policy memberships_read on public.organization_memberships using(app_private.is_active() and (user_id=auth.uid() or app_private.can_manage_ngos()));
alter policy shares_read on public.profile_shares using(app_private.is_active() and (user_id=auth.uid() or app_private.can_manage_volunteers() or app_private.ngo_admin(organization_id)));
alter policy audit_read on public.audit_events using(app_private.is_active() and (subject_id=auth.uid() or app_private.can_audit() or (app_private.can_manage_ngos() and organization_id is not null) or (app_private.can_manage_volunteers() and action in ('profile_saved','profile_reviewed','document_uploaded','document_reviewed','document_download_requested','document_removal_requested'))));
alter policy document_metadata_read on public.volunteer_documents using(app_private.is_active() and (user_id=auth.uid() or app_private.can_manage_volunteers()));

create table public.organization_areas (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 geography_id uuid not null references public.geographies(id),
 primary key(organization_id,geography_id)
);
create table public.organization_programs (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 name text not null check(length(trim(name)) between 2 and 100),
 primary key(organization_id,name)
);
alter table public.organizations add column operations_version integer not null default 1;
alter table public.organization_areas enable row level security;
alter table public.organization_programs enable row level security;
create policy areas_read on public.organization_areas for select to authenticated using(exists(select 1 from public.organizations o where o.id=organization_id));
create policy programs_read on public.organization_programs for select to authenticated using(exists(select 1 from public.organizations o where o.id=organization_id));
create function public.save_ngo_operations(p_org uuid,p_areas uuid[],p_programs text[],p_version integer) returns void language plpgsql security definer set search_path='' as $$
 declare v integer; label text;
 begin
 if not app_private.can_manage_ngos() then raise exception 'NGO management permission required'; end if;
 if p_areas is null or p_programs is null or cardinality(p_areas)>100 or cardinality(p_programs)>50 then raise exception 'Maximum 100 areas and 50 programs'; end if;
 select operations_version into v from public.organizations where id=p_org for update;
 if not found then raise exception 'Organization not found'; end if;
 if v is distinct from p_version then raise exception 'Operations changed. Reload before saving.'; end if;
 if exists(select 1 from unnest(p_areas) g where not exists(select 1 from public.geographies where id=g and kind in ('district','taluka') and app_private.geo_active(id))) then raise exception 'Choose active districts or talukas'; end if;
 foreach label in array p_programs loop
 if label is null or length(trim(label)) not between 2 and 100 then raise exception 'Program names need 2 to 100 characters'; end if;
 end loop;
 delete from public.organization_areas where organization_id=p_org;
 insert into public.organization_areas select p_org,g from (select distinct unnest(p_areas) g) x;
 delete from public.organization_programs where organization_id=p_org;
 insert into public.organization_programs select p_org,trim(x) from unnest(p_programs) x group by trim(x);
 update public.organizations set operations_version=operations_version+1 where id=p_org;
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),p_org,'ngo_operations_updated',jsonb_build_object('areas',p_areas,'programs',p_programs,'previous_version',v));
 end; $$;

-- Never turn a shortlist into a permanent alternative to a revoked profile grant.
create function app_private.ngo_profile_access(org uuid,subject uuid) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.ngo_admin(org) and exists(select 1 from public.profile_shares s join public.accounts a on a.id=s.user_id join public.volunteer_profiles p on p.user_id=s.user_id where s.organization_id=org and s.user_id=subject and a.status='active' and p.status<>'suspended'); $$;
create table public.volunteer_shortlists (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 user_id uuid not null references public.accounts(id),
 status text not null check(status in ('shortlisted','considering','selected','not_selected')),
 note text not null default '' check(length(note)<=2000),version integer not null default 1,
 updated_by uuid not null references public.accounts(id),updated_at timestamptz not null default now(),
 primary key(organization_id,user_id)
);
alter table public.volunteer_shortlists enable row level security;
create policy shortlist_read on public.volunteer_shortlists for select to authenticated using(app_private.ngo_profile_access(organization_id,user_id));
create function public.save_shortlist(p_org uuid,p_user uuid,p_status text,p_note text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
 declare v integer;
 begin
 if not app_private.ngo_profile_access(p_org,p_user) then raise exception 'Active NGO membership and explicit profile grant required'; end if;
 if p_status is null or p_status not in ('shortlisted','considering','selected','not_selected','remove') or p_note is null or length(p_note)>2000 then raise exception 'Invalid shortlist decision or note'; end if;
 perform pg_advisory_xact_lock(hashtext(p_org::text||p_user::text));
 select version into v from public.volunteer_shortlists where organization_id=p_org and user_id=p_user for update;
 if coalesce(v,0) is distinct from p_version then raise exception 'Shortlist changed. Reload before saving.'; end if;
 if p_status='remove' then delete from public.volunteer_shortlists where organization_id=p_org and user_id=p_user;
 else insert into public.volunteer_shortlists(organization_id,user_id,status,note,updated_by) values(p_org,p_user,p_status,trim(p_note),auth.uid()) on conflict(organization_id,user_id) do update set status=excluded.status,note=excluded.note,updated_by=excluded.updated_by,updated_at=now(),version=public.volunteer_shortlists.version+1;end if;
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),p_org,'shortlist_updated',jsonb_build_object('subject',p_user,'status',p_status,'previous_version',coalesce(v,0)));
 end; $$;
create function app_private.clear_revoked_shortlist() returns trigger language plpgsql security definer set search_path='' as $$
 begin delete from public.volunteer_shortlists where organization_id=old.organization_id and user_id=old.user_id;return old;end; $$;
create trigger clear_revoked_shortlist after delete on public.profile_shares for each row execute function app_private.clear_revoked_shortlist();
-- Independent audit history is retained; private shortlist notes are deleted on grant revocation.

create index profile_directory_order on public.volunteer_profiles(lower(details->>'full_name'),user_id);
create index profile_status on public.volunteer_profiles(status);
create function public.search_volunteers(p_org uuid default null,p_query text default '',p_geography uuid default null,p_skill text default '',p_language text default '',p_availability text default '',p_status text default '',p_shortlist text default '',p_page integer default 0)
 returns jsonb language plpgsql stable security invoker set search_path='' as $$
 declare result jsonb;
 begin
 if not app_private.is_active() then raise exception 'Active account required'; end if;
 if p_org is null and not app_private.can_manage_volunteers() then raise exception 'Volunteer management permission required'; end if;
 if p_org is not null and not app_private.ngo_admin(p_org) then raise exception 'Active NGO admin membership required'; end if;
 if p_page is null or p_page<0 or p_page>100000 or p_query is null or p_skill is null or p_language is null or length(p_query)>100 or length(p_skill)>100 or length(p_language)>100 or p_availability is null or p_availability not in ('','Part-time','Full-time','Weekends','Unavailable') or p_status is null or p_status not in ('','draft','pending','verified','correction_required','suspended') or p_shortlist is null or p_shortlist not in ('','any','shortlisted','considering','selected','not_selected') then raise exception 'Invalid directory filters or page'; end if;
 with recursive areas as (select id from public.geographies where id=p_geography union all select g.id from public.geographies g join areas a on g.parent_id=a.id),
 matched as materialized (
 select p.*,s.status as shortlist_status,s.note as shortlist_note,s.version as shortlist_version
 from public.volunteer_profiles p left join public.volunteer_shortlists s on s.user_id=p.user_id and s.organization_id=p_org
 where (p_org is null or app_private.ngo_profile_access(p_org,p.user_id))
 and (p_geography is null or p.geography_id in (select id from areas))
 and (p_query='' or strpos(lower(coalesce(p.details->>'full_name','')),lower(trim(p_query)))>0)
 and (p_skill='' or strpos(lower(coalesce(p.details->>'skills','')),lower(trim(p_skill)))>0)
 and (p_language='' or strpos(lower(coalesce(p.details->>'languages','')),lower(trim(p_language)))>0)
 and (p_availability='' or p.details->>'availability'=p_availability)
 and (p_status='' or p.status=p_status)
 and (p_shortlist='' or (p_shortlist='any' and s.status is not null) or s.status=p_shortlist)
 ), batch as (select * from matched order by lower(coalesce(details->>'full_name','')),user_id limit 50 offset p_page*50)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(b) order by lower(coalesce(details->>'full_name','')),user_id) from batch b),'[]'::jsonb),'total',(select count(*) from matched),'page',p_page,'page_size',50) into result;
 return result;
 end; $$;
revoke all on public.organization_areas,public.organization_programs,public.volunteer_shortlists from anon,authenticated;
grant select on public.organization_areas,public.organization_programs,public.volunteer_shortlists to authenticated;
grant all on public.organization_areas,public.organization_programs,public.volunteer_shortlists to service_role;
revoke all on function app_private.ngo_profile_access(uuid,uuid),app_private.clear_revoked_shortlist() from public,anon,authenticated;
grant execute on function app_private.ngo_profile_access(uuid,uuid) to authenticated;
revoke all on function public.save_ngo_operations(uuid,uuid[],text[],integer),public.save_shortlist(uuid,uuid,text,text,integer),public.search_volunteers(uuid,text,uuid,text,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.save_ngo_operations(uuid,uuid[],text[],integer),public.save_shortlist(uuid,uuid,text,text,integer),public.search_volunteers(uuid,text,uuid,text,text,text,text,text,integer) to authenticated;

create or replace function public.save_organization(p_id uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
 declare result_id uuid;
 begin
 if not app_private.can_manage_ngos() then raise exception 'POEM admin access required'; end if;
 if jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>12000 or coalesce(p_data->>'status','pending') not in ('pending','active','inactive','suspended') then raise exception 'Invalid organization'; end if;
 if length(trim(coalesce(p_data->>'name','')))<2 or length(p_data->>'name')>200 then raise exception 'Organization name required'; end if;
 if p_id is null then
 insert into public.organizations(name,registration_number,contact_person,email,phone,address,areas,programs,status) values(trim(p_data->>'name'),coalesce(p_data->>'registration_number',''),coalesce(p_data->>'contact_person',''),coalesce(p_data->>'email',''),coalesce(p_data->>'phone',''),coalesce(p_data->>'address',''),coalesce(p_data->>'areas',''),coalesce(p_data->>'programs',''),coalesce(p_data->>'status','pending')) returning id into result_id;
 else
 update public.organizations set name=trim(p_data->>'name'),registration_number=coalesce(p_data->>'registration_number',''),contact_person=coalesce(p_data->>'contact_person',''),email=coalesce(p_data->>'email',''),phone=coalesce(p_data->>'phone',''),address=coalesce(p_data->>'address',''),areas=coalesce(p_data->>'areas',''),programs=coalesce(p_data->>'programs',''),status=coalesce(p_data->>'status','pending') where id=p_id returning id into result_id;
 if result_id is null then raise exception 'Organization not found'; end if;
 end if;
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),result_id,'organization_saved',jsonb_build_object('status',p_data->>'status'));return result_id;
 end; $$;

create or replace function public.set_membership(p_org uuid,p_user uuid,p_role text,p_status text) returns void language plpgsql security definer set search_path='' as $$
 begin
 if not app_private.can_manage_ngos() then raise exception 'POEM admin access required'; end if;
 if p_role not in ('ngo_admin','member') or p_status not in ('active','suspended') then raise exception 'Invalid membership'; end if;
 insert into public.organization_memberships(organization_id,user_id,role,status) values(p_org,p_user,p_role,p_status) on conflict(organization_id,user_id) do update set role=excluded.role,status=excluded.status;
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),p_user,p_org,'membership_changed',jsonb_build_object('role',p_role,'status',p_status));
 end; $$;

create or replace function public.set_account_access(p_user uuid,p_role text,p_status text) returns void language plpgsql security definer set search_path='' as $$
 begin
 perform pg_advisory_xact_lock(hashtext('poem-account-access'));
 if not app_private.is_super() then raise exception 'Super admin access required'; end if;
 if p_user=auth.uid() then raise exception 'Cannot change your own platform access'; end if;
 if p_role not in ('volunteer','admin','super_admin','volunteer_manager','ngo_manager','auditor') or p_status not in ('active','suspended') then raise exception 'Invalid account access'; end if;
 update public.accounts set platform_role=p_role,status=p_status where id=p_user;
 if not found then raise exception 'Account not found'; end if;
 insert into public.audit_events(actor_id,subject_id,action,detail) values(auth.uid(),p_user,'account_access_changed',jsonb_build_object('role',p_role,'status',p_status));
 end; $$;

create or replace function app_private.review_profile_v11(p_user_id uuid,p_status text,p_note text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
 declare old_status text; old_version integer;
 begin
 if not app_private.can_manage_volunteers() then raise exception 'POEM admin access required'; end if;
 if p_user_id=auth.uid() then raise exception 'You cannot review your own profile'; end if;
 if p_status not in ('verified','correction_required','suspended') or length(trim(p_note))<3 or length(p_note)>2000 then raise exception 'Valid decision and review note required'; end if;
 select status,version into old_status,old_version from public.volunteer_profiles where user_id=p_user_id for update;
 if old_version is null then raise exception 'Profile not found'; end if;
 if old_version is distinct from p_version then raise exception 'Profile changed. Reload and review again.'; end if;
 if old_status='draft' and p_status='verified' then raise exception 'Draft profiles must be submitted before approval'; end if;
 update public.volunteer_profiles set status=p_status,review_note=p_note,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now(),version=version+1 where user_id=p_user_id;
 insert into public.audit_events(actor_id,subject_id,action,detail) values(auth.uid(),p_user_id,'profile_reviewed',jsonb_build_object('from',old_status,'to',p_status,'note',p_note));
 end; $$;

create or replace function public.review_profile(p_user_id uuid,p_status text,p_note text,p_version integer,p_checks jsonb) returns void language plpgsql security definer set search_path='' as $$
 declare geo uuid;
 begin
 if not app_private.can_manage_volunteers() then raise exception 'POEM admin access required'; end if;
 select geography_id into geo from public.volunteer_profiles where user_id=p_user_id for update;
 if p_status='verified' then
 if not app_private.geo_active(geo) then raise exception 'Profile needs an active structured location'; end if;
 if p_checks is null or jsonb_typeof(p_checks)<>'object' or p_checks->'profile_complete' is distinct from 'true'::jsonb or p_checks->'contact_checked' is distinct from 'true'::jsonb or p_checks->'location_checked' is distinct from 'true'::jsonb then raise exception 'Complete the profile, contact and location checklist'; end if;
 if exists(select 1 from public.volunteer_documents where user_id=p_user_id and state in ('uploading','deleting')) then raise exception 'Finish pending uploads/removals before profile approval'; end if;
 if exists(select 1 from public.volunteer_documents where user_id=p_user_id and state='ready' and review_status<>'accepted') then raise exception 'All current documents must be accepted before profile approval'; end if;
 end if;
 if octet_length(coalesce(p_checks,'{}')::text)>1000 then raise exception 'Invalid checklist'; end if;
 perform app_private.review_profile_v11(p_user_id,p_status,p_note,p_version);
 update public.volunteer_profiles set review_checks=jsonb_build_object('profile_complete',p_checks->'profile_complete','contact_checked',p_checks->'contact_checked','location_checked',p_checks->'location_checked') where user_id=p_user_id;
 end; $$;

create or replace function public.review_document(p_id uuid,p_status text,p_note text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
 declare d public.volunteer_documents; owner_user uuid;
 begin
 if not app_private.can_manage_volunteers() then raise exception 'POEM admin access required'; end if;
 select user_id into owner_user from public.volunteer_documents where id=p_id;
 perform 1 from public.volunteer_profiles where user_id=owner_user for update;
 select * into d from public.volunteer_documents where id=p_id for update;
 if not found or d.state<>'ready' then raise exception 'Ready document not found'; end if;
 if d.user_id=auth.uid() then raise exception 'Cannot review your own document'; end if;
 if d.version is distinct from p_version then raise exception 'Document changed. Reload before reviewing.'; end if;
 if p_status not in ('accepted','rejected') or length(trim(p_note)) not between 3 and 2000 then raise exception 'Decision and review note required'; end if;
 update public.volunteer_documents set review_status=p_status,review_note=p_note,reviewed_by=auth.uid(),reviewed_at=now(),version=version+1 where id=p_id;
 perform app_private.invalidate_document_review(d.user_id);
 insert into public.audit_events(actor_id,subject_id,action,detail) values(auth.uid(),d.user_id,'document_reviewed',jsonb_build_object('id',p_id,'status',p_status,'note',p_note));
 end; $$;

create or replace function app_private.document_access(path text,operation text) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.is_active() and exists(select 1 from public.volunteer_documents d join public.volunteer_profiles p on p.user_id=d.user_id where d.object_path=path and
 case operation
 when 'read' then d.state='ready' and (d.user_id=auth.uid() or app_private.can_manage_volunteers())
 when 'upload' then d.user_id=auth.uid() and d.state='uploading' and p.status<>'suspended'
 when 'delete' then d.user_id=auth.uid() and d.state='deleting'
 else false end); $$;

create or replace function public.save_geography(p_id uuid,p_parent uuid,p_kind text,p_name text,p_code text,p_source text,p_active boolean) returns uuid language plpgsql security definer set search_path='' as $$
 declare result_id uuid; current_row public.geographies;
 begin
 if not app_private.can_manage_ngos() then raise exception 'POEM admin access required'; end if;
 if app_private.geo_rank(p_kind) is null or length(trim(p_name)) not between 2 and 120 or length(trim(p_code)) not between 1 and 80 or length(p_source)>1000 or p_active is null then raise exception 'Invalid geography'; end if;
 if p_kind='province' and p_parent is not null then raise exception 'Province cannot have a parent'; end if;
 if p_kind<>'province' and not exists(select 1 from public.geographies where id=p_parent and app_private.geo_rank(kind)=app_private.geo_rank(p_kind)-1) then raise exception 'Invalid parent level'; end if;
 if p_active and p_parent is not null and not app_private.geo_active(p_parent) then raise exception 'Parent hierarchy is inactive'; end if;
 if p_id is null then
 insert into public.geographies(parent_id,kind,name,code,source_note,active) values(p_parent,p_kind,trim(p_name),trim(p_code),p_source,p_active) returning id into result_id;
 else
 select * into current_row from public.geographies where id=p_id for update;
 if not found then raise exception 'Area not found'; end if;
 if current_row.parent_id is distinct from p_parent or current_row.kind<>p_kind then raise exception 'Existing areas cannot be moved to a different parent or level'; end if;
 update public.geographies set name=trim(p_name),code=trim(p_code),source_note=p_source,active=p_active where id=p_id returning id into result_id;
 end if;
 insert into public.audit_events(actor_id,action,detail) values(auth.uid(),'geography_saved',jsonb_build_object('id',result_id,'name',p_name,'active',p_active));return result_id;
 end; $$;
