# Upgrade to POEM 2.12.5

Run from `/home/noman/projects/poem-phase1.1` after applying the patch.

```bash
nvm use
npm ci --include=dev
npx supabase start
npx supabase migration up --local
npm run preflight
npm run test:local
npm run test:operations
```

Only after all local checks pass:

```bash
npx supabase db push
```

The release adds one forward migration:

`supabase/migrations/20261003000100_current_state_stabilization.sql`

Do not rename or edit previously applied migrations.
