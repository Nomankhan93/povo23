# Upgrade to FieldLance 2.41.14

Baseline: validated FieldLance 2.41.13.

## Database

No migration is added. Do not run `supabase db push` for this release.

## Application

Apply the patch and run the FAST validation set. The key acceptance is that Staff, Organization, Field Worker and project-scoped navigation remain behaviorally identical while capability derivation comes from `src/app/capabilityContract.ts`.

## Rollback

The patch installer creates the normal `.fieldlance-patch-backups` snapshot. No database or hosted service state is changed, so rollback is application-only.
