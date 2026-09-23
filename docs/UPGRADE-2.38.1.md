# Upgrade to FieldLance 2.38.1

Upgrade from the validated FieldLance 2.38.0 baseline. Do not reset the database.

## Forward migration

`20261013000420_automatic_project_marketplace_publishing.sql`

The migration adds automatic project marketplace metadata, publishing/synchronization triggers, a canonical discovery query and a backfill for active projects.

## WSL validation

```bash
cd /home/noman/projects/poem-phase1.1
nvm use
npm ci
npx supabase start
npx supabase migration up --local
npm run types:check
npm run test:auto-marketplace-2381
npm run preflight
npm run test:local
```

If generated database types are stale after applying the migration, run:

```bash
npm run types:generate
npm run metadata:generate
```

Then rerun the validation commands.

After all local validation passes:

```bash
npx supabase db push
```

## Backfill behavior

- Every currently active project receives one current automatic marketplace listing.
- Existing manual opportunities and their applications/invitations/assignments are retained.
- Field Worker discovery prefers the canonical automatic listing.
- No permanent Field Worker profile-share grant is created.
- Existing assignment/payable/attendance history is not rewritten.
