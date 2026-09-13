# Upgrade to POEM 2.7.0

Apply the patch to an already validated POEM 2.6.0 project.

```bash
nvm use
npm ci --include=dev
npm run preflight
npx supabase start
npx supabase migration up --local
npm run test:local
npm run test:operations
```

Run the focused embedded database suite if troubleshooting:

```bash
node scripts/test-phase27.mjs
```

The new migration is:

```text
supabase/migrations/20260921000100_phase27_workforce_marketplace.sql
```

After all local checks pass, push pending migrations to the linked cloud project:

```bash
npx supabase db push
```

Do not manually create Phase 2.7 tables/functions in the cloud SQL editor. Keep migration history authoritative.
