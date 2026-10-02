# Current validation — FieldLance 2.41.6

See [VALIDATION-2.41.6.md](VALIDATION-2.41.6.md) for commands and test boundaries, and [IMPLEMENTATION-2.41.6.md](IMPLEMENTATION-2.41.6.md) for exact results and commit-readiness review. The complete 96-command npm test sequence passed. The separate pre-existing F14 browser failure remains unresolved; its harness was not changed.

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
