# Upgrade to FieldLance 2.19.5

Required baseline: validated POEM/FieldLance 2.19.4 frontend foundation.

1. Run the guarded patch installer with `--check`.
2. Apply the patch only if no conflict is reported.
3. Run `npm ci --include=dev`.
4. Run `npm run types:generate`.
5. Start local Supabase and apply migrations locally.
6. Run `npm run test:branding` and the normal regression/preflight suites.
7. Only after all validation passes, run `npx supabase db push`.

The only database change is the forward-only FieldLance beneficiary identifier compatibility migration. Historical `POEM-BEN-` lookup remains supported.
