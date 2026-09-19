# Upgrade to POEM 2.19.3

## Preconditions

- POEM 2.19.2 is fully validated.
- Local and remote migrations match through `20261009000300_assistance_ledger_duplicate_controls.sql`.
- Working tree should contain only intentional 2.19.2 validated compatibility fixes.

## Apply

Use the patch installer with `--check` first. Do not force over a conflict.

The only new database migration is:

`20261009000400_case_followup_outcomes_closure.sql`

Existing applied migrations must remain unchanged.

## Local validation order

```bash
nvm use
npm ci --include=dev
npm run types:generate
npx supabase start
npx supabase migration up --local
npm run test:followup
npm run test:assistance
npm run test:distribution
npm run test:cases
npm run preflight
npm run test:payments
npm run test:local
npm run test:operations
npx supabase migration list
```

Only after every validation step succeeds:

```bash
npx supabase db push
npx supabase migration list
```

Local and remote histories should match through `20261009000400`.
