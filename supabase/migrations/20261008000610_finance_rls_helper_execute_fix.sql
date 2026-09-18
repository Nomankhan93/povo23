-- POEM 2.17.0 follow-up
-- Finance RLS policies call app_private.can_read_finance(uuid).
-- Authenticated users require EXECUTE on this SECURITY DEFINER predicate
-- for RLS evaluation. This does not grant finance write access.

grant execute
on function app_private.can_read_finance(uuid)
to authenticated;
