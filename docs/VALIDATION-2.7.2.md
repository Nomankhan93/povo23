# POEM 2.7.2 Validation

## Automated acceptance

```bash
npm run preflight
node scripts/test-geography-reference.mjs
```

The geography suite must verify:

- exactly seven seeded Province/Territory roots remain;
- reference counts and known chains remain unchanged;
- ICT remains the only seeded jurisdiction that skips Division;
- a new non-ICT District directly under Province is rejected;
- a new District under Division succeeds;
- a new ICT District directly under the ICT root succeeds;
- submitted volunteer profile without full address is rejected;
- submitted profile at District level is rejected;
- submitted profile at Taluka/Tehsil level with address succeeds;
- Union Council is optional and persists when supplied.

## Local Supabase acceptance

```bash
npx supabase migration up --local
npm run test:local
npm run test:operations
```

Do not run `npx supabase db push` until the complete preflight and local integration checks are green.
