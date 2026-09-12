# Upgrade to POEM 2.6.0

Phase 2.6 is a frontend/test release. It adds no PostgreSQL migration.

## Apply and validate

```bash
nvm use
npm ci --include=dev
npm run preflight
npx supabase start
npx supabase migration up --local
npm run test:local
npm run test:operations
```

`npx supabase db push` is not required specifically for 2.6.0. If earlier 2.4/2.5 migrations have not yet been pushed to the linked cloud project, push them only after all local validation succeeds.

## Browser test

Open an assigned active survey project while online. Start a survey, enter data, then disable the network. Confirm the header changes to Offline and that Save draft / Submit closes the form with a queued message. Re-enable the network and confirm the header queue count returns to zero and the response appears after server confirmation.

Then simulate a version conflict by editing the same live response elsewhere before reconnecting. The offline copy must move to “needs attention”; it must not overwrite the newer server version.
