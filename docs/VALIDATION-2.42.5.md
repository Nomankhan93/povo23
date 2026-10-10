# FieldLance 2.42.5 validation

## Release invariants

- Package and lockfile version: `2.42.5`.
- Migration count: 87.
- Migration head: `20261013000580_project_lifecycle_e2e_integrity.sql`.
- No migration/schema/RLS/RPC/grant change.
- `attendanceOfflineStore.ts`, `attendanceDownload.ts`, routes, capability contract, project permission/navigation, payables, workforce availability and recruitment query/state files are protected by baseline hash regression.

## Focused validation

Run:

```bash
npm run test:attendance-timesheets-2425
npm run test:attendance-238
npm run test:field-stabilization-2401
node scripts/test-field-evidence2401.mjs
npm run test:project-workspace-2421
npm run test:ui-foundation-2420
npm run test:mobile-production-24117
npm run test:accessibility-24120
npm run release:consistency
npm run check
npm run build
git diff --check
```

`test:attendance-238` and `test:attendance-client-2401` require their normal development dependencies. Browser/PWA acceptance remains the FieldLance mobile boundary; no Android-native smoke test belongs in this release.

## Dedicated 2.42.5 coverage

`scripts/test-attendance-timesheets2425.mjs` checks release/migration invariants, protected file hashes, existing call sites, exact attendance deep links, explicit-only geolocation capture, attendance RPC/state presence, offline/download/sync visibility, My Attendance hierarchy, My Timesheets summary/history, manager review actions, raw/effective timestamp distinction, textual status communication, CSS Module usage, token/typography/breakpoint constraints and retirement of legacy global Attendance selectors.

The 2.42.5-r1 correction extends the suite to 19 scenarios and additionally proves that worker correction/resubmission is reachable outside the mobile-only record surface, reviewer context remains available in the worker correction Drawer, My Attendance ignores/resets stale Timesheets status and page state for its operational load, and Current Workday renders its work date from the configured attendance/project timezone rather than direct UTC serialization.
