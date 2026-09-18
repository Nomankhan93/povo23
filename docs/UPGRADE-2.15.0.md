# Upgrade to POEM 2.15.0

From the project root:

```bash
nvm use
npm ci --include=dev
npm run preflight
npx supabase start
npx supabase migration up --local
node scripts/test-phase215.mjs
npm run test:local
npm run test:operations
```

The new forward migration is:

```text
20261008000100_ngo_template_self_service.sql
```

Do not edit or rename older migrations. After all local gates pass, link the intended Supabase project and run:

```bash
npx supabase db push
```

Then manually verify one NGO submit -> changes requested -> resubmit -> approve flow in the browser before production/pilot use.
