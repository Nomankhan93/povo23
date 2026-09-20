-- FieldLance 2.25.1. Additive migration: retain all legacy records and access.
alter table public.accounts
 add column onboarding_intent text not null default 'unknown' check(onboarding_intent in ('unknown','worker','organization')),
 add column worker_enrollment text not null default 'none' check(worker_enrollment in ('none','enrolled','legacy'));
-- A legacy profile is not evidence of explicit consent. Preserve access, label it
-- honestly, and allow its owner to explicitly confirm worker enrollment later.
update public.accounts a set worker_enrollment='legacy' where exists(select 1 from public.volunteer_profiles v where v.user_id=a.id);
update public.accounts a set onboarding_intent='organization' where exists(select 1 from public.partner_ngo_applications p where p.applicant_user_id=a.id) or exists(select 1 from public.organization_memberships m where m.user_id=a.id and m.role='ngo_admin' and m.status='active');

create or replace function app_private.on_signup() returns trigger language plpgsql security definer set search_path='' as $$
declare intent text;
begin
 -- This is an onboarding choice only. No metadata value can grant staff or NGO access.
 intent:=case when new.raw_user_meta_data->>'onboarding_intent'='organization' then 'organization' else 'worker' end;
 insert into public.accounts(id,email,full_name,onboarding_intent,worker_enrollment)
 values(new.id,coalesce(new.email,''),left(coalesce(new.raw_user_meta_data->>'full_name',''),200),intent,case when intent='worker' then 'enrolled' else 'none' end);
 if intent='worker' then
  insert into public.volunteer_profiles(user_id,details) values(new.id,jsonb_build_object('full_name',left(coalesce(new.raw_user_meta_data->>'full_name',''),200)));
 end if;
 insert into public.audit_events(actor_id,subject_id,action,detail) values(new.id,new.id,'account_registered',jsonb_build_object('onboarding_intent',intent));
 return new;
end;$$;

create function public.begin_workspace_onboarding(p_kind text) returns void language plpgsql security definer set search_path='' as $$
declare a public.accounts;
begin
 if not app_private.is_active() then raise exception 'Active account required'; end if;
 if p_kind is null or p_kind not in ('worker','organization') then raise exception 'Choose worker or organization'; end if;
 select * into a from public.accounts where id=auth.uid() for update;
 if a.status is distinct from 'active' then raise exception 'Active account required'; end if;
 if p_kind='worker' then
  if exists(select 1 from public.volunteer_profiles where user_id=auth.uid() and status='suspended') then raise exception 'Worker profile suspended'; end if;
  insert into public.volunteer_profiles(user_id,details) values(auth.uid(),jsonb_build_object('full_name',a.full_name)) on conflict(user_id) do nothing;
  update public.accounts set worker_enrollment='enrolled',onboarding_intent='worker' where id=auth.uid();
 else
  update public.accounts set onboarding_intent='organization' where id=auth.uid();
 end if;
 insert into public.audit_events(actor_id,subject_id,action,detail) values(auth.uid(),auth.uid(),'workspace_onboarding_started',jsonb_build_object('kind',p_kind));
end;$$;

create function public.my_workspace_access() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.accounts; items jsonb:='[]'::jsonb; org_items jsonb; project_items jsonb; applications jsonb; worker boolean;
begin
 select * into a from public.accounts where id=auth.uid();
 if not found then raise exception 'Account not found'; end if;
 if a.status<>'active' then return jsonb_build_object('workspaces','[]'::jsonb,'defaultScope','access','worker',false); end if;
 worker:=a.worker_enrollment in ('enrolled','legacy') and exists(select 1 from public.volunteer_profiles where user_id=a.id);
 if a.platform_role in ('admin','super_admin','volunteer_manager','ngo_manager','auditor','survey_manager') then
  items:=items||jsonb_build_array(jsonb_build_object('id','poem','label','FieldLance Staff'));
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id::text,'label',o.name||' — Organization') order by o.name,o.id),'[]'::jsonb) into org_items
 from public.organization_memberships m join public.organizations o on o.id=m.organization_id
 where m.user_id=a.id and m.role='ngo_admin' and m.status='active' and o.status='active';
 items:=items||org_items;
 select coalesce(jsonb_agg(jsonb_build_object('id','project:'||p.id::text,'label',p.title||' — Project workspace') order by p.title,p.id),'[]'::jsonb) into project_items
 from public.project_staff_assignments s join public.survey_projects p on p.id=s.project_id join public.organizations o on o.id=p.organization_id
 where s.user_id=a.id and s.status='active' and s.starts_at<=(now() at time zone 'UTC')::date and (s.ends_at is null or s.ends_at>=(now() at time zone 'UTC')::date) and o.status='active' and app_private.project_staff_active(p.id,null);
 items:=items||project_items;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'status',p.status,'name',p.organization_name,'organizationId',p.organization_id) order by p.updated_at desc),'[]'::jsonb) into applications
 from public.partner_ngo_applications p where p.applicant_user_id=a.id;
 if a.onboarding_intent='organization' or exists(select 1 from public.partner_ngo_applications p where p.applicant_user_id=a.id and p.status<>'approved') then
  items:=items||jsonb_build_array(jsonb_build_object('id','onboarding','label','Organization onboarding'));
 end if;
 if worker then items:=items||jsonb_build_array(jsonb_build_object('id','personal','label','Field Worker')); end if;
 return jsonb_build_object('workspaces',items,'defaultScope',coalesce(items->0->>'id','access'),'worker',worker,'enrollment',a.worker_enrollment,'intent',a.onboarding_intent,'applications',applications);
end;$$;
revoke all on function public.begin_workspace_onboarding(text),public.my_workspace_access() from public,anon,authenticated;
grant execute on function public.begin_workspace_onboarding(text),public.my_workspace_access() to authenticated;
-- accounts has SELECT-only grants for authenticated; these fields cannot be
-- changed directly. Organization/staff RLS and approval RPCs remain authoritative.
