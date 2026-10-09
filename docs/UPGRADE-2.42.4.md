# Upgrade to FieldLance 2.42.4

## Baseline

Apply only to the verified FieldLance 2.42.3 baseline. The installable patch validates the exact hashes of replaced baseline files, protected recruitment/query/state files, route/capability contracts and the migration inventory before writing.

## Database

No database deployment is required. Migration count/head are unchanged.

## Frontend

2.42.4 adds scoped recruitment presentation modules and updates the marketplace, application review, formal-offer/assignment presentation and direct-invitation UI. Recruitment business/query state files remain byte-identical.

## FAST validation

Run:

```bash
npm run test:recruitment-marketplace-2424
npm run test:workforce-marketplace
npm run test:auto-marketplace-2381
npm run test:recruitment-hardening-2415
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
