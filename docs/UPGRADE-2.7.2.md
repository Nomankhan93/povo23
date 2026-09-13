# Upgrade to POEM 2.7.2

1. Keep a clean backup/commit of the current 2.7.1 project.
2. Apply the 2.7.2 patch.
3. Install exact dependencies and run preflight:

```bash
nvm use
npm ci --include=dev
npm run preflight
```

4. Apply the new local migration and run real local integration checks:

```bash
npx supabase start
npx supabase migration up --local
npm run test:local
npm run test:operations
```

5. Only after all checks pass, push pending migrations to the linked cloud project:

```bash
npx supabase db push
```

## New migration

`supabase/migrations/20260922000200_geography_regression_stabilization.sql`

The migration replaces the public `save_geography(...)` implementation with a stricter new-insert parent rule. It does not delete or re-parent existing geography data.
