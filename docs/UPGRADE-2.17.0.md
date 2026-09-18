# Upgrade to POEM 2.17.0

From a clean/current 2.16.1 working tree:

```bash
nvm use
npm ci --include=dev
npm run types:generate
npm run preflight
npx supabase start
npx supabase migration up --local
node scripts/test-phase217.mjs
npm run test:local
npm run test:operations
```

The patch carries the 2.16.1 recruitment-discovery compatibility follow-up (`20261008000500...`) when it is not already present, then adds `20261008000600_finance_core_double_entry_ledger.sql`.

After all local checks pass:

```bash
npx supabase db push
git diff --check
git status --short
```

Do not manually edit generated `database.types.ts`; run `npm run types:generate` after migrations.
