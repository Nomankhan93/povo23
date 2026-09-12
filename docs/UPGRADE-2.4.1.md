# Upgrade to POEM 2.4.1

Run from the project root in WSL/Ubuntu.

```bash
nvm use
npm ci --include=dev
npm run preflight
```

For the local Supabase stack:

```bash
npx supabase start
npx supabase migration up --local
npm run test:local
npm run test:operations
```

The new migration is:

```text
20260919000200_canonical_unmerge_fix.sql
```

It is forward-only and safe to apply after `20260919000100_canonical_registry.sql`. It does not rewrite existing canonical merge events; it fixes how their stored UUID array is decoded during reversal.

Only after all local checks pass, inspect the linked target and then run:

```bash
npx supabase db push
```

Do not manually edit an already-applied 2.4.0 migration in a shared/remote database. The 2.4.1 migration replaces the function safely through normal migration history.
