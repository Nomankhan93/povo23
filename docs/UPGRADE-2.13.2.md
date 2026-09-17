# Upgrade to POEM 2.13.2

POEM 2.13.2 is frontend-only. There is no database migration.

After applying the patch:

```bash
nvm use
npm ci --include=dev
node scripts/test-phase2132.mjs
npm run preflight
npm run test:local
npm run test:operations
```

No Supabase database push is required for this release unless your branch also contains separate unapplied migrations from earlier work.
