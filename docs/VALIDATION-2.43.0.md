# FieldLance 2.43.0 Validation

## Local migration parity first

The installer does not apply database migrations. With the local Supabase stack running, apply and verify the r1 migration before local DB smoke/manual verification:

```bash
cd /home/noman/projects/poem-phase1.1
nvm use
npx supabase status
npx supabase migration up --local
npx supabase migration list
```

Expected local migration head: `20261013000600_data_integrity_reporting_security_fix.sql`. PGlite schema tests still load migration files independently, so this local migration step does not replace the dedicated automated suite.

## Dedicated integrity suite

```bash
npm run test:data-integrity-2430
```

The suite verifies:

- package/lockfile 2.43.0 and r1 migration head/count;
- `correction_required` survey responses retain an actionable survey-review task;
- existing actionable responses are repairable without widening Task Center authority;
- operational due-case reporting follows the earliest scheduled structured follow-up and falls back to `beneficiary_cases.follow_up_on` only when needed;
- the due-date helper is `SECURITY DEFINER` but authorization-gated, unauthorized workers receive `NULL`, and `authenticated` still has no direct SELECT on `beneficiary_case_followups`;
- `analytics_rows()` remains `SECURITY INVOKER`;
- the collection fixture uses the canonical accepted-work-assignment path;
- survey correction and follow-up cancellation fixture transitions use their versioned public RPCs so revision snapshots advance versions canonically;
- collection closure does not prematurely mark direct-assignment work complete;
- operational completion does mark that historical project work complete;
- closed projects remain reportable for historical response/case facts;
- attendance, payables, recruitment and project-closure authority functions are not replaced by this patch.

## Targeted regressions

```bash
npm run test:task-center
npm run test:analytics
npm run test:case-ownership-239
npm run test:beneficiary-cases-2429
npm run test:project-lifecycle-24115
npm run test:attendance-timesheets-2425
npm run test:finance-payables-2428
npm run test:field-worker-workspace
npm run test:organization-workspace
npm run test:staff-operations
```

## Release gates

```bash
npm run types:check
npm run check
npm run build
git diff --check
npm run metadata:generate
npm run release:consistency
npm run preflight
```

For the migration itself, also run the normal PostgreSQL/Supabase lint and linked migration verification used for DB releases before production deployment.
