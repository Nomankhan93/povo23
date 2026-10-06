# Upgrade to FieldLance 2.41.9

Frontend-only patch from 7780d95. No Supabase migration, grant change or hosted command is required. Preserve all applied migrations and existing recruitment/collection authorization.

Run npm run preflight and npm run test:browser-mobile-2419, plus the existing browser suites recorded in VALIDATION-2.41.9.md. Review the uncommitted diff before any separate commit/deployment authorization.

After an authorized web deployment, verify in a physical mobile browser: opportunity filters; offered/active/completed lifecycle; formal offers/assignments navigation; Home to field work; Updates and Tasks; sync/offline labels; survey sections, validation, draft recovery and submit; bottom-nav clearance.

If a later authorized release needs rollback, use the prior approved frontend artifact. This patch has no database rollback. No Git push, merge, Vercel deployment or hosted Supabase change is authorized by these notes.
