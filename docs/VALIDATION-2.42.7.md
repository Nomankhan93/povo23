# FieldLance 2.42.7 validation

## Release invariants

- Package and lockfile version: `2.42.7`.
- Migration count: 87.
- Migration head: `20261013000580_project_lifecycle_e2e_integrity.sql`.
- No migration/schema/RLS/RPC/grant change.
- App shell/routes/navigation/capabilities, Project Workspace permissions/navigation, geography selection, recruitment state/query, finance, Supabase client/types and all migrations remain protected against the 2.42.6 baseline.

## Focused validation

Run:

```bash
npm run test:project-team-2427
node --experimental-strip-types scripts/test-phase2141.mjs
node scripts/test-phase2142.mjs
npm run test:project-workspace-2421
npm run test:ui-foundation-2420
npm run test:mobile-production-24117
npm run test:accessibility-24120
npm run release:consistency
npm run check
npm run build
git diff --check
```

Full historical preflight is not required for normal 2.42.7 iteration because this release is presentation-only. Use it only for deliberate final certification after the targeted gates are green.

## Dedicated 2.42.7 coverage

`scripts/test-project-team2427.mjs` verifies package/migration invariants; all four staff RPCs; unchanged team-management permission boundaries; NGO and Project Workspace integration; role/scope presentation; roster summary/table/mobile-card behavior; candidate/area/date/revoke semantics; read-only operational metrics and collection-eligibility safety wording; recruitment-capacity and compensation snapshot semantics; absence of broad account lookup; CSS Module isolation/tokens/type/breakpoints; and byte-identical protected files.

`scripts/test-phase2142.mjs` was intentionally updated to protect the new scoped CSS + DataTable/MobileRecordCard presentation instead of the retired `td::before` mobile-table implementation. Authorization and workflow assertions were not weakened.
