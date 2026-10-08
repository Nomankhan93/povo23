# Upgrade to FieldLance 2.41.17

Apply to the validated 2.41.16 source tree. This is a frontend/config/documentation release with no Supabase database migration.

Run the FAST validation gates:

```bash
npm run test:mobile-production-24117
npm run test:production-web-24116
npm run test:browser-mobile-production-24117
npm run release:consistency
npm run check:release-secrets
npm run check
npm run build
git diff --check
```

The composed browser command is intentionally narrower than full historical `npm run preflight`; it exercises the existing mobile, attendance, network and map browser suites that matter for this release.

After deployment set `FIELDLANCE_PRODUCTION_URL=https://app.fieldlance.app` (or the actual canonical origin) and run `npm run check:mobile-production-24117`. Then complete `MOBILE-PRODUCTION-ACCEPTANCE-2.41.17.md` on physical mobile browsers.

Do not run `supabase db push` or `supabase migration up --local` for 2.41.17; the migration head remains `20261013000580_project_lifecycle_e2e_integrity.sql`.
