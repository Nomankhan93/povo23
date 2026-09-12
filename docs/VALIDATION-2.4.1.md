# POEM 2.4.1 validation

`npm test` continues to run `scripts/test-phase24.mjs` and now loads the 2.4.1 stabilization migration after the 2.4.0 canonical registry migration.

The Phase 2.4 suite verifies:

1. Existing project persons receive separate canonical identities during backfill.
2. POEM survey managers receive explainable cross-project candidates.
3. Partner NGOs cannot read global canonical tables or the detailed candidate RPC.
4. Field identity preflight does not expose foreign NGO/person details.
5. Same-person review merges canonical links without deleting project records.
6. Canonical assistance history aggregates linked project records.
7. The merge event preserves the moved project-person UUID list.
8. A canonical merge can be reverted with audited history.
9. Reverted identities can be reviewed and merged again.
10. Assistance aggregation remains intact after re-merge.
11. Future registry persons automatically receive canonical identities.
12. Direct authenticated canonical mutation remains denied.
13. Anonymous canonical RPC access remains denied.

For production confidence, also run the real local Supabase HTTP suites:

```bash
npm run test:local
npm run test:operations
```

The embedded PGlite suite validates migration/RLS/business logic but is not a substitute for a backup/restore exercise and production security review.
