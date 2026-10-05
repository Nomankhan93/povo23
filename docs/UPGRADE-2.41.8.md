# Upgrade to FieldLance 2.41.8

Frontend-only upgrade from the preserved 2.41.7 certification branch. Existing application statuses, RPCs, RLS and historical migrations remain unchanged. No database migration or Supabase command is required for this patch.

Validate with npm run preflight, npm run test:browser-recruitment-2418 and the six existing browser suites listed in VALIDATION-2.41.8.md. Check metadata, secrets and git diff --check before review.

Smoke-test worker Apply, formal offer acceptance, active assignment to field work, organization opportunity-filtered applications and staff submitted response review. Test Attendance at 360, 390 and 430 CSS pixels.

Hosted production remains frozen. This implementation does not authorize commit, push, merge or deployment. If a later authorized frontend release needs rollback, redeploy the previously approved frontend artifact; this patch requires no database rollback.
