# Upgrade to FieldLance 2.41.10

This release adds one forward migration:

`20261013000570_security_advisor_rpc_surface_hardening.sql`

Do not edit or reorder earlier migrations. Apply on the local FieldLance Supabase stack first:

```bash
cd /home/noman/projects/poem-phase1.1
nvm use
npx supabase migration up --local
npm run test:security-advisor-24110
npm run test:sql-authorization
npm run test:recruitment-hardening-2415
npm run test:collection-dates-2415
npm run preflight
```

Before any separately authorized remote database push, run `npx supabase db push --dry-run` and confirm only the intended pending migration is listed.

After the hosted migration is eventually authorized/applied, re-run Supabase Security Advisor. The retired review RPCs, `can_collect_project`, and `survey_assignment_candidates` should no longer appear as signed-in `SECURITY DEFINER` warnings. `verify_field_worker_certificate(text)` is an intentional public warning unless Supabase adds an allowlist/suppression mechanism; do not revoke it merely to make the dashboard green.

Enable leaked-password protection separately in hosted Supabase Auth settings when available for the project plan. That setting is not represented by this SQL migration.

No Git push, merge, Vercel deployment, hosted migration, or Auth-setting mutation is performed by this patch package.
