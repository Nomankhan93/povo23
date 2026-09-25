-- FieldLance 2.39.0 validation hotfix.
-- operational_tasks SELECT RLS evaluates this SECURITY DEFINER helper.
-- Authenticated users need EXECUTE on the helper so PostgreSQL can evaluate
-- the policy; the function itself still decides whether the row is readable.

grant execute on function app_private.can_read_operational_task(
  text,
  uuid,
  uuid,
  uuid,
  uuid
) to authenticated;
