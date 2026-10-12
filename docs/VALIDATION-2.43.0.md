# FieldLance 2.43.0 Validation

## Dedicated integrity suite

```bash
npm run test:data-integrity-2430
```

The suite verifies:

- package/lockfile 2.43.0 and migration head/count;
- `correction_required` survey responses retain an actionable survey-review task;
- existing actionable responses are repairable without widening Task Center authority;
- operational due-case reporting follows the earliest scheduled structured follow-up and falls back to `beneficiary_cases.follow_up_on` only when needed;
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
