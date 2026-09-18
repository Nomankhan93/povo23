# Upgrade to POEM 2.17.2

1. Confirm POEM 2.17.1 is applied and `20261008000610_finance_rls_helper_execute_fix.sql` is present.
2. Run `npm run types:generate` after applying the patch.
3. Run `npm run preflight`.
4. Start local Supabase and run `npx supabase migration up --local`.
5. Run `node scripts/test-phase217.mjs`, `node scripts/test-phase2171.mjs`, and `node scripts/test-phase2172.mjs`.
6. Run `npm run test:local` and `npm run test:operations`.
7. Push migrations to cloud only after every local gate is green.

Existing historical payable events are not mutated by the migration. Reserve sufficient project funding, then use the reconciliation action if the funding workspace reports unbridged events.
