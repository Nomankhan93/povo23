# Upgrade to FieldLance 2.39.0

Upgrade from the validated FieldLance 2.38.1 baseline. Do not reset the database.

## Forward migration

`20261013000430_case_ownership_delegated_operations.sql`

The migration adds case ownership/history tables, bounded delegated-case RPCs, ownership-aware follow-up task assignment and guarded Field Worker / Area Focal follow-up authority.

No existing beneficiary case, follow-up, assistance, task, payable or finance record is rewritten into a new subsystem.

## WSL validation

```bash
cd /home/noman/projects/poem-phase1.1
nvm use
npm ci
npx supabase start
npx supabase migration up --local
npm run types:generate
npm run types:check
npm run metadata:generate
npm run metadata:check
npm run test:case-ownership-239
npm run preflight
npm run test:local
```

Only after all local validation passes:

```bash
npx supabase db push
```

Expected new migration:

`20261013000430_case_ownership_delegated_operations.sql`
