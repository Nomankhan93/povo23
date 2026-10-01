-- Browser roles use CRUD under RLS and EXECUTE on explicit RPCs.
-- They do not manage table definitions, foreign keys, triggers or bulk truncation.
-- Ownership, service_role, Auth and Storage schemas are intentionally unchanged.
revoke truncate,references,trigger on
 public.survey_capture_files,public.operational_task_sla_policies,
 public.operational_tasks,public.operational_task_events,
 public.worker_availability_preferences,public.worker_availability_rules,
 public.worker_unavailable_periods from anon,authenticated;
-- Capture metadata is reserved by reserve_survey_capture_file, not direct browser writes.
revoke insert,update,delete on public.survey_capture_files from anon,authenticated;
-- Supabase PG17 also defaults MAINTAIN to browser roles; it is not an API capability.
do $$
declare owner_name text; table_name text;
begin
 if current_setting('server_version_num')::integer >= 170000 then
  for table_name in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')
  loop execute format('revoke maintain on public.%I from anon,authenticated',table_name);end loop;
 end if;
 for owner_name in select rolname from pg_roles where rolname in ('postgres','supabase_admin')
 loop
  execute format('alter default privileges for role %I in schema public revoke truncate,references,trigger on tables from anon,authenticated',owner_name);
  if current_setting('server_version_num')::integer >= 170000 then
   execute format('alter default privileges for role %I in schema public revoke maintain on tables from anon,authenticated',owner_name);
  end if;
 end loop;
end;$$;
