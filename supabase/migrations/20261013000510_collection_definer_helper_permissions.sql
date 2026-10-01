-- Existing RPCs retain their postgres owner when replaced by the administrative
-- migration role. Allow that trusted definer to invoke the private consent helper.
-- Do not expose the two-argument helper to browser roles.
grant execute on function app_private.has_accepted_collection_assignment(uuid,uuid) to postgres;
