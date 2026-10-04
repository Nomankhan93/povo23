# FieldLance 2.41.5 upgrade

Forward migrations, in order:
1. 20261013000490_recruitment_collection_consent.sql
2. 20261013000500_application_table_privileges.sql
3. 20261013000510_collection_definer_helper_permissions.sql
4. 20261013000520_case_worker_recruitment_consent.sql
5. 20261013000530_collection_project_date_guard.sql

Do not normally rewrite applied migrations or reset the development database. The explicitly authorized pre-production exception for 00500 is documented in UPGRADE-2.41.7.md: it had never applied successfully on hosted production. The corrected migration alters only creator defaults available to its executor. Hosted postgres cannot manage supabase_admin defaults. Ownership and role memberships are not changed to work around this.

Existing postgres-owned RPCs need the explicit private-helper EXECUTE grant in migration 00510 when migration 00490 is created by another administration role. Browser roles must not receive that two-argument helper grant.

Local implementation status: all five migrations applied only to poem-phase11 (API 55321, database 55322); no hosted changes.

Recovery archive:
- /home/noman/fieldlance-backups/2.41.5/pre-hardening.dump
- /home/noman/fieldlance-backups/2.41.5/pre-hardening-globals.sql
- SHA-256: 9411347ca8a412b71ca87b453aef414e34fd17a9b99eec18663b180dc26e8a17

Archive directory verified with pg_restore --list. Application schemas and data were restored into fieldlance_2415_validation in the local database container. The isolated restore needed the Supabase administrative role. One extension-generated graphql_public.graphql ACL entry was excluded because the fresh extension did not generate that function; the complete archive remains unchanged. The exact selection is stored in restore.list beside the archive. Do not describe this as an unqualified full-cluster restore.

Retain the recovery archive. Restore only after an explicit recovery decision; restoring over the live database is destructive.

00530 restores the inclusive UTC project window in the shared collection helper. It is a function-body-only correction with no row, signature, ownership or grant changes. The previously verified pre-hardening archive remains sufficient: recovery can restore that baseline and replay the forward migrations, and this correction performs no data transformation. No additional backup is warranted for this change. The original four migration files were preserved for that release; the subsequent explicitly authorized 00500 portability exception is documented below and in UPGRADE-2.41.7.md.

00530 was validated from all 82 migrations in isolated PostgreSQL before local application, then registered transactionally in supabase_migrations.schema_migrations. The temporary database was removed. SHA-256 checks confirm 00490-00520 were not rewritten.
