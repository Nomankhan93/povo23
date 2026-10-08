# Current validation — FieldLance 2.41.19

See [VALIDATION-2.41.19.md](VALIDATION-2.41.19.md) for React/global error containment, sensitive-data-safe diagnostics, RPC/Supabase transport instrumentation and offline/map/notification/service-worker observability regressions.

# Historical validation — FieldLance 2.41.18

See [VALIDATION-2.41.18.md](VALIDATION-2.41.18.md) for bundle/chunk, query-efficiency, runtime branding and manifest-selected offline precache regression.

# Historical validation — FieldLance 2.41.17

See [VALIDATION-2.41.17.md](VALIDATION-2.41.17.md) for mobile safe-area hardening, Field Worker mobile/offline/browser acceptance, deployed HTTPS/PWA shell verification and the physical production acceptance boundary.

# Historical validation — FieldLance 2.41.16

See [VALIDATION-2.41.16.md](VALIDATION-2.41.16.md) for CSP/Vercel/canonical-origin regression, production environment launch gating, auth/routing compatibility, build/security-secret checks and hosted custom-domain acceptance.

# Historical validation — FieldLance 2.41.15

See [VALIDATION-2.41.15.md](VALIDATION-2.41.15.md) for project-lifecycle cross-layer regression, migrated-schema Project Manager finalization checks, type/build checks and the forward migration gate.

# Historical validation — FieldLance 2.41.14

See [VALIDATION-2.41.14.md](VALIDATION-2.41.14.md) for centralized role/navigation capability regression, historical Staff/Organization navigation compatibility, type/build checks and the no-migration boundary.

# Historical validation — FieldLance 2.41.13

See [VALIDATION-2.41.13.md](VALIDATION-2.41.13.md) for narrow foreground access refresh, demand-loaded geography/account data, recent-activity sizing, duplicate-query removal and targeted compatibility checks.

# Historical validation — FieldLance 2.41.12

See [VALIDATION-2.41.12.md](VALIDATION-2.41.12.md) for recovery-event gating, invalid/expired reset handling, auth initialization ordering, local secure-password configuration and targeted compatibility checks.

# Historical validation — FieldLance 2.41.11

See [VALIDATION-2.41.11.md](VALIDATION-2.41.11.md) for strict route parsing, auth callback, certificate URL, Vercel SPA fallback and compatibility checks.

# Historical validation — FieldLance 2.41.10

See [VALIDATION-2.41.10.md](VALIDATION-2.41.10.md) for the Security Advisor RPC-surface migration, regression guard and required local/hosted verification.

# Historical validation — FieldLance 2.41.9

See [VALIDATION-2.41.9.md](VALIDATION-2.41.9.md) for responsive browser behavior, workflow validation and test boundaries.

# Historical validation — FieldLance 2.41.8

See [VALIDATION-2.41.8.md](VALIDATION-2.41.8.md) for the current execution record and behavioral test boundaries.

# Historical validation — FieldLance 2.41.7

See [VALIDATION-2.41.7.md](VALIDATION-2.41.7.md) for commands, exact results and test boundaries. Final uninterrupted npm test, generated types, TypeScript, production build, offline Chromium, full map regression, map Chromium, release consistency and secret scan passed. The previously recorded F14 browser harness failure is separated from the 2.41.5 recruitment/grant work; current offline tests pass after the harness correction.

# Historical validation — FieldLance 2.41.6

See [VALIDATION-2.41.6.md](VALIDATION-2.41.6.md) and [IMPLEMENTATION-2.41.6.md](IMPLEMENTATION-2.41.6.md) for its workflow-reliability test results and the separately recorded intermittent baseline check.

# Historical validation — FieldLance 2.41.5

The 2.41.5 pre-commit project-date correction is covered by test:collection-dates-2415 and forward migration 00530. Its complete npm test and targeted checks passed; see IMPLEMENTATION-2.41.5.md for evidence and the separate pre-existing F14 limitation.

See [VALIDATION-2.41.5.md](VALIDATION-2.41.5.md) and [IMPLEMENTATION-2.41.5.md](IMPLEMENTATION-2.41.5.md) for the exact local results, remaining release blockers and command record.

# Historical validation — FieldLance 2.41.4

See [VALIDATION-2.41.4.md](VALIDATION-2.41.4.md) for current release validation and local acceptance.

# Historical validation — FieldLance 2.41.3

See [VALIDATION-2.41.3.md](VALIDATION-2.41.3.md) for notification routing/action-context validation. Existing 2.41.0–2.41.2 offline, map and browser regressions remain release requirements.

---

# Current validation — FieldLance 2.41.2

See [VALIDATION-2.41.2.md](VALIDATION-2.41.2.md) for offline browser and current release validation.

# Current validation — FieldLance 2.41.0

See [VALIDATION-2.41.0.md](VALIDATION-2.41.0.md) for automated and browser acceptance coverage.

# Current validation — FieldLance 2.40.1

See [VALIDATION-2.40.1.md](VALIDATION-2.40.1.md) for patch checks and remaining deployment validation.

See [FieldLance 2.40.0 validation](VALIDATION-2.40.0.md) for the current Field Operations Map & Geographic Quality release checks.

# Current validation — FieldLance 2.40.0

Current: [VALIDATION-2.40.0.md](VALIDATION-2.40.0.md).

See [FieldLance 2.39.0 validation](VALIDATION-2.39.0.md) for the current case-ownership and delegated-operations release checks.

# Current validation — FieldLance 2.39.0

Current: [VALIDATION-2.39.0.md](VALIDATION-2.39.0.md).

Previous: [VALIDATION-2.37.0.md](VALIDATION-2.37.0.md).

## 2.38.1 automatic project marketplace
Run `npm run test:auto-marketplace-2381`. Verify publish → automatic marketplace listing → Field Worker application → Organization review/offer → Field Worker acceptance, with no permanent profile-share prerequisite.

## 2.41.1

Run `npm run test:map-review-2411` in addition to the standard type, metadata, preflight and local-Supabase gates. The regression includes a >2,500 evidence fixture, duplicate-free keyset traversal, server-filter consistency, authorization denial paths and source-navigation contracts. See `docs/VALIDATION-2.41.1.md`.
