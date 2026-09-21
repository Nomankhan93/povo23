-- FieldLance 2.30.0 — Project Workspace Completion & UX Consolidation
-- Adds a project-scoped working-document registry and a guarded project activity feed.
-- Existing survey attachments, organization compliance files, finance ledgers and audit history remain authoritative.

create table public.project_documents(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.survey_projects(id),
  organization_id uuid not null references public.organizations(id),
  uploaded_by uuid not null references public.accounts(id),
  file_name text not null,
  mime_type text not null,
  byte_size bigint not null,
  object_path text not null unique,
  category text not null check(category in ('project_brief','questionnaire','training','consent','field_instruction','finance','evidence','report','other')),
  note text not null default '' check(length(note)<=1000),
  state text not null default 'uploading' check(state in ('uploading','ready','deleting','deleted')),
  version integer not null default 1,
  created_at timestamptz not null default now()
);
create index project_documents_project on public.project_documents(project_id,state,created_at desc);

alter table public.project_documents enable row level security;
revoke all on public.project_documents from anon,authenticated;
grant select on public.project_documents to authenticated;

create function app_private.project_document_member(p_project uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select app_private.can_manage_project(p_project) or app_private.project_staff_active(p_project,null);
$$;
revoke all on function app_private.project_document_member(uuid) from public,anon,authenticated;
grant execute on function app_private.project_document_member(uuid) to authenticated;

create policy project_document_read on public.project_documents for select to authenticated using(
  app_private.is_active() and state<>'deleted' and app_private.project_document_member(project_id)
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'fieldlance-project-documents',
  'fieldlance-project-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv'
  ]
);

create function app_private.project_document_storage_access(p_path text,p_operation text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.project_documents d
    where d.object_path=p_path
      and app_private.is_active()
      and case p_operation
        when 'insert' then d.state='uploading' and d.uploaded_by=auth.uid() and app_private.can_manage_project(d.project_id)
        when 'select' then d.state='ready' and app_private.project_document_member(d.project_id)
        when 'delete' then d.state='deleting' and app_private.can_manage_project(d.project_id)
        else false
      end
  );
$$;
revoke all on function app_private.project_document_storage_access(text,text) from public,anon,authenticated;
grant execute on function app_private.project_document_storage_access(text,text) to authenticated;

create policy project_document_storage_insert on storage.objects for insert to authenticated with check(
  bucket_id='fieldlance-project-documents' and app_private.project_document_storage_access(name,'insert')
);
create policy project_document_storage_read on storage.objects for select to authenticated using(
  bucket_id='fieldlance-project-documents' and app_private.project_document_storage_access(name,'select')
);
create policy project_document_storage_delete on storage.objects for delete to authenticated using(
  bucket_id='fieldlance-project-documents' and app_private.project_document_storage_access(name,'delete')
);

create function public.reserve_project_document(
  p_project uuid,p_name text,p_type text,p_bytes bigint,p_category text,p_note text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.survey_projects; d public.project_documents; new_id uuid:=gen_random_uuid(); suffix text; clean_name text:=trim(coalesce(p_name,'')); clean_note text:=trim(coalesce(p_note,''));
begin
  select * into p from public.survey_projects where id=p_project for update;
  if not found or not app_private.can_manage_project(p_project) then raise exception 'Project management permission required';end if;
  if length(clean_name) not between 1 and 200 or clean_name~'[/\\]' then raise exception 'Valid file name required';end if;
  if p_type not in ('application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv') or p_bytes is null or p_bytes not between 1 and 10485760 then raise exception 'PDF, JPG, PNG, DOCX, XLSX or CSV up to 10 MiB required';end if;
  if p_category not in ('project_brief','questionnaire','training','consent','field_instruction','finance','evidence','report','other') then raise exception 'Valid project document category required';end if;
  if length(clean_note)>1000 then raise exception 'Document note too long';end if;
  if (select count(*) from public.project_documents where project_id=p_project and state<>'deleted')>=100 then raise exception 'Maximum 100 current project documents';end if;
  suffix:=case p_type when 'application/pdf' then '.pdf' when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then '.docx' when 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' then '.xlsx' else '.csv' end;
  insert into public.project_documents(id,project_id,organization_id,uploaded_by,file_name,mime_type,byte_size,object_path,category,note)
  values(new_id,p_project,p.organization_id,auth.uid(),clean_name,p_type,p_bytes,p_project::text||'/'||new_id::text||suffix,p_category,clean_note)
  returning * into d;
  return to_jsonb(d);
end;$$;

create function public.finish_project_document(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare d public.project_documents; meta jsonb;
begin
  select * into d from public.project_documents where id=p_id for update;
  if not found or not app_private.can_manage_project(d.project_id) or d.uploaded_by<>auth.uid() then raise exception 'Project document upload permission required';end if;
  if d.state='ready' then return;end if;
  if d.state<>'uploading' then raise exception 'Invalid project document state';end if;
  select metadata into meta from storage.objects where bucket_id='fieldlance-project-documents' and name=d.object_path;
  if meta is null or coalesce((meta->>'size')::bigint,-1)<>d.byte_size or coalesce(meta->>'mimetype','')<>d.mime_type then raise exception 'Uploaded bytes do not match reservation';end if;
  update public.project_documents set state='ready',version=version+1 where id=p_id;
  insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),d.organization_id,'project_document_uploaded',jsonb_build_object('document',p_id,'project',d.project_id,'category',d.category));
end;$$;

create function public.project_document_download_path(p_id uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare d public.project_documents;
begin
  select * into d from public.project_documents where id=p_id;
  if not found or d.state<>'ready' or not app_private.project_document_member(d.project_id) then raise exception 'Project document not available';end if;
  return d.object_path;
end;$$;

create function public.begin_project_document_delete(p_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare d public.project_documents;
begin
  select * into d from public.project_documents where id=p_id for update;
  if not found or d.state='deleted' or not app_private.can_manage_project(d.project_id) then raise exception 'Project document management permission required';end if;
  if d.state<>'deleting' then
    update public.project_documents set state='deleting',version=version+1 where id=p_id;
    insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),d.organization_id,'project_document_removal_requested',jsonb_build_object('document',p_id,'project',d.project_id,'file_name',d.file_name));
  end if;
  return d.object_path;
end;$$;

create function public.finish_project_document_delete(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare d public.project_documents;
begin
  select * into d from public.project_documents where id=p_id for update;
  if not found or d.state<>'deleting' or not app_private.can_manage_project(d.project_id) then raise exception 'No project document removal pending';end if;
  if exists(select 1 from storage.objects where bucket_id='fieldlance-project-documents' and name=d.object_path) then raise exception 'Remove stored file before completing removal';end if;
  update public.project_documents set state='deleted',version=version+1 where id=p_id;
  insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),d.organization_id,'project_document_removed',jsonb_build_object('document',p_id,'project',d.project_id,'file_name',d.file_name));
end;$$;

create index audit_events_project_detail on public.audit_events((detail->>'project'),id desc) where detail ? 'project';

create function public.project_activity_feed(p_project uuid,p_before bigint default null,p_limit integer default 40)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not app_private.can_manage_project(p_project) then raise exception 'Project management permission required';end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'Activity page size must be 1 to 100';end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.id desc),'[]'::jsonb) into result
  from (
    select e.id,e.action,e.detail,e.created_at,e.actor_id,a.full_name actor_name
    from public.audit_events e
    left join public.accounts a on a.id=e.actor_id
    where (p_before is null or e.id<p_before)
      and (
        e.detail->>'project'=p_project::text
        or (e.action in ('survey_project_created','survey_project_closed') and e.detail->>'id'=p_project::text)
      )
    order by e.id desc
    limit p_limit
  ) x;
  return result;
end;$$;

revoke all on function public.reserve_project_document(uuid,text,text,bigint,text,text),public.finish_project_document(uuid),public.project_document_download_path(uuid),public.begin_project_document_delete(uuid),public.finish_project_document_delete(uuid),public.project_activity_feed(uuid,bigint,integer) from public,anon;
grant execute on function public.reserve_project_document(uuid,text,text,bigint,text,text),public.finish_project_document(uuid),public.project_document_download_path(uuid),public.begin_project_document_delete(uuid),public.finish_project_document_delete(uuid),public.project_activity_feed(uuid,bigint,integer) to authenticated;
