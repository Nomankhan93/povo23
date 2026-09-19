# Upgrade to FieldLance 2.19.6

Required baseline: validated FieldLance 2.19.5 with migration head `20261009000500_fieldlance_brand_compatibility.sql`.

1. Run the guarded patch installer with `--check`.
2. Apply the patch only if no conflict is reported.
3. Run `npm ci --include=dev`.
4. Run `npm run metadata:check` after the patch; generated metadata is included and should already match.
5. Run `npm run test:visual-system`.
6. Run `npm run test:branding`, `npm run test:frontend-foundation` and the normal preflight/regression suites.
7. Start local Supabase and confirm `npx supabase migration list` still ends at `20261009000500` on both Local and Remote.

FieldLance 2.19.6 is migration-free. Do not create or push a database migration for this patch.
