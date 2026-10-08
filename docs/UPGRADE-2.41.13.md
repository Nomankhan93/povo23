# Upgrade to FieldLance 2.41.13

Baseline: validated FieldLance 2.41.12.

## Database

No migration is added. Do not run `supabase db push` for this release.

## Application

Apply the patch and run the fast validation set. The important runtime acceptance is returning to the app from another tab/window: access, suspension, notification and project-assignment changes must refresh without the previous global-data reload burst.

## Rollback

The patch installer records the normal `.fieldlance-patch-backups` snapshot. This release does not mutate hosted services or database state, so rollback is application-only.
