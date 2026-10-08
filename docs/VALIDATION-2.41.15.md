# FieldLance 2.41.15 validation

## Fast required checks

```bash
npm run test:project-lifecycle-24115
npm run test:project-lifecycle-db-24115
npm run test:recruitment-hardening-2415
npm run test:workflow-ui-2111
npm run release:consistency
npm run check
npm run build
git diff --check
```

## Database gate

```bash
npx supabase migration list
npx supabase db push --dry-run
```

The dry run must show only `20261013000580_project_lifecycle_e2e_integrity.sql` as pending relative to a 2.41.14 database.

Because this release changes a guarded database authorization boundary, run the full historical preflight at final release certification or when local DB/security certification is being performed. It is not run by the patch installer.

## Dedicated coverage

The source-level lifecycle test verifies the full cross-module contract from publication through payable generation and assignment finalization. The migrated-schema test proves a Project Manager can complete/cancel an accepted assignment, collection is revoked, an ordinary Organization member remains denied, and exact notification context is retained.
