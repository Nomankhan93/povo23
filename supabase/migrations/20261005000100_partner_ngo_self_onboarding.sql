-- POEM 2.13 — Partner NGO Self-Onboarding & Approval
-- A representative creates a normal personal POEM account, completes an NGO application,
-- uploads private evidence, and receives an active NGO-admin membership only after POEM approval.

create table public.partner_ngo_applications (
 id uuid primary key default gen_random_uuid(),
 applicant_user_id uuid not null references public.accounts(id) on delete cascade,
 organization_id uuid references public.organizations(id),
 organization_name text not null default '' check(length(organization_name)<=200),
 registration_number text not null default '' check(length(registration_number)<=100),
 legal_type text not null default '' check(length(legal_type)<=120),
 representative_name text not null default '' check(length(representative_name)<=200),
 representative_title text not null default '' check(length(representative_title)<=120),
 email text not null default '' check(length(email)<=320),
 phone text not null default '' check(length(phone)<=40),
 address text not null default '' check(length(address)<=1000),
 website text not null default '' check(length(website)<=500),
 operating_area_ids uuid[] not null default '{}'::uuid[],
 program_names text[] not null default '{}'::text[],
 status text not null default 'draft' check(status in ('draft','submitted','changes_requested','approved','rejected','withdrawn')),
 review_note text not null default '' check(length(review_note)<=2000),
 reviewed_by uuid references public.accounts(id),
 reviewed_at timestamptz,
 submitted_at timestamptz,
 approved_at timestamptz,
 version integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index partner_ngo_one_open_application
 on public.partner_ngo_applications(applicant_user_id)
 where status in ('draft','submitted','changes_requested');
create index partner_ngo_application_review_queue on public.partner_ngo_applications(status,submitted_at desc,id);

create table public.partner_ngo_application_documents (
 id uuid primary key default gen_random_uuid(),
 application_id uuid not null references public.partner_ngo_applications(id) on delete cascade,
 applicant_user_id uuid not null references public.accounts(id) on delete cascade,
 object_path text not null unique,
 file_name text not null check(length(file_name) between 1 and 255),
 mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png')),
 byte_size bigint not null check(byte_size between 1 and 5242880),
 kind text not null check(kind in ('registration_proof','authorization_letter','tax_document','other')),
 state text not null default 'uploading' check(state in ('uploading','ready','deleting','deleted')),
 review_status text not null default 'pending' check(review_status in ('pending','accepted','rejected')),
 review_note text not null default '' check(length(review_note)<=2000),
 reviewed_by uuid references public.accounts(id),
 reviewed_at timestamptz,
 version integer not null default 1,
 created_at timestamptz not null default now()
);
create index partner_ngo_documents_application on public.partner_ngo_application_documents(application_id,state,created_at desc);

alter table public.partner_ngo_applications enable row level security;
alter table public.partner_ngo_application_documents enable row level security;

create policy partner_ngo_application_read on public.partner_ngo_applications
 for select to authenticated
 using(app_private.is_active() and (applicant_user_id=auth.uid() or app_private.can_manage_ngos()));
create policy partner_ngo_application_document_read on public.partner_ngo_application_documents
 for select to authenticated
 using(app_private.is_active() and (applicant_user_id=auth.uid() or app_private.can_manage_ngos()));

revoke all on public.partner_ngo_applications,public.partner_ngo_application_documents from anon,authenticated;
grant select on public.partner_ngo_applications,public.partner_ngo_application_documents to authenticated;
grant all on public.partner_ngo_applications,public.partner_ngo_application_documents to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('poem-ngo-applications','poem-ngo-applications',false,5242880,array['application/pdf','image/jpeg','image/png'])
 on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create function app_private.partner_ngo_application_editable(p_application uuid,p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select app_private.is_active() and exists(
  select 1 from public.partner_ngo_applications a
  where a.id=p_application and a.applicant_user_id=p_user
    and a.status in ('draft','changes_requested')
 );
$$;

create function app_private.partner_ngo_document_access(p_path text,p_operation text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare d public.partner_ngo_application_documents;
begin
 if not app_private.is_active() then return false; end if;
 select * into d from public.partner_ngo_application_documents where object_path=p_path;
 if not found then return false; end if;
 if app_private.can_manage_ngos() then return p_operation in ('read'); end if;
 if d.applicant_user_id<>auth.uid() then return false; end if;
 if p_operation='read' then return true; end if;
 if p_operation in ('upload','delete') then
  return app_private.partner_ngo_application_editable(d.application_id,auth.uid());
 end if;
 return false;
end;
$$;

create policy poem_ngo_application_object_read on storage.objects for select to authenticated
 using(bucket_id='poem-ngo-applications' and app_private.partner_ngo_document_access(name,'read'));
create policy poem_ngo_application_object_upload on storage.objects for insert to authenticated
 with check(bucket_id='poem-ngo-applications' and app_private.partner_ngo_document_access(name,'upload'));
create policy poem_ngo_application_object_delete on storage.objects for delete to authenticated
 using(bucket_id='poem-ngo-applications' and app_private.partner_ngo_document_access(name,'delete'));

create function public.save_partner_ngo_application(
 p_id uuid,
 p_data jsonb,
 p_areas uuid[],
 p_programs text[],
 p_version integer
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 a public.partner_ngo_applications;
 result uuid;
 label text;
begin
 if not app_private.is_active() then raise exception 'Active account required'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>20000 then raise exception 'Invalid or oversized NGO application'; end if;
 if p_areas is null or p_programs is null or cardinality(p_areas)>100 or cardinality(p_programs)>50 then raise exception 'Maximum 100 operating areas and 50 programs'; end if;
 if exists(select 1 from unnest(p_areas) g where not exists(
   select 1 from public.geographies x where x.id=g and x.kind in ('district','taluka','uc','village','ward') and app_private.geo_active(x.id)
 )) then raise exception 'Choose active district, taluka, union council, village or ward operating areas'; end if;
 foreach label in array p_programs loop
  if label is null or length(trim(label)) not between 2 and 100 then raise exception 'Program names need 2 to 100 characters'; end if;
 end loop;
 if length(coalesce(p_data->>'organization_name',''))>200
    or length(coalesce(p_data->>'registration_number',''))>100
    or length(coalesce(p_data->>'legal_type',''))>120
    or length(coalesce(p_data->>'representative_name',''))>200
    or length(coalesce(p_data->>'representative_title',''))>120
    or length(coalesce(p_data->>'email',''))>320
    or length(coalesce(p_data->>'phone',''))>40
    or length(coalesce(p_data->>'address',''))>1000
    or length(coalesce(p_data->>'website',''))>500 then
  raise exception 'One or more NGO application fields are too long';
 end if;
 if p_id is null then
  if exists(select 1 from public.partner_ngo_applications where applicant_user_id=auth.uid() and status in ('draft','submitted','changes_requested')) then
   raise exception 'An open NGO application already exists';
  end if;
  insert into public.partner_ngo_applications(
   applicant_user_id,organization_name,registration_number,legal_type,representative_name,representative_title,email,phone,address,website,operating_area_ids,program_names
  ) values(
   auth.uid(),trim(coalesce(p_data->>'organization_name','')),trim(coalesce(p_data->>'registration_number','')),
   trim(coalesce(p_data->>'legal_type','')),trim(coalesce(p_data->>'representative_name','')),trim(coalesce(p_data->>'representative_title','')),
   lower(trim(coalesce(p_data->>'email',''))),trim(coalesce(p_data->>'phone','')),trim(coalesce(p_data->>'address','')),
   trim(coalesce(p_data->>'website','')),coalesce((select array_agg(distinct x) from unnest(p_areas) x),'{}'::uuid[]),
   coalesce((select array_agg(distinct trim(x) order by trim(x)) from unnest(p_programs) x),'{}'::text[])
  ) returning id into result;
 else
  select * into a from public.partner_ngo_applications where id=p_id and applicant_user_id=auth.uid() for update;
  if not found then raise exception 'NGO application not found'; end if;
  if a.status not in ('draft','changes_requested') then raise exception 'Only a draft or changes-requested application can be edited'; end if;
  if a.version is distinct from p_version then raise exception 'NGO application changed. Reload before saving.'; end if;
  update public.partner_ngo_applications set
   organization_name=trim(coalesce(p_data->>'organization_name','')),
   registration_number=trim(coalesce(p_data->>'registration_number','')),
   legal_type=trim(coalesce(p_data->>'legal_type','')),
   representative_name=trim(coalesce(p_data->>'representative_name','')),
   representative_title=trim(coalesce(p_data->>'representative_title','')),
   email=lower(trim(coalesce(p_data->>'email',''))),phone=trim(coalesce(p_data->>'phone','')),
   address=trim(coalesce(p_data->>'address','')),website=trim(coalesce(p_data->>'website','')),
   operating_area_ids=coalesce((select array_agg(distinct x) from unnest(p_areas) x),'{}'::uuid[]),
   program_names=coalesce((select array_agg(distinct trim(x) order by trim(x)) from unnest(p_programs) x),'{}'::text[]),
   review_note='',reviewed_by=null,reviewed_at=null,updated_at=now(),version=version+1
  where id=p_id returning id into result;
 end if;
 insert into public.audit_events(actor_id,subject_id,action,detail)
 values(auth.uid(),auth.uid(),'partner_ngo_application_saved',jsonb_build_object('application',result));
 return result;
end;
$$;

create function public.submit_partner_ngo_application(p_id uuid,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare a public.partner_ngo_applications;
begin
 if not app_private.is_active() then raise exception 'Active account required'; end if;
 select * into a from public.partner_ngo_applications where id=p_id and applicant_user_id=auth.uid() for update;
 if not found then raise exception 'NGO application not found'; end if;
 if a.status not in ('draft','changes_requested') then raise exception 'Application is not ready for submission'; end if;
 if a.version is distinct from p_version then raise exception 'NGO application changed. Reload before submitting.'; end if;
 if length(trim(a.organization_name))<2 or length(trim(a.registration_number))<2 or length(trim(a.representative_name))<2
    or length(trim(a.representative_title))<2 or length(trim(a.email))<5 or strpos(a.email,'@')<2
    or length(trim(a.phone))<7 or length(trim(a.address))<10 or cardinality(a.operating_area_ids)<1 or cardinality(a.program_names)<1 then
  raise exception 'Complete organization, registration, representative, contact, address, program and operating-area details before submission';
 end if;
 if exists(select 1 from public.partner_ngo_application_documents d where d.application_id=a.id and d.state in ('uploading','deleting')) then
  raise exception 'Finish pending document uploads or removals before submission';
 end if;
 if not exists(select 1 from public.partner_ngo_application_documents d where d.application_id=a.id and d.state='ready' and d.kind='registration_proof') then
  raise exception 'Upload registration or legal proof before submission';
 end if;
 update public.partner_ngo_applications set status='submitted',submitted_at=now(),updated_at=now(),version=version+1 where id=a.id;
 insert into public.notifications(user_id,title,body)
 select id,'Partner NGO application submitted','A new Partner NGO application is ready for POEM review.'
 from public.accounts where status='active' and platform_role in ('super_admin','admin','ngo_manager') and id<>auth.uid();
 insert into public.audit_events(actor_id,subject_id,action,detail)
 values(auth.uid(),auth.uid(),'partner_ngo_application_submitted',jsonb_build_object('application',a.id));
end;
$$;

create function public.withdraw_partner_ngo_application(p_id uuid,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare a public.partner_ngo_applications;
begin
 if not app_private.is_active() then raise exception 'Active account required'; end if;
 select * into a from public.partner_ngo_applications where id=p_id and applicant_user_id=auth.uid() for update;
 if not found then raise exception 'NGO application not found'; end if;
 if a.status not in ('draft','submitted','changes_requested') then raise exception 'Application cannot be withdrawn'; end if;
 if a.version is distinct from p_version then raise exception 'NGO application changed. Reload before withdrawing.'; end if;
 update public.partner_ngo_applications set status='withdrawn',updated_at=now(),version=version+1 where id=a.id;
 insert into public.audit_events(actor_id,subject_id,action,detail) values(auth.uid(),auth.uid(),'partner_ngo_application_withdrawn',jsonb_build_object('application',a.id));
end;
$$;

create function public.begin_partner_ngo_document_upload(p_application uuid,p_name text,p_type text,p_bytes bigint,p_kind text)
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
    or p_kind not in ('registration_proof','authorization_letter','tax_document','other') then raise exception 'Valid PDF/JPG/PNG application document up to 5 MiB required'; end if;
 if (select count(*) from public.partner_ngo_application_documents where application_id=a.id and state<>'deleted')>=20 then raise exception 'Maximum 20 current application documents'; end if;
 suffix:=case p_type when 'application/pdf' then '.pdf' when 'image/jpeg' then '.jpg' else '.png' end;
 insert into public.partner_ngo_application_documents(id,application_id,applicant_user_id,object_path,file_name,mime_type,byte_size,kind)
 values(new_id,a.id,auth.uid(),auth.uid()::text||'/'||a.id::text||'/'||new_id::text||suffix,trim(p_name),p_type,p_bytes,p_kind)
 returning * into d;
 return to_jsonb(d);
end;
$$;

create function public.finish_partner_ngo_document_upload(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare d public.partner_ngo_application_documents;meta jsonb;
begin
 if not app_private.is_active() then raise exception 'Active account required'; end if;
 select * into d from public.partner_ngo_application_documents where id=p_id and applicant_user_id=auth.uid() for update;
 if not found or d.state<>'uploading' then raise exception 'Pending application document not found'; end if;
 if not app_private.partner_ngo_application_editable(d.application_id,auth.uid()) then raise exception 'Editable NGO application required'; end if;
 select metadata into meta from storage.objects where bucket_id='poem-ngo-applications' and name=d.object_path;
 if meta is null or coalesce((meta->>'size')::bigint,-1)<>d.byte_size or coalesce(meta->>'mimetype','')<>d.mime_type then
  raise exception 'Uploaded document bytes do not match reservation';
 end if;
 update public.partner_ngo_application_documents set state='ready',version=version+1 where id=d.id;
 insert into public.audit_events(actor_id,subject_id,action,detail) values(auth.uid(),auth.uid(),'partner_ngo_document_uploaded',jsonb_build_object('application',d.application_id,'document',d.id,'kind',d.kind));
end;
$$;

create function public.begin_partner_ngo_document_delete(p_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare d public.partner_ngo_application_documents;
begin
 if not app_private.is_active() then raise exception 'Active account required'; end if;
 select * into d from public.partner_ngo_application_documents where id=p_id and applicant_user_id=auth.uid() for update;
 if not found or d.state='deleted' then raise exception 'Application document not found'; end if;
 if not app_private.partner_ngo_application_editable(d.application_id,auth.uid()) then raise exception 'Editable NGO application required'; end if;
 update public.partner_ngo_application_documents set state='deleting',version=version+1 where id=d.id;
 return d.object_path;
end;
$$;

create function public.finish_partner_ngo_document_delete(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare d public.partner_ngo_application_documents;
begin
 if not app_private.is_active() then raise exception 'Active account required'; end if;
 select * into d from public.partner_ngo_application_documents where id=p_id and applicant_user_id=auth.uid() for update;
 if not found or d.state<>'deleting' then raise exception 'Deleting application document not found'; end if;
 if exists(select 1 from storage.objects where bucket_id='poem-ngo-applications' and name=d.object_path) then raise exception 'Remove stored file before completing document removal'; end if;
 update public.partner_ngo_application_documents set state='deleted',version=version+1 where id=d.id;
end;
$$;

create function public.partner_ngo_document_download_path(p_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare d public.partner_ngo_application_documents;
begin
 if not app_private.is_active() then raise exception 'Active account required'; end if;
 select * into d from public.partner_ngo_application_documents where id=p_id and state='ready';
 if not found or not (d.applicant_user_id=auth.uid() or app_private.can_manage_ngos()) then raise exception 'Application document access denied'; end if;
 insert into public.audit_events(actor_id,subject_id,action,detail) values(auth.uid(),d.applicant_user_id,'partner_ngo_document_downloaded',jsonb_build_object('application',d.application_id,'document',d.id));
 return d.object_path;
end;
$$;

create function public.review_partner_ngo_document(p_id uuid,p_status text,p_note text,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare d public.partner_ngo_application_documents;
begin
 if not app_private.can_manage_ngos() then raise exception 'POEM NGO management permission required'; end if;
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

create function public.review_partner_ngo_application(p_id uuid,p_decision text,p_note text,p_version integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 a public.partner_ngo_applications;
 org_id uuid;
 area_label text;
 program_label text;
begin
 if not app_private.can_manage_ngos() then raise exception 'POEM NGO management permission required'; end if;
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
  case p_decision when 'approved' then 'Your organization is active. Switch to its NGO workspace to continue.' when 'changes_requested' then 'POEM requested changes to your Partner NGO application. Open the application to update and resubmit.' else 'POEM completed the review of your Partner NGO application. Open it to read the decision.' end
 );
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
 values(auth.uid(),a.applicant_user_id,org_id,'partner_ngo_application_reviewed',jsonb_build_object('application',a.id,'decision',p_decision,'note',trim(p_note)));
 return org_id;
end;
$$;

revoke all on function app_private.partner_ngo_application_editable(uuid,uuid),app_private.partner_ngo_document_access(text,text) from public,anon,authenticated;
grant execute on function app_private.partner_ngo_document_access(text,text) to authenticated;

revoke all on function public.save_partner_ngo_application(uuid,jsonb,uuid[],text[],integer),public.submit_partner_ngo_application(uuid,integer),public.withdraw_partner_ngo_application(uuid,integer),public.begin_partner_ngo_document_upload(uuid,text,text,bigint,text),public.finish_partner_ngo_document_upload(uuid),public.begin_partner_ngo_document_delete(uuid),public.finish_partner_ngo_document_delete(uuid),public.partner_ngo_document_download_path(uuid),public.review_partner_ngo_document(uuid,text,text,integer),public.review_partner_ngo_application(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.save_partner_ngo_application(uuid,jsonb,uuid[],text[],integer),public.submit_partner_ngo_application(uuid,integer),public.withdraw_partner_ngo_application(uuid,integer),public.begin_partner_ngo_document_upload(uuid,text,text,bigint,text),public.finish_partner_ngo_document_upload(uuid),public.begin_partner_ngo_document_delete(uuid),public.finish_partner_ngo_document_delete(uuid),public.partner_ngo_document_download_path(uuid),public.review_partner_ngo_document(uuid,text,text,integer),public.review_partner_ngo_application(uuid,text,text,integer) to authenticated;
