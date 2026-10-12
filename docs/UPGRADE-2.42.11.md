# Upgrade to FieldLance 2.42.11

1. Start from the certified FieldLance 2.42.10 source, including the final browser-harness corrections.
2. Apply the 2.42.11 patch. No Supabase migration is required.
3. Run `npm ci` in the normal development environment.
4. Run `npm run test:ui-consistency-24211` and the targeted regressions in `docs/VALIDATION-2.42.11.md`.
5. Verify all three dashboards and the five migrated operational record surfaces at desktop and 360/390/430px mobile-browser widths.
6. Run TypeScript/build, metadata/release consistency and final `npm run preflight` before commit/deploy.

2.42.11 is a frontend consistency release. It does not change persisted data formats, recruitment/survey/case/attendance/finance state machines, RLS, capabilities or routes.
