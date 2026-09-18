# Upgrade to POEM 2.18.0

From `/home/noman/projects/poem-phase1.1` after applying the patch:

```bash
nvm use
npm ci --include=dev
npm run types:generate
npm run preflight
npx supabase start
npx supabase migration up --local
node scripts/test-phase217.mjs
node scripts/test-phase2171.mjs
node scripts/test-phase2172.mjs
node scripts/test-phase218.mjs
npm run test:local
npm run test:operations
```

Migration added:

`20261008000900_ewallet_mock_withdrawal_sandbox.sql`

The migration requires the Supabase/PostgreSQL cryptographic extension functions `extensions.crypt(text,text)` and `extensions.gen_salt(text,integer)` when a transaction PIN is configured. Local/cloud Supabase should provide the real extension. The embedded PGlite test supplies a test-only API-compatible shim and is not a cryptographic certification.

Do not configure live JazzCash/Easypaisa secrets in this release. There are no live provider endpoints. Mock verification/callback controls are POEM-Admin-only and exist solely for development validation.
