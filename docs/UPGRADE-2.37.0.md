# Upgrade to FieldLance 2.37.0

Baseline: validated FieldLance 2.36.1.

## Apply

1. Back up the current source/database.
2. Apply the 2.37.0 patch only to the expected 2.36.1 source baseline.
3. Install dependencies with the project Node version.
4. Apply the forward local migration without resetting data.
5. Verify generated database types.
6. Run the dedicated scheduling regression, full tests, TypeScript check and preflight.

Recommended local commands:

```bash
nvm use
npm ci
npx supabase start
npx supabase migration up --local
npm run types:check
npm run test:workforce-scheduling-237
npm run test
npm run check
npm run preflight
```

Do not reset a populated local/remote environment just to apply this release.

## Existing Field Workers

Existing profile `availability` values are preserved. The new structured schedule is initially unconfigured, so an authorized recruiter receives a warning to confirm dates rather than a false hard conflict. Field Workers can set weekly availability and date exceptions from **My Availability**.

## Existing assignments

Existing assignments remain unchanged. The new database guard affects new/updated offered or active assignments only. Cancelled/declined/completed assignments do not consume parallel-project capacity.

## Cloud deployment

Only after local migration, `types:check`, dedicated regression, full tests and preflight pass should the normal controlled Supabase cloud migration process be used.
