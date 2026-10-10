# FieldLance 2.42.8 validation

## Release invariants

- Package and lockfile version: `2.42.8`.
- Migration count: 87.
- Migration head: `20261013000580_project_lifecycle_e2e_integrity.sql`.
- All migration contents remain byte-identical to the accepted 2.42.7 baseline.
- `fundingRequest.ts`, routes, navigation, capabilities, AppShell, Project Workspace, Supabase client/types and Earnings integration remain byte-identical.
- Existing payable/funding RPC names and argument semantics remain represented in the edited UI surfaces.

## Dedicated 2.42.8 coverage

Run:

```bash
npm run test:finance-payables-2428
```

The dedicated test protects:

- assignment-first Payables desktop/mobile presentation;
- contract amendments, completion claims, daily-rate explanation, survey recovery, private receipts and immutable journal behavior;
- exact safe-retry request retention and unit-version/request snapshots;
- valid signed amount presentation and missing/invalid-value handling;
- Project Funding ledger/assurance/reconciliation/closure/intake/history sections;
- stale organization/project/currency response protection;
- successful-only funding-source form reset;
- stable funding request identity and exact pending-request retry;
- context-bound reconciliation/commitment-release/closure confirmations;
- unchanged migration/protected-file boundaries;
- 44px desktop / 48px mobile targets, token-only CSS, >=12px typography and approved breakpoints.

## Focused regressions

After dependencies are installed with `npm ci`, run:

```bash
npm run test:finance-payables-2428
npm run test:funding-retry-2416
npm run test:funding-assurance
npm run test:payments
npm run test:earnings-wallet
npm run test:wallet-capability-2417
npm run test:attendance-238
npm run test:attendance-timesheets-2425
npm run test:project-workspace-2421
npm run test:ui-foundation-2420
npm run test:accessibility-24120
npm run release:consistency
npm run types:check
npm run check
npm run build
git diff --check
```

## Final finance certification

Because this release changes financial interaction surfaces and adds client correctness guards, run the full historical preflight for final certification:

```bash
npm run preflight
```

The current historical preflight chain does not automatically include all newer 2.42.x dedicated tests, so `npm run test:finance-payables-2428` and the relevant 2.42 UI/workspace regressions must still be executed separately.


## 2.42.8-r1 corrective validation

The r1 correction does not change the 2.42.8 package version, database, RPCs, RLS, finance calculations, funding idempotency or capability contracts. It corrects two presentation/documentation regressions and three brittle historical assertions discovered by full preflight:

- restores the complete historical `docs/PERMISSIONS.md` record beneath the current 2.42.8 note, including the existing mock JazzCash/Easypaisa safety documentation;
- restores the Payables invariant that currencies are never combined while retaining the accounting-record-versus-money-transfer warning;
- aligns the 2.16 and 2.16.1 UI regression assertions with the already-approved Project Team wording present in the 2.42.7 baseline;
- makes the 2.38 Payables compensation-type assertions whitespace-independent while still requiring the exact `fixed_assignment` and `per_verified_survey` branches;
- strengthens the dedicated 2.42.8 suite so both restored invariants are protected going forward.

Focused r1 verification:

```bash
npm run test:finance-payables-2428
node scripts/test-phase216.mjs
node scripts/test-phase2161.mjs
node scripts/test-phase218.mjs
npm run test:earnings-wallet
npm run test:attendance-238
npm run release:consistency
npm run check
npm run build
git diff --check
```

After the focused checks pass, rerun `npm run preflight` for final finance-release certification.

## Environment note for the prepared artifact

The clean source ZIP used to build this patch did not contain installed `node_modules`. In the build environment used to prepare the artifact, registry DNS was unavailable, so `npm ci` could not complete and dependency-backed TypeScript/build/full-preflight commands could not be certified there. Source-level release-contract tests and TypeScript syntactic transpilation were run instead; dependency-backed validation must be rerun in the normal FieldLance development environment before merge/deploy.
