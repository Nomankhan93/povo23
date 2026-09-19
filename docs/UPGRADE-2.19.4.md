# Upgrade to POEM 2.19.4

2.19.4 is migration-free.

```bash
cd /home/noman/projects/poem-phase1.1
nvm use
npm ci --include=dev
npm run test:frontend-foundation
npm run preflight
npm run test:followup
npm run test:assistance
npm run test:distribution
npm run test:cases
npm run test:payments
npm run test:local
npm run test:operations
npx supabase migration list
```

No `npx supabase db push` is required solely for 2.19.4 because no migration is added. Local and remote migration heads should remain `20261009000400`.
