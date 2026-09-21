-- FieldLance 2.28: scoped organization administration; no public role enrollment.
alter table public.organizations add column settings_version integer not null default 1;
alter table public.organization_memberships add column version integer not null default 1;
create function app_private.org_settings_access(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.is_active() and (app_private.ngo_admin(p_org) or app_private.can_manage_ngos());
$$;
grant execute on function app_private.org_settings_access(uuid) to authenticated;
revoke all on function app_private.org_settings_access(uuid) from public,anon;
create function public.save_organization_settings(p_org uuid,p_data jsonb,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare o public.organizations;
begin
 select * into o from public.organizations where id=p_org for update;
 if not found or not app_private.org_settings_access(p_org) then raise exception 'Organization settings permission required'; end if;
 if o.settings_version is distinct from p_version then raise exception 'Settings changed; reload before saving'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>8000 or length(trim(coalesce(p_data->>'name',''))) not between 2 and 200 then raise exception 'Valid organization details required'; end if;
 if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('name','registration_number','contact_person','email','phone','address')) then raise exception 'Unsupported settings field'; end if;
 update public.organizations set name=trim(p_data->>'name'),registration_number=coalesce(p_data->>'registration_number',''),contact_person=coalesce(p_data->>'contact_person',''),email=coalesce(p_data->>'email',''),phone=coalesce(p_data->>'phone',''),address=coalesce(p_data->>'address',''),settings_version=settings_version+1 where id=p_org;
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),p_org,'organization_settings_saved',jsonb_build_object('version',p_version));
end;$$;
-- Every write, including legacy staff edits, advances conflict versions.
create function app_private.org_settings_versions() returns trigger language plpgsql set search_path='' as $$ begin
 new.settings_version:=old.settings_version+1;return new;end;$$;
create trigger organization_settings_versions before update of name,registration_number,contact_person,email,phone,address on public.organizations for each row execute function app_private.org_settings_versions();
create function app_private.org_membership_versions() returns trigger language plpgsql set search_path='' as $$ begin new.version:=old.version+1;return new;end;$$;
create trigger organization_membership_versions before update on public.organization_memberships for each row execute function app_private.org_membership_versions();
create table public.organization_invitations(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),user_id uuid not null references public.accounts(id),role text not null check(role in ('ngo_admin','member')),status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled')),created_by uuid not null references public.accounts(id),created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '7 days',version integer not null default 1
);
alter table public.organization_invitations add column organization_name text not null default '', add column recipient_name text not null default '';
create unique index org_invitation_pending on public.organization_invitations(organization_id,user_id) where status='pending';
alter table public.organization_invitations enable row level security;
revoke all on public.organization_invitations from anon,authenticated;
grant select on public.organization_invitations to authenticated;
create policy org_invitation_read on public.organization_invitations for select to authenticated using(app_private.is_active() and (user_id=auth.uid() or app_private.org_settings_access(organization_id)));
create function public.invite_organization_member(p_org uuid,p_email text,p_role text) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;result uuid;
begin
 perform 1 from public.organizations where id=p_org for update;
 if not app_private.org_settings_access(p_org) then raise exception 'Organization administration required';end if;
 if p_role is null or p_role not in ('ngo_admin','member') then raise exception 'Valid role required';end if;
 select id into target from public.accounts where lower(email)=lower(trim(p_email)) and status='active';
 if target is null or target=auth.uid() then raise exception 'Choose another active registered account';end if;
 if exists(select 1 from public.organization_memberships where organization_id=p_org and user_id=target) then raise exception 'Account already has membership; use team management';end if;
 update public.organization_invitations set status='cancelled',version=version+1 where organization_id=p_org and user_id=target and status='pending' and expires_at<=now();
 insert into public.organization_invitations(organization_id,user_id,role,created_by,organization_name,recipient_name) values(p_org,target,p_role,auth.uid(),(select name from public.organizations where id=p_org),(select coalesce(nullif(full_name,''),email) from public.accounts where id=target)) returning id into result;
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),target,p_org,'organization_member_invited',jsonb_build_object('invitation',result,'role',p_role));
 return result;
end;$$;
create function public.respond_organization_invitation(p_id uuid,p_decision text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare i public.organization_invitations;
begin
 if not app_private.is_active() then raise exception 'Active account required';end if;
 select * into i from public.organization_invitations where id=p_id;
 perform 1 from public.organizations where id=i.organization_id for update;
 select * into i from public.organization_invitations where id=p_id for update;
 if not found or i.status<>'pending' or i.version is distinct from p_version then raise exception 'Invitation changed or unavailable';end if;
 if p_decision='cancelled' then
 if not app_private.org_settings_access(i.organization_id) then raise exception 'Organization administration required';end if;
 elsif p_decision in ('accepted','declined') then
 if i.user_id<>auth.uid() or i.expires_at<=now() then raise exception 'Current recipient invitation required';end if;
 if p_decision='accepted' then
 if not exists(select 1 from public.organizations where id=i.organization_id and status='active') or not exists(select 1 from public.accounts where id=i.created_by and status='active') or not exists(select 1 from public.accounts a where a.id=i.created_by and (a.platform_role in ('super_admin','admin','ngo_manager') or exists(select 1 from public.organization_memberships m where m.organization_id=i.organization_id and m.user_id=a.id and m.role='ngo_admin' and m.status='active'))) then raise exception 'Invitation issuer access no longer active';end if;
 insert into public.organization_memberships(organization_id,user_id,role,status) values(i.organization_id,i.user_id,i.role,'active');
 end if;
 else raise exception 'Valid invitation decision required';end if;
 update public.organization_invitations set status=p_decision,version=version+1 where id=p_id;
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),i.user_id,i.organization_id,'organization_invitation_responded',jsonb_build_object('invitation',i.id,'decision',p_decision));
end;$$;
create function public.manage_organization_member(p_org uuid,p_user uuid,p_role text,p_status text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare m public.organization_memberships;
begin
 perform 1 from public.organizations where id=p_org for update;
 if not app_private.org_settings_access(p_org) then raise exception 'Organization administration required';end if;
 if p_role is null or p_status is null or p_role not in ('ngo_admin','member') or p_status not in ('active','suspended') then raise exception 'Valid membership required';end if;
 select * into m from public.organization_memberships where organization_id=p_org and user_id=p_user for update;
 if not found or m.version is distinct from p_version then raise exception 'Membership changed; reload';end if;
 if m.role='ngo_admin' and m.status='active' and (p_role<>'ngo_admin' or p_status<>'active') and not exists(select 1 from public.organization_memberships x join public.accounts a on a.id=x.user_id where x.organization_id=p_org and x.user_id<>p_user and x.role='ngo_admin' and x.status='active' and a.status='active') then raise exception 'Keep at least one active organization admin';end if;
 update public.organization_memberships set role=p_role,status=p_status where organization_id=p_org and user_id=p_user;
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),p_user,p_org,'organization_team_changed',jsonb_build_object('role',p_role,'status',p_status));
end;$$;
create function public.organization_team(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if not app_private.org_settings_access(p_org) then raise exception 'Organization administration required';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',a.full_name,'email',a.email,'role',m.role,'status',m.status,'version',m.version) order by a.full_name) from public.organization_memberships m join public.accounts a on a.id=m.user_id where m.organization_id=p_org),'[]'::jsonb);
end;$$;
create table public.organization_compliance_documents(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),uploaded_by uuid not null references public.accounts(id),file_name text not null,mime_type text not null,byte_size bigint not null,object_path text not null unique,state text not null default 'uploading' check(state in ('uploading','ready')),review_status text not null default 'pending' check(review_status in ('pending','accepted','rejected')),review_note text not null default '',expires_on date,version integer not null default 1,created_at timestamptz not null default now()
);
alter table public.organization_compliance_documents enable row level security;
revoke all on public.organization_compliance_documents from anon,authenticated;
grant select on public.organization_compliance_documents to authenticated;
create policy org_compliance_read on public.organization_compliance_documents for select to authenticated using(app_private.org_settings_access(organization_id));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('fieldlance-org-compliance','fieldlance-org-compliance',false,5242880,array['application/pdf','image/png','image/jpeg']);
create function app_private.org_document_access(p_path text,p_write boolean) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organization_compliance_documents d where d.object_path=p_path and app_private.org_settings_access(d.organization_id) and (case when p_write then d.state='uploading' and d.uploaded_by=auth.uid() else d.state='ready' end));
$$;
revoke all on function app_private.org_document_access(text,boolean) from public,anon;
grant execute on function app_private.org_document_access(text,boolean) to authenticated;
create policy org_compliance_storage_insert on storage.objects for insert to authenticated with check(bucket_id='fieldlance-org-compliance' and app_private.org_document_access(name,true));
create policy org_compliance_storage_read on storage.objects for select to authenticated using(bucket_id='fieldlance-org-compliance' and app_private.org_document_access(name,false));
create function public.reserve_organization_document(p_org uuid,p_name text,p_type text,p_bytes bigint,p_expires date) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.organization_compliance_documents;new_id uuid:=gen_random_uuid();begin
 perform 1 from public.organizations where id=p_org for update;
 if not app_private.org_settings_access(p_org) then raise exception 'Organization administration required';end if;
 if p_name is null or length(trim(p_name)) not between 1 and 200 or p_type is null or p_type not in ('application/pdf','image/png','image/jpeg') or p_bytes is null or p_bytes not between 1 and 5242880 or (p_expires is not null and not isfinite(p_expires)) then raise exception 'PDF, PNG or JPG up to 5 MiB required';end if;
 if (select count(*) from public.organization_compliance_documents where organization_id=p_org)>99 then raise exception 'Document limit reached';end if;
 insert into public.organization_compliance_documents(id,organization_id,uploaded_by,file_name,mime_type,byte_size,object_path,expires_on) values(new_id,p_org,auth.uid(),trim(p_name),p_type,p_bytes,p_org::text||'/'||new_id::text,p_expires) returning * into d;return to_jsonb(d);
end;$$;
create function public.finish_organization_document(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare d public.organization_compliance_documents;meta jsonb;begin
 select * into d from public.organization_compliance_documents where id=p_id for update;
 if not found or not app_private.org_settings_access(d.organization_id) or d.uploaded_by<>auth.uid() then raise exception 'Document upload permission required';end if;
 if d.state='ready' then return;end if;
 select metadata into meta from storage.objects where bucket_id='fieldlance-org-compliance' and name=d.object_path;
 if meta is null or coalesce((meta->>'size')::bigint,-1)<>d.byte_size or coalesce(meta->>'mimetype','')<>d.mime_type then raise exception 'Uploaded bytes do not match reservation';end if;
 update public.organization_compliance_documents set state='ready',version=version+1 where id=p_id;
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),d.organization_id,'organization_document_uploaded',jsonb_build_object('document',p_id));
end;$$;
create function public.review_organization_document(p_id uuid,p_status text,p_note text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare d public.organization_compliance_documents;begin
 if not app_private.can_manage_ngos() then raise exception 'FieldLance organization review permission required';end if;
 select * into d from public.organization_compliance_documents where id=p_id for update;
 if not found or d.state<>'ready' or d.version is distinct from p_version then raise exception 'Document changed; reload';end if;
 if d.uploaded_by=auth.uid() or exists(select 1 from public.organization_memberships where organization_id=d.organization_id and user_id=auth.uid() and status='active') then raise exception 'Independent reviewer required';end if;
 if p_status is null or p_status not in ('accepted','rejected') or p_note is null or length(trim(p_note)) not between 5 and 1000 then raise exception 'Decision and reason required';end if;
 update public.organization_compliance_documents set review_status=p_status,review_note=trim(p_note),version=version+1 where id=p_id;
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),d.organization_id,'organization_document_reviewed',jsonb_build_object('document',p_id,'decision',p_status,'note',trim(p_note)));
end;$$;
revoke all on function public.save_organization_settings(uuid,jsonb,integer),public.invite_organization_member(uuid,text,text),public.respond_organization_invitation(uuid,text,integer),public.manage_organization_member(uuid,uuid,text,text,integer),public.organization_team(uuid),public.reserve_organization_document(uuid,text,text,bigint,date),public.finish_organization_document(uuid),public.review_organization_document(uuid,text,text,integer) from public,anon;
grant execute on function public.save_organization_settings(uuid,jsonb,integer),public.invite_organization_member(uuid,text,text),public.respond_organization_invitation(uuid,text,integer),public.manage_organization_member(uuid,uuid,text,text,integer),public.organization_team(uuid),public.reserve_organization_document(uuid,text,text,bigint,date),public.finish_organization_document(uuid),public.review_organization_document(uuid,text,text,integer) to authenticated;

-- POEM 2.12.1: finer NGO operating areas; preserve already-saved inactive areas.
create or replace function public.save_ngo_operations(p_org uuid,p_areas uuid[],p_programs text[],p_version integer) returns void language plpgsql security definer set search_path='' as $$
 declare v integer; label text;
 begin
 if not app_private.org_settings_access(p_org) then raise exception 'NGO management permission required'; end if;
 if p_areas is null or p_programs is null or cardinality(p_areas)>100 or cardinality(p_programs)>50 then raise exception 'Maximum 100 areas and 50 programs'; end if;
 select operations_version into v from public.organizations where id=p_org for update;
 if not found then raise exception 'Organization not found'; end if;
 if v is distinct from p_version then raise exception 'Operations changed. Reload before saving.'; end if;
 if exists(select 1 from unnest(p_areas) g where not exists(select 1 from public.geographies where id=g and kind in ('district','taluka','uc','village','ward') and (app_private.geo_active(id) or exists(select 1 from public.organization_areas old where old.organization_id=p_org and old.geography_id=g)))) then raise exception 'Choose active districts, talukas, union councils, villages or wards; existing inactive areas may be retained'; end if;
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
