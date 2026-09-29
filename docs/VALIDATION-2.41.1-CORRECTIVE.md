# Validation — FieldLance 2.41.1 Corrective

Required acceptance gates:

1. `npm run test:corrective-2411`
2. `npm run test:browser-241`
3. `npm run test:browser-map-2411`
4. `npm run test:map-review-2411`
5. `npm run preflight`
6. `npm run test:local`
7. `git diff --check`

Expected database head after local application:

`20261013000461_daily_payable_timezone_consistency.sql`

Before remote deployment, `npx supabase db push --dry-run` should show only unapplied forward migrations expected for the current branch.
