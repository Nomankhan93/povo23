# Upgrade to POEM 2.19.0

Prerequisite: clean POEM 2.18.3 with payment migration head `20261008000930_withdrawal_operations_manual_settlement.sql` and green payment/full regression tests.

1. Apply the 2.19.0 patch with `--check` first.
2. Run `npm run types:generate` because 2.19.0 adds database tables/RPCs.
3. Apply local migrations: `npx supabase start && npx supabase migration up --local`.
4. Run `npm run test:cases`.
5. Run `npm run preflight && npm run test:local && npm run test:operations`.
6. Browser-test POEM survey, NGO Admin and Project Manager case/request workspaces.
7. Only after all checks are green, run `npx supabase db push`.

The initial migration is forward-only: `20261009000100_beneficiary_cases_assistance_requests.sql`. The validation-stabilization follow-up is also forward-only: `20261009000110_beneficiary_case_request_stabilization.sql`. The original migration is not edited, and neither migration backfills or rewrites existing needs or delivered-assistance rows.
