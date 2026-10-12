# Upgrade to FieldLance 2.42.10

1. Start from the certified FieldLance 2.42.9 source, including the `test-attendance-client2401.mjs` 2.42.9 harness correction.
2. Apply the 2.42.10 patch; no Supabase migration is required.
3. Run `npm ci` in the normal development environment.
4. Run `npm run test:offline-mobile-24210` and the offline/mobile regression commands in `docs/VALIDATION-2.42.10.md`.
5. Verify Surveys / Attendance / Device on deployed mobile browser widths. Android-native smoke testing is outside FieldLance scope.
6. Run release consistency, TypeScript/build gates and final preflight before commit/deploy.

The patch does not alter encrypted local-store formats or backend authorization, so no device-data migration is expected.
