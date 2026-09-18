# POEM 2.17.0 validation

Run:

```bash
npm run types:generate
npm run preflight
npx supabase migration up --local
node scripts/test-phase2124.mjs
node scripts/test-phase216.mjs
node scripts/test-phase2161.mjs
node scripts/test-phase217.mjs
npm run test:local
npm run test:operations
```

`test-phase217.mjs` validates:

1. Finance tables are direct-write protected and generic mutation is POEM finance-admin only.
2. NGO Admin read scope is organization-bound; Project Manager/Area Focal do not inherit finance authority.
3. Balanced double-entry posting and derived balances.
4. Organization/project scope separation.
5. Unbalanced, mixed-currency and cross-organization posting rejection.
6. Idempotent retries and exactly-once source references.
7. Append-only journals/postings/accounts.
8. Reversal-journal correctness and idempotency.
9. Existing `work_payable_*` subledger remains intact with no provider/withdrawal feature added.

Cloud migration is allowed only after the full regression chain is green.
