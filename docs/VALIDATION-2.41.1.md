# FieldLance 2.41.1 Validation

## Corrected replacement validation

The corrected package was validated against a clean 2.41.0 baseline. Full preflight completed successfully with 885 grouped PASS checks, including type generation/check, metadata/release consistency, production build and service-worker checks.

## Required local gates

```bash
npm run types:check
npm run metadata:generate
npm run metadata:check
npm run test:map-review-2411
npm run preflight
npx playwright install chromium
npm run test:browser-map-2411
npm run test:local
git diff --check
```

## 2.41.1 regression coverage

The map regression suite checks:

- forward migration ordering;
- legacy map RPC compatibility;
- server-side worker/geography/status/quality/layer/review filters;
- full matched totals plus stable keyset paging;
- a fixture with more than 2,500 survey evidence rows and duplicate-free page traversal;
- Area Focal geography isolation;
- personal worker own-evidence isolation;
- unrelated organization/account denial;
- boundary non-disclosure through an unauthorized geography filter;
- source-action authorization metadata, including revoked assignment/project access;
- rendered delegated-case navigation with exact case identity;
- Chromium filter/selection/page-depth restoration through fresh RPCs, owner separation and access-denied return;
- accessible evidence list and partial-results presentation;
- renderer/basemap fallback contract;
- response/attendance/case source-route wiring.

## Runtime checks still required

- Real browser interaction with dense map clusters and incremental loading.
- Live MapLibre/OpenFreeMap success, cluster expansion and deployed CSP behavior (browser failure fallback is covered with the renderer request blocked).
- Hosted Supabase migration state and PostgREST RPC invocation.
- Representative production-volume query plans and latency.
- Direct source navigation for Project Manager, Area Focal and Field Worker roles on the intended deployment.
