# Upgrade to POEM 2.5.0

Apply this release only after the 2.4.0 canonical registry and 2.4.1 unmerge fix are present. 2.4.2 is test-hygiene only but is the expected application baseline for this patch.

## Local validation

```bash
cd /home/noman/projects/poem-phase1.1
nvm use
npm ci --include=dev
npm run preflight
npx supabase start
npx supabase migration up --local
npm run test:local
npm run test:operations
```

The new migration is:

```text
supabase/migrations/20260920000100_phase25_controlled_sharing.sql
```

After all local checks pass, push pending migrations to the linked cloud project:

```bash
npx supabase db push
```

Then deploy the frontend normally. No manual SQL is required.

## Important

Do not grant partner NGOs direct SELECT access to canonical registry, other organizations' survey responses, needs or assistance tables. Phase 2.5 summaries must stay behind the approved-grant RPC.
