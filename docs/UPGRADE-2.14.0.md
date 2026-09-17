# Upgrade to POEM 2.14.0

1. Back up the local/cloud database before any migration change.
2. Apply the source patch and run the normal release checks.
3. Start local Supabase and apply the single forward migration.
4. Run embedded regression tests, local Auth/Storage tests and operational tests.
5. Inspect focal-person cross-area denial before pushing the migration to cloud.

```bash
nvm use
npm ci --include=dev
npm run preflight
npx supabase start
npx supabase migration up --local
npm run test:local
npm run test:operations
```

Cloud deployment remains a separate explicit step:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Do not rename/reorder historical migrations. The new forward migration sorts after the existing `20261006000200_invitation_access_scope_fix.sql` head.
