# FieldLance 2.42.6 validation

## Release invariants

- Package and lockfile version: `2.42.6`.
- Migration count: 87.
- Migration head: `20261013000580_project_lifecycle_e2e_integrity.sql`.
- No migration/schema/RLS/RPC/grant change.
- `fieldMapViewState.ts`, routes, capability/navigation, Project Workspace permissions/navigation, Supabase client/types, Attendance/offline files, payables and recruitment state/query files are protected against the 2.42.5 baseline.

## Focused validation

Run:

```bash
npm run test:field-operations-map-2426
npm run test:field-map-240
npm run test:browser-map-2411
npm run test:project-workspace-2421
npm run test:ui-foundation-2420
npm run test:mobile-production-24117
npm run test:accessibility-24120
npm run release:consistency
npm run check
npm run build
git diff --check
```

`test:field-map-240` requires the normal PGlite/TypeScript development dependencies. `test:browser-map-2411` requires Vite and Playwright/Chromium. If a historical browser fixture fails before exercising Map UI, classify that fixture/build-harness issue separately rather than changing production Map behavior without evidence.

## Dedicated 2.42.6 coverage

`scripts/test-field-operations-map2426.mjs` verifies package/migration invariants, protected file hashes, the existing server filter/keyset/full-total contract, MapLibre/OpenFreeMap preservation, worker/Area Focal authorization evidence, `source_openable`, no new geolocation collection, transient-only view state, map/list/detail selection synchronization, desktop and mobile review surfaces, renderer-failure fallback, non-accusatory review signal wording, CSS Module migration, token/type/breakpoint requirements and absence of database/RPC/RLS changes.
