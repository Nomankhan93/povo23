# Upgrade to POEM 2.14.2

Apply after POEM 2.14.1 is committed and local 2.14.0/2.14.1 regression gates are green.

2.14.2 is frontend/test/documentation stabilization and adds no SQL migration.

```bash
nvm use
npm ci --include=dev
npm run preflight
npx supabase start
npx supabase migration up --local
npm run test:local
npm run test:operations
node scripts/test-phase214.mjs
node scripts/test-phase2141.mjs
node scripts/test-phase2142.mjs
```

`npx supabase migration up --local` should report no new 2.14.2 migration. Existing migration history must not be renamed or rewritten.
