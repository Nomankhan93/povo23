# Upgrade to POEM 2.17.1

From the validated 2.17.0 baseline:

```bash
nvm use
npm ci --include=dev
npm run types:generate
npm run preflight
npx supabase start
npx supabase migration up --local
node scripts/test-phase217.mjs
node scripts/test-phase2171.mjs
npm run test:local
npm run test:operations
```

The forward migration is:

`20261008000700_project_funding_reservation.sql`

Do not edit older finance migrations. Do not seed editable balances. Verified funding and project reservations must go through the guarded RPCs.
