# Upgrade to FieldLance 2.42.3

## Baseline

Apply only to the verified FieldLance 2.42.2 baseline. The installable patch validates protected Survey Template Builder/offline-save files, route/capability contracts and the migration inventory before writing.

## Database

No migration, schema, RLS, grant or RPC deployment is required. Migration count and head remain unchanged.

## Frontend

2.42.3 adds scoped presentation modules for Survey Collection, Capture Fields, Responses and Review Queue and advances release metadata. The protected Survey Template Builder, Offline Field Workspace, offline store and survey-save engine are not modified.

## FAST validation

Run:

```bash
npm run test:survey-collection-responses-2423
npm run test:survey-template-builder-2422
npm run test:project-workspace-2421
npm run test:ui-foundation-2420
npm run test:navigation-capability-24114
npm run test:routing-236
npm run test:mobile-production-24117
npm run test:accessibility-24120
npm run release:consistency
npm run check
npm run build
git diff --check
```

Do not run the full historical preflight for this presentation patch unless separately performing broader release certification.
