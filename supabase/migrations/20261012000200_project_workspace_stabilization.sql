-- 2.30.1: Storage DELETE needs SELECT visibility. Only project managers may
-- see deleting objects; regular project members retain ready-only access.
create or replace function app_private.project_document_storage_access(p_path text,p_operation text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.project_documents d
    where d.object_path=p_path
      and app_private.is_active()
      and case p_operation
        when 'insert' then d.state='uploading' and d.uploaded_by=auth.uid() and app_private.can_manage_project(d.project_id)
        when 'select' then (d.state='ready' and app_private.project_document_member(d.project_id))
          or (d.state='deleting' and app_private.can_manage_project(d.project_id))
        when 'delete' then d.state='deleting' and app_private.can_manage_project(d.project_id)
        else false
      end
  );
$$;
revoke all on function app_private.project_document_storage_access(text,text) from public,anon,authenticated;
grant execute on function app_private.project_document_storage_access(text,text) to authenticated;

