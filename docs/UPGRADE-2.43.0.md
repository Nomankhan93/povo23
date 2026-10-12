# Upgrade to FieldLance 2.43.0

Baseline: FieldLance 2.42.11.

2.43.0 is a correctness migration. Apply the new migration in the normal linked Supabase deployment workflow only after local/PGlite validation is green.

## Migration

`20261013000590_data_integrity_reporting_consistency.sql`

The migration:

- fixes survey-review Task Center derivation for `correction_required` responses and repairs currently actionable rows;
- derives operational case due dates from scheduled structured follow-ups before falling back to the legacy case-level date;
- aligns direct-assignment work-history completion with staged project closure.

It does not change table shapes, RLS, grants, route/capability contracts, attendance/payable authority or finance calculations.

## Focused validation

```bash
npm run test:data-integrity-2430
npm run test:task-center
npm run test:analytics
npm run test:case-ownership-239
npm run test:beneficiary-cases-2429
npm run test:project-lifecycle-24115
npm run test:attendance-timesheets-2425
npm run test:finance-payables-2428
```

Because this is a database/data-correctness release, final certification must include the full preflight and the normal migration lint/deployment checks.
