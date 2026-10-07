-- FieldLance 2.41.10 — Security Advisor RPC Surface Hardening
--
-- Keep privilege elevation only where the function actually needs it. Retired
-- compatibility failures and the self-only collection eligibility wrapper do
-- not need owner privileges. Preserve the intentional anonymous certificate
-- verification contract, and retire the stale profile-share candidate-search
-- RPC from browser execution without deleting historical schema.

-- Old signed-in clients may still call these names. Keep the explicit retired
-- workflow error, but run it with caller privileges because no privileged data
-- access is required.
alter function public.review_template_draft(uuid,text,text,integer) security invoker;
alter function public.review_project_draft(uuid,text,text,integer) security invoker;
revoke all on function
 public.review_template_draft(uuid,text,text,integer),
 public.review_project_draft(uuid,text,text,integer)
 from public,anon,authenticated;
grant execute on function
 public.review_template_draft(uuid,text,text,integer),
 public.review_project_draft(uuid,text,text,integer)
 to authenticated;

-- This public endpoint is only a self-eligibility adapter. The authoritative
-- app_private.can_collect(uuid) helper already permits authenticated execution
-- and derives the worker identity from auth.uid(), so the exposed wrapper does
-- not need SECURITY DEFINER.
alter function public.can_collect_project(uuid) security invoker;
revoke all on function public.can_collect_project(uuid) from public,anon,authenticated;
grant execute on function public.can_collect_project(uuid) to authenticated;

-- Permanent profile sharing / Organization-first candidate discovery is not a
-- current FieldLance workflow. Keep the historical function for migration/test
-- reproducibility, but remove it from browser RPC execution. Current workforce
-- recruitment uses the published-project marketplace and application snapshot.
revoke all on function public.survey_assignment_candidates(uuid,text) from public,anon,authenticated;

-- Intentional public exception. Certificate holders explicitly opt into public
-- sharing and the verifier returns the bounded public certificate projection.
-- Re-state the grant so future grant cleanups cannot accidentally widen it via
-- PUBLIC or remove the supported anonymous verification flow.
revoke all on function public.verify_field_worker_certificate(text) from public,anon,authenticated;
grant execute on function public.verify_field_worker_certificate(text) to anon,authenticated;

comment on function public.verify_field_worker_certificate(text) is
 'Intentional anonymous FieldLance certificate verification endpoint; public projection only, guarded by explicit certificate sharing.';
