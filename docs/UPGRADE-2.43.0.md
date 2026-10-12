# Upgrade to FieldLance 2.43.0

Baseline: FieldLance 2.42.11.

2.43.0 is a correctness migration. Apply the new migration in the normal linked Supabase deployment workflow only after local/PGlite validation is green.

## Migrations

`20261013000590_data_integrity_reporting_consistency.sql`

`20261013000600_data_integrity_reporting_security_fix.sql`

The migration:

- fixes survey-review Task Center derivation for `correction_required` responses and repairs currently actionable rows;
- derives operational case due dates from scheduled structured follow-ups before falling back to the legacy case-level date;
- aligns direct-assignment work-history completion with staged project closure.

The r1 correction does not grant raw access to `beneficiary_case_followups`; `analytics_rows()` remains `SECURITY INVOKER`, while a narrowly scoped authorization-gated helper resolves canonical case due dates. It does not change table shapes, RLS policies, route/capability contracts, attendance/payable authority or finance calculations.

## Apply to local Supabase before local DB smoke checks

The patch installer copies migration files only; it does **not** mutate Local or Hosted Supabase. After applying the source patch, apply pending migrations to the running local Supabase stack explicitly:

```bash
cd /home/noman/projects/poem-phase1.1
nvm use
npx supabase status
npx supabase migration up --local
npx supabase migration list
```

Expected local head after r1: `20261013000600_data_integrity_reporting_security_fix.sql`. Do not push to Hosted Supabase until the dedicated integrity suite, analytics regressions and final preflight are green.

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
