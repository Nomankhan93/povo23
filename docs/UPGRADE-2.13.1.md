# Upgrade to POEM 2.13.1

From the project root:

```bash
nvm use
npm ci --include=dev
npx supabase start
npx supabase migration up --local
node scripts/test-phase2131.mjs
npm run preflight
npm run test:local
npm run test:operations
```

Do not rename or edit migrations already applied to a database. The new forward migration is:

```text
supabase/migrations/20261006000100_ngo_access_auth_stabilization.sql
```

The migration clears historical permanent profile-grant rows without firing old row-delete triggers, then switches current direct assignment/profile reads to the bounded relationship model while retaining old schema objects for regression compatibility.

Only after local gates are green should the migration be pushed to the linked cloud project:

```bash
npx supabase db push
```
