-- Private mutation helpers are invoked only by trusted definer functions/triggers.
-- Authenticated users have app_private USAGE for RLS predicates, so leaving
-- PUBLIC EXECUTE on a mutator would also authorize direct authenticated SQL calls.
revoke execute on function app_private.capture_canonical_revision(uuid,text,uuid),
 app_private.ensure_canonical_person() from public,anon,authenticated;

-- This staff directory is an authenticated organization-management RPC.
-- Its internal permission check remains unchanged; remove unnecessary anon entry.
revoke execute on function public.project_staff_candidates(uuid,text) from public,anon;

-- These application tables have no anonymous read/write workflow. RLS already
-- denies anonymous data access; remove inherited table privileges as defense in depth.
-- Authenticated SELECT, trusted RPCs, service_role and platform defaults are unchanged.
revoke all on public.survey_capture_files,
 public.operational_task_sla_policies,public.operational_tasks,
 public.operational_task_events from anon;
