# FieldLance 2.19.5 validation

Run:

```bash
npm run types:generate
npx supabase migration up --local
npm run test:branding
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

Expected focused result:

```text
10 FieldLance 2.19.5 branding scenarios passed.
```
