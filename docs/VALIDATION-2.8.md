# POEM 2.8 validation

`npm run preflight` passed in the build workspace: generated database types, TypeScript, previous test suites, new workbench SQL tests and production build. The workbench loads as a separate JavaScript chunk; the existing main-bundle >500 kB warning remains.

`test-phase28.mjs` reports 14 SQL scenarios against the complete migration schema in PGlite:

- All four RPCs reject NGOs, collectors and anonymous users.
- Keyset identity pagination, beneficiary-number/UUID lookup, review/merged filters and invalid parameter rejection.
- Source pagination and organization/project/link provenance.
- Canonical snapshots, merges, assistance and match-decision history.
- Repeated same-identity review preserves lineage.
- Missing tokens, changed decision versions, source corrections and canonical-only changes reject stale review previews.
- Needs-review, different-people and actual same-person merge paths.
- Audited reads/previews/decisions and continued raw-table NGO isolation.

PGlite executes the SQL but is not a full Supabase Auth/PostgREST/Storage deployment. The real local operations gate could not complete without local Supabase/Docker. A browser attempt against the synthetic local workbench fixture was blocked by the browser environment (`ERR_BLOCKED_BY_CLIENT`); no successful browser-interaction claim is made.

Eight guarded-installer scenarios passed: read-only/exact apply, idempotent reapply, README/custom-script/synchronized-dependency preservation, local-edit rejection, migration-drift rejection, lock mismatch rejection, symlink refusal and traversal refusal.

## WSL acceptance checklist

1. Each authorized POEM role sees Canonical registry. NGO and volunteer accounts do not; direct RPC calls remain denied.
2. Search by display name and POEM-BEN number; filter current/review-required/merged/all. Verify empty, loading, error and pagination states.
3. Open linked sources and verify NGO, project, DOB, household, link reason and revision references. Follow a merged identity to its survivor.
4. Compare candidates, inspect the side-by-side source data, and submit Needs review and Different people with reasons. Same-project comparisons should fail.
5. On synthetic records, inspect merge impact, acknowledge it and save Same person. Verify links, assistance, review-required state and history. Existing sharing approvals must be invalidated.
6. Open the same comparison in two sessions. Change a source, canonical display or decision in one, then submit the old preview in the other. It must fail and require a new comparison.
7. Inspect merge history and reverse a synthetic merge with a reason. Verify restored links, review-required identities and preserved histories. A stale reversal or earlier dependent merge must be rejected.
8. Reconcile display identity from a reviewed source. Verify the canonical revision and fresh-sharing-authorization requirement.
9. Confirm history and assistance pages do not mix selected identities when switching quickly. Test Previous/Next while records are changing.
10. Check desktop and mobile widths, keyboard navigation, form labels, acknowledgment requirements and error recovery.
11. Confirm volunteer self-publication and existing survey/offline recovery flows still work.

No production deployment, browser acceptance, load test or hosted schema migration is included in the completed build checks.
