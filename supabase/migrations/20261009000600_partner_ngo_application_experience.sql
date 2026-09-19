-- FieldLance 2.19.7 — Partner NGO Application Experience
-- Adds organization-logo lifecycle support and keeps the existing onboarding workflow/RLS model intact.
-- Also expands supporting-document categories and tightens final submission validation for registration type.

alter table public.partner_ngo_applications
  add column if not exists logo_path text not null default '',
  add column if not exists logo_updated_at timestamptz;

alter table public.organizations
  add column if not exists logo_path text not null default '',
  add column if not exists logo_updated_at timestamptz;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'fieldlance-organization-logos',
  'fieldlance-organization-logos',
  false,
  2097152,
  array['image/jpeg','image/png','image/webp']
)
on conflict(id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

create or replace function app_private.organization_logo_access(path text, operation text)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  application_id uuid;
  expected text;
  a public.partner_ngo_applications;
begin
  if not app_private.is_active() then return false; end if;
  begin
    application_id:=split_part(path,'/',1)::uuid;
  exception when others then
    return false;
  end;
  expected:=application_id::text||'/logo';
  if path is distinct from expected or split_part(path,'/',3)<>'' then return false; end if;

  select * into a
  from public.partner_ngo_applications
  where id=application_id;
  if not found then return false; end if;

  if operation='read' then
    return a.applicant_user_id=auth.uid()
      or app_private.can_manage_ngos()
      or (
        a.status='approved'
        and a.organization_id is not null
        and exists(select 1 from public.organizations o where o.id=a.organization_id and o.status='active')
      );
  elsif operation in ('write','delete') then
    return a.applicant_user_id=auth.uid()
      and a.status in ('draft','changes_requested');
  end if;
  return false;
end;
$$;

revoke all on function app_private.organization_logo_access(text,text) from public,anon,authenticated;
grant execute on function app_private.organization_logo_access(text,text) to authenticated;

drop policy if exists fieldlance_organization_logo_read on storage.objects;
drop policy if exists fieldlance_organization_logo_insert on storage.objects;
drop policy if exists fieldlance_organization_logo_update on storage.objects;
drop policy if exists fieldlance_organization_logo_delete on storage.objects;

create policy fieldlance_organization_logo_read on storage.objects
for select to authenticated
using(bucket_id='fieldlance-organization-logos' and app_private.organization_logo_access(name,'read'));

create policy fieldlance_organization_logo_insert on storage.objects
for insert to authenticated
with check(bucket_id='fieldlance-organization-logos' and app_private.organization_logo_access(name,'write'));

create policy fieldlance_organization_logo_update on storage.objects
for update to authenticated
using(bucket_id='fieldlance-organization-logos' and app_private.organization_logo_access(name,'write'))
with check(bucket_id='fieldlance-organization-logos' and app_private.organization_logo_access(name,'write'));

create policy fieldlance_organization_logo_delete on storage.objects
for delete to authenticated
using(bucket_id='fieldlance-organization-logos' and app_private.organization_logo_access(name,'delete'));

create or replace function public.set_partner_ngo_application_logo(p_application uuid,p_present boolean)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  a public.partner_ngo_applications;
  path text;
  meta jsonb;
begin
  if not app_private.is_active() then raise exception 'Active account required'; end if;
  select * into a
  from public.partner_ngo_applications
  where id=p_application and applicant_user_id=auth.uid()
  for update;
  if not found then raise exception 'Partner NGO application not found'; end if;
  if a.status not in ('draft','changes_requested') then raise exception 'Editable Partner NGO application required'; end if;

  path:=a.id::text||'/logo';
  if p_present then
    select metadata into meta
    from storage.objects
    where bucket_id='fieldlance-organization-logos' and name=path;
    if meta is null then raise exception 'Uploaded organization logo is missing'; end if;
    if coalesce((meta->>'size')::bigint,0) not between 1 and 2097152
       or coalesce(meta->>'mimetype','') not in ('image/jpeg','image/png','image/webp') then
      raise exception 'Organization logo must be JPG, PNG or WebP up to 2 MiB';
    end if;
    update public.partner_ngo_applications
    set logo_path=path,logo_updated_at=now(),updated_at=now()
    where id=a.id;
  else
    if exists(select 1 from storage.objects where bucket_id='fieldlance-organization-logos' and name=path) then
      raise exception 'Remove organization logo bytes before clearing the logo';
    end if;
    update public.partner_ngo_applications
    set logo_path='',logo_updated_at=now(),updated_at=now()
    where id=a.id;
  end if;

  insert into public.audit_events(actor_id,subject_id,action,detail)
  values(
    auth.uid(),auth.uid(),
    case when p_present then 'partner_ngo_logo_saved' else 'partner_ngo_logo_removed' end,
    jsonb_build_object('application',a.id)
  );
end;
$$;

revoke all on function public.set_partner_ngo_application_logo(uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_partner_ngo_application_logo(uuid,boolean) to authenticated;

create or replace function app_private.sync_partner_ngo_logo_on_approval()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status='approved' and new.organization_id is not null
     and (old.status is distinct from new.status or old.organization_id is distinct from new.organization_id or old.logo_path is distinct from new.logo_path) then
    update public.organizations
    set logo_path=new.logo_path,logo_updated_at=new.logo_updated_at
    where id=new.organization_id;
  end if;
  return new;
end;
$$;

revoke all on function app_private.sync_partner_ngo_logo_on_approval() from public,anon,authenticated;

drop trigger if exists fieldlance_partner_ngo_logo_approval_sync on public.partner_ngo_applications;
create trigger fieldlance_partner_ngo_logo_approval_sync
after update on public.partner_ngo_applications
for each row execute function app_private.sync_partner_ngo_logo_on_approval();

alter table public.partner_ngo_application_documents
  drop constraint if exists partner_ngo_application_documents_kind_check;
alter table public.partner_ngo_application_documents
  add constraint partner_ngo_application_documents_kind_check
  check(kind in ('registration_proof','authorization_letter','tax_document','organization_profile','financial_document','other'));

create or replace function public.begin_partner_ngo_document_upload(p_application uuid,p_name text,p_type text,p_bytes bigint,p_kind text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 a public.partner_ngo_applications;
 d public.partner_ngo_application_documents;
 new_id uuid:=gen_random_uuid();
 suffix text;
begin
 if not app_private.is_active() then raise exception 'Active account required'; end if;
 select * into a from public.partner_ngo_applications where id=p_application and applicant_user_id=auth.uid() for update;
 if not found or a.status not in ('draft','changes_requested') then raise exception 'Editable NGO application required'; end if;
 if p_name is null or length(trim(p_name)) not between 1 and 255 or p_type not in ('application/pdf','image/jpeg','image/png') or p_bytes not between 1 and 5242880
    or p_kind not in ('registration_proof','authorization_letter','tax_document','organization_profile','financial_document','other') then raise exception 'Valid PDF/JPG/PNG application document up to 5 MiB required'; end if;
 if (select count(*) from public.partner_ngo_application_documents where application_id=a.id and state<>'deleted')>=20 then raise exception 'Maximum 20 current application documents'; end if;
 suffix:=case p_type when 'application/pdf' then '.pdf' when 'image/jpeg' then '.jpg' else '.png' end;
 insert into public.partner_ngo_application_documents(id,application_id,applicant_user_id,object_path,file_name,mime_type,byte_size,kind)
 values(new_id,a.id,auth.uid(),auth.uid()::text||'/'||a.id::text||'/'||new_id::text||suffix,trim(p_name),p_type,p_bytes,p_kind)
 returning * into d;
 return to_jsonb(d);
end;
$$;

create or replace function public.submit_partner_ngo_application(p_id uuid,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare a public.partner_ngo_applications;
begin
 if not app_private.is_active() then raise exception 'Active account required'; end if;
 select * into a from public.partner_ngo_applications where id=p_id and applicant_user_id=auth.uid() for update;
 if not found then raise exception 'NGO application not found'; end if;
 if a.status not in ('draft','changes_requested') then raise exception 'Application is not ready for submission'; end if;
 if a.version is distinct from p_version then raise exception 'NGO application changed. Reload before submitting.'; end if;
 if length(trim(a.organization_name))<2 or length(trim(a.registration_number))<2 or length(trim(a.legal_type))<2
    or length(trim(a.representative_name))<2 or length(trim(a.representative_title))<2 or length(trim(a.email))<5 or strpos(a.email,'@')<2
    or length(trim(a.phone))<7 or length(trim(a.address))<10 or cardinality(a.operating_area_ids)<1 or cardinality(a.program_names)<1 then
  raise exception 'Complete organization, registration type, representative, contact, address, program and operating-area details before submission';
 end if;
 if exists(select 1 from public.partner_ngo_application_documents d where d.application_id=a.id and d.state in ('uploading','deleting')) then
  raise exception 'Finish pending document uploads or removals before submission';
 end if;
 if not exists(select 1 from public.partner_ngo_application_documents d where d.application_id=a.id and d.state='ready' and d.kind='registration_proof') then
  raise exception 'Upload registration or legal proof before submission';
 end if;
 update public.partner_ngo_applications set status='submitted',submitted_at=now(),updated_at=now(),version=version+1 where id=a.id;
 insert into public.notifications(user_id,title,body)
 select id,'Partner NGO application submitted','A new Partner NGO application is ready for FieldLance review.'
 from public.accounts where status='active' and platform_role in ('super_admin','admin','ngo_manager') and id<>auth.uid();
 insert into public.audit_events(actor_id,subject_id,action,detail)
 values(auth.uid(),auth.uid(),'partner_ngo_application_submitted',jsonb_build_object('application',a.id));
end;
$$;

revoke all on function public.begin_partner_ngo_document_upload(uuid,text,text,bigint,text),public.submit_partner_ngo_application(uuid,integer) from public,anon,authenticated;
grant execute on function public.begin_partner_ngo_document_upload(uuid,text,text,bigint,text),public.submit_partner_ngo_application(uuid,integer) to authenticated;

-- Re-emit the review RPCs so organization-onboarding responses no longer surface the retired POEM product name.
create or replace function public.review_partner_ngo_document(p_id uuid,p_status text,p_note text,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare d public.partner_ngo_application_documents;
begin
 if not app_private.can_manage_ngos() then raise exception 'FieldLance NGO management permission required'; end if;
 if p_status not in ('accepted','rejected') or p_note is null or length(trim(p_note)) not between 3 and 2000 then raise exception 'Valid document review decision and note required'; end if;
 select * into d from public.partner_ngo_application_documents where id=p_id for update;
 if not found or d.state<>'ready' then raise exception 'Ready application document not found'; end if;
 if d.applicant_user_id=auth.uid() then raise exception 'You cannot review your own NGO application document'; end if;
 if not exists(select 1 from public.partner_ngo_applications a where a.id=d.application_id and a.status='submitted') then raise exception 'Submitted NGO application required for document review'; end if;
 if d.version is distinct from p_version then raise exception 'Application document changed. Reload before reviewing.'; end if;
 update public.partner_ngo_application_documents set review_status=p_status,review_note=trim(p_note),reviewed_by=auth.uid(),reviewed_at=now(),version=version+1 where id=d.id;
 insert into public.audit_events(actor_id,subject_id,action,detail) values(auth.uid(),d.applicant_user_id,'partner_ngo_document_reviewed',jsonb_build_object('application',d.application_id,'document',d.id,'status',p_status));
end;
$$;

create or replace function public.review_partner_ngo_application(p_id uuid,p_decision text,p_note text,p_version integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 a public.partner_ngo_applications;
 org_id uuid;
 area_label text;
 program_label text;
begin
 if not app_private.can_manage_ngos() then raise exception 'FieldLance NGO management permission required'; end if;
 if p_decision not in ('changes_requested','approved','rejected') or p_note is null or length(trim(p_note)) not between 3 and 2000 then raise exception 'Valid NGO application decision and note required'; end if;
 select * into a from public.partner_ngo_applications where id=p_id for update;
 if not found then raise exception 'NGO application not found'; end if;
 if a.applicant_user_id=auth.uid() then raise exception 'You cannot review your own NGO application'; end if;
 if a.status<>'submitted' then raise exception 'Submitted NGO application required'; end if;
 if a.version is distinct from p_version then raise exception 'NGO application changed. Reload before reviewing.'; end if;
 if p_decision='approved' then
  if not exists(select 1 from public.partner_ngo_application_documents d where d.application_id=a.id and d.state='ready' and d.kind='registration_proof' and d.review_status='accepted') then
   raise exception 'Accept registration/legal proof before approving the NGO';
  end if;
  if exists(select 1 from public.partner_ngo_application_documents d where d.application_id=a.id and d.state='ready' and d.review_status<>'accepted') then
   raise exception 'Review every current application document before approving the NGO';
  end if;
  if a.organization_id is not null then raise exception 'Application is already linked to an organization'; end if;
  select string_agg(g.name,', ' order by g.name) into area_label from public.geographies g where g.id=any(a.operating_area_ids);
  select string_agg(x,', ' order by x) into program_label from unnest(a.program_names) x;
  insert into public.organizations(name,registration_number,contact_person,email,phone,address,areas,programs,status)
   values(a.organization_name,a.registration_number,a.representative_name,a.email,a.phone,a.address,coalesce(area_label,''),coalesce(program_label,''),'active')
   returning id into org_id;
  insert into public.organization_areas(organization_id,geography_id) select org_id,x from unnest(a.operating_area_ids) x on conflict do nothing;
  insert into public.organization_programs(organization_id,name) select org_id,trim(x) from unnest(a.program_names) x on conflict do nothing;
  insert into public.organization_memberships(organization_id,user_id,role,status)
   values(org_id,a.applicant_user_id,'ngo_admin','active')
   on conflict(organization_id,user_id) do update set role='ngo_admin',status='active';
  update public.partner_ngo_applications set organization_id=org_id,status='approved',review_note=trim(p_note),reviewed_by=auth.uid(),reviewed_at=now(),approved_at=now(),updated_at=now(),version=version+1 where id=a.id;
 else
  update public.partner_ngo_applications set status=p_decision,review_note=trim(p_note),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now(),version=version+1 where id=a.id;
 end if;
 insert into public.notifications(user_id,title,body) values(
  a.applicant_user_id,
  case p_decision when 'approved' then 'Partner NGO approved' when 'changes_requested' then 'Partner NGO application needs changes' else 'Partner NGO application reviewed' end,
  case p_decision when 'approved' then 'Your organization is active. Switch to its NGO workspace to continue.' when 'changes_requested' then 'FieldLance requested changes to your Partner NGO application. Open the application to update and resubmit.' else 'FieldLance completed the review of your Partner NGO application. Open it to read the decision.' end
 );
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
 values(auth.uid(),a.applicant_user_id,org_id,'partner_ngo_application_reviewed',jsonb_build_object('application',a.id,'decision',p_decision,'note',trim(p_note)));
 return org_id;
end;
$$;

revoke all on function public.review_partner_ngo_document(uuid,text,text,integer),public.review_partner_ngo_application(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.review_partner_ngo_document(uuid,text,text,integer),public.review_partner_ngo_application(uuid,text,text,integer) to authenticated;
