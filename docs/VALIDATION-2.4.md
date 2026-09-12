# POEM 2.4.0 validation

`npm test` now includes `scripts/test-phase24.mjs`.

The new suite covers:

1. Safe canonical backfill for existing registry persons.
2. Explainable cross-project candidates for POEM survey managers.
3. Partner-NGO denial on canonical/global tables and detailed candidate RPCs.
4. Privacy-safe field identity preflight with no foreign NGO/person details.
5. Same-person canonical merge while preserving both project records.
6. POEM-only assistance aggregation across linked NGO project records.
7. Reversible merge with decision/history update.
8. Automatic canonical identity creation for future registry persons.
9. Denial of direct authenticated canonical mutations.
10. Anonymous RPC denial.

Before production rollout also run the existing real local Supabase HTTP suites (`test:local` and `test:operations`) and perform a database backup/restore exercise. Phase 2.4 does not change the existing rule that sensitive production rollout requires broader security hardening.
