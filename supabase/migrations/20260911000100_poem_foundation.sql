create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;
create table public.accounts (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null,
 full_name text not null default '',
 platform_role text not null default 'volunteer' check(platform_role in ('volunteer','admin','super_admin')),
 status text not null default 'active' check(status in ('active','suspended')),
 created_at timestamptz not null default now()
);
create table public.volunteer_profiles (
 user_id uuid primary key references public.accounts(id) on delete cascade,
 details jsonb not null default '{}'::jsonb,
 status text not null default 'draft' check(status in ('draft','pending','verified','correction_required','suspended')),
 review_note text not null default '',
 reviewed_by uuid references public.accounts(id),
 reviewed_at timestamptz,
 version integer not null default 1,
 updated_at timestamptz not null default now()
);
create table public.organizations (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 200),
 registration_number text not null default '',contact_person text not null default '',email text not null default '',
 phone text not null default '',address text not null default '',areas text not null default '',programs text not null default '',
 status text not null default 'pending' check(status in ('pending','active','inactive','suspended')),
 created_at timestamptz not null default now()
);
create table public.organization_memberships (
 organization_id uuid references public.organizations(id) on delete cascade,
 user_id uuid references public.accounts(id) on delete cascade,
 role text not null check(role in ('ngo_admin','member')),
 status text not null default 'active' check(status in ('active','suspended')),
 primary key(organization_id,user_id)
);
create index memberships_user on public.organization_memberships(user_id);
create table public.profile_shares (
 user_id uuid references public.accounts(id) on delete cascade,
 organization_id uuid references public.organizations(id) on delete cascade,
 consent_version text not null default 'profile-sharing-v1',
 granted_at timestamptz not null default now(),
 primary key(user_id,organization_id)
);
create index shares_org on public.profile_shares(organization_id);
create table public.audit_events (
 id bigint generated always as identity primary key,
 actor_id uuid references public.accounts(id),
 subject_id uuid references public.accounts(id),
 organization_id uuid references public.organizations(id),
 action text not null, detail jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index audit_time on public.audit_events(created_at desc);
create function app_private.is_active() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.accounts where id=auth.uid() and status='active'); $$;
create function app_private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.accounts where id=auth.uid() and status='active' and platform_role in ('admin','super_admin')); $$;
create function app_private.is_super() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.accounts where id=auth.uid() and status='active' and platform_role='super_admin'); $$;
create function app_private.ngo_admin(org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.is_active() and exists(select 1 from public.organization_memberships m join public.organizations o on o.id=m.organization_id where m.organization_id=org and m.user_id=auth.uid() and m.role='ngo_admin' and m.status='active' and o.status='active'); $$;
create function app_private.can_read_profile(subject uuid) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.is_active() and (subject=auth.uid() or app_private.is_admin() or exists(select 1 from public.profile_shares s join public.accounts a on a.id=s.user_id join public.volunteer_profiles p on p.user_id=s.user_id where s.user_id=subject and a.status='active' and p.status<>'suspended' and app_private.ngo_admin(s.organization_id))); $$;
create function app_private.on_signup() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 insert into public.accounts(id,email,full_name) values(new.id,coalesce(new.email,''),left(coalesce(new.raw_user_meta_data->>'full_name',''),200));
 insert into public.volunteer_profiles(user_id,details) values(new.id,jsonb_build_object('full_name',left(coalesce(new.raw_user_meta_data->>'full_name',''),200)));
 insert into public.audit_events(actor_id,subject_id,action) values(new.id,new.id,'account_registered');return new; end; $$;
create trigger poem_user_created after insert on auth.users for each row execute function app_private.on_signup();
create function app_private.sync_email() returns trigger language plpgsql security definer set search_path='' as $$
 begin update public.accounts set email=coalesce(new.email,'') where id=new.id; return new; end; $$;
create trigger poem_email_updated after update of email on auth.users for each row execute function app_private.sync_email();
alter table public.accounts enable row level security;
alter table public.volunteer_profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.profile_shares enable row level security;
alter table public.audit_events enable row level security;
create policy accounts_read on public.accounts for select to authenticated using(id=auth.uid() or app_private.is_admin());
create policy profiles_read on public.volunteer_profiles for select to authenticated using(app_private.can_read_profile(user_id));
-- Active users see the partner directory; contact fields are partner operational contacts, not beneficiary data.
create policy org_read on public.organizations for select to authenticated using(app_private.is_active() and (status='active' or app_private.is_admin() or exists(select 1 from public.organization_memberships m where m.organization_id=id and m.user_id=auth.uid()) or exists(select 1 from public.profile_shares s where s.organization_id=id and s.user_id=auth.uid())));
create policy memberships_read on public.organization_memberships for select to authenticated using(app_private.is_active() and (user_id=auth.uid() or app_private.is_admin()));
create policy shares_read on public.profile_shares for select to authenticated using(app_private.is_active() and (user_id=auth.uid() or app_private.is_admin() or app_private.ngo_admin(organization_id)));
create policy audit_read on public.audit_events for select to authenticated using(app_private.is_active() and (subject_id=auth.uid() or app_private.is_admin()));
revoke all on public.accounts,public.volunteer_profiles,public.organizations,public.organization_memberships,public.profile_shares,public.audit_events from anon,authenticated;
grant select on public.accounts,public.volunteer_profiles,public.organizations,public.organization_memberships,public.profile_shares,public.audit_events to authenticated;

create function public.save_my_profile(p_details jsonb,p_submit boolean,p_version integer) returns void language plpgsql security definer set search_path='' as $$
 declare current_row public.volunteer_profiles; next_status text;
 begin
 if not app_private.is_active() then raise exception 'Account is not active'; end if;
 if jsonb_typeof(p_details) <> 'object' or octet_length(p_details::text)>20000 then raise exception 'Invalid or oversized profile'; end if;
 if exists(select 1 from jsonb_object_keys(p_details) k where k not in ('full_name','phone','area','education','skills','languages','experience','availability','preference','transport','smartphone','preferred_areas','references','bio')) then raise exception 'Unsupported profile field'; end if;
 if exists(select 1 from jsonb_each(p_details) x where jsonb_typeof(x.value)<>'string' or length(x.value#>>'{}')>4000) then raise exception 'Profile fields must be text, maximum 4000 characters each'; end if;
 if p_submit and (length(trim(coalesce(p_details->>'full_name','')))<2 or length(trim(coalesce(p_details->>'phone','')))<7 or length(trim(coalesce(p_details->>'area','')))<2) then raise exception 'Full name, phone and area are required'; end if;
 select * into current_row from public.volunteer_profiles where user_id=auth.uid() for update;
 if current_row.status='suspended' then raise exception 'Your profile is suspended. Contact POEM.'; end if;
 if current_row.version is distinct from p_version then raise exception 'Profile changed in another session. Reload before saving.'; end if;
 next_status:=case when p_submit then 'pending' else 'draft' end;
 update public.volunteer_profiles set details=p_details,status=next_status,version=version+1,updated_at=now(),reviewed_by=null,reviewed_at=null,review_note='' where user_id=auth.uid();
 update public.accounts set full_name=left(coalesce(p_details->>'full_name',''),200) where id=auth.uid();
 insert into public.audit_events(actor_id,subject_id,action,detail) values(auth.uid(),auth.uid(),'profile_saved',jsonb_build_object('from',current_row.status,'to',next_status,'previous_version',p_version));
 end; $$;
create function public.review_profile(p_user_id uuid,p_status text,p_note text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
 declare old_status text; old_version integer;
 begin
 if not app_private.is_admin() then raise exception 'POEM admin access required'; end if;
 if p_user_id=auth.uid() then raise exception 'You cannot review your own profile'; end if;
 if p_status not in ('verified','correction_required','suspended') or length(trim(p_note))<3 or length(p_note)>2000 then raise exception 'Valid decision and review note required'; end if;
 select status,version into old_status,old_version from public.volunteer_profiles where user_id=p_user_id for update;
 if old_version is null then raise exception 'Profile not found'; end if;
 if old_version is distinct from p_version then raise exception 'Profile changed. Reload and review again.'; end if;
 if old_status='draft' and p_status='verified' then raise exception 'Draft profiles must be submitted before approval'; end if;
 update public.volunteer_profiles set status=p_status,review_note=p_note,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now(),version=version+1 where user_id=p_user_id;
 insert into public.audit_events(actor_id,subject_id,action,detail) values(auth.uid(),p_user_id,'profile_reviewed',jsonb_build_object('from',old_status,'to',p_status,'note',p_note));
 end; $$;
create function public.save_organization(p_id uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
 declare result_id uuid;
 begin
 if not app_private.is_admin() then raise exception 'POEM admin access required'; end if;
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
create function public.set_membership(p_org uuid,p_user uuid,p_role text,p_status text) returns void language plpgsql security definer set search_path='' as $$
 begin
 if not app_private.is_admin() then raise exception 'POEM admin access required'; end if;
 if p_role not in ('ngo_admin','member') or p_status not in ('active','suspended') then raise exception 'Invalid membership'; end if;
 insert into public.organization_memberships(organization_id,user_id,role,status) values(p_org,p_user,p_role,p_status) on conflict(organization_id,user_id) do update set role=excluded.role,status=excluded.status;
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),p_user,p_org,'membership_changed',jsonb_build_object('role',p_role,'status',p_status));
 end; $$;
create function public.set_profile_sharing(p_org uuid,p_allowed boolean) returns void language plpgsql security definer set search_path='' as $$
 begin
 if not app_private.is_active() then raise exception 'Account is not active'; end if;
 if p_allowed then
 if not exists(select 1 from public.organizations where id=p_org and status='active') then raise exception 'Organization is not active'; end if;
 insert into public.profile_shares(user_id,organization_id) values(auth.uid(),p_org) on conflict do nothing;
 else delete from public.profile_shares where user_id=auth.uid() and organization_id=p_org; end if;
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),auth.uid(),p_org,'profile_sharing_changed',jsonb_build_object('allowed',p_allowed,'consent_version','profile-sharing-v1'));
 end; $$;
create function public.set_account_access(p_user uuid,p_role text,p_status text) returns void language plpgsql security definer set search_path='' as $$
 begin
 perform pg_advisory_xact_lock(hashtext('poem-account-access'));
 if not app_private.is_super() then raise exception 'Super admin access required'; end if;
 if p_user=auth.uid() then raise exception 'Cannot change your own platform access'; end if;
 if p_role not in ('volunteer','admin','super_admin') or p_status not in ('active','suspended') then raise exception 'Invalid account access'; end if;
 update public.accounts set platform_role=p_role,status=p_status where id=p_user;
 if not found then raise exception 'Account not found'; end if;
 insert into public.audit_events(actor_id,subject_id,action,detail) values(auth.uid(),p_user,'account_access_changed',jsonb_build_object('role',p_role,'status',p_status));
 end; $$;
-- Default function EXECUTE includes PUBLIC unless explicitly revoked.
revoke all on all functions in schema app_private from public,anon,authenticated;
grant execute on function app_private.is_active(),app_private.is_admin(),app_private.is_super(),app_private.ngo_admin(uuid),app_private.can_read_profile(uuid) to authenticated;
revoke all on function public.save_my_profile(jsonb,boolean,integer),public.review_profile(uuid,text,text,integer),public.save_organization(uuid,jsonb),public.set_membership(uuid,uuid,text,text),public.set_profile_sharing(uuid,boolean),public.set_account_access(uuid,text,text) from public,anon,authenticated;
grant execute on function public.save_my_profile(jsonb,boolean,integer),public.review_profile(uuid,text,text,integer),public.save_organization(uuid,jsonb),public.set_membership(uuid,uuid,text,text),public.set_profile_sharing(uuid,boolean),public.set_account_access(uuid,text,text) to authenticated;

-- Trusted server maintenance role; never expose its key to the browser.
grant all on public.accounts,public.volunteer_profiles,public.organizations,public.organization_memberships,public.profile_shares,public.audit_events to service_role;
grant all on sequence public.audit_events_id_seq to service_role;
