# Upgrade to FieldLance 2.41.15

From 2.41.14:

1. Apply the patch.
2. Run targeted lifecycle/schema regression and type/build checks.
3. Apply the new migration locally, or validate against the in-memory migrated-schema test.
4. Inspect `npx supabase db push --dry-run`; only `20261013000580_project_lifecycle_e2e_integrity.sql` should be pending.
5. Push the database migration only after the targeted checks are green.

The migration replaces two existing RPC bodies; it creates no new table and performs no data rewrite.
