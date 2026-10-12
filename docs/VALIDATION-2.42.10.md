# FieldLance 2.42.10 Validation

## Dedicated contract

```bash
npm run test:offline-mobile-24210
```

This protects the migration boundary, offline-store hashes, SurveyForm/Attendance implementation, Surveys/Attendance/Device structure, sync recovery identity, typed device erase and 2.42 design-system contract.

## Targeted regressions

```bash
npm run test:device-recovery-241
npm run test:corrective-2411
npm run test:browser-network-2412
npm run test:browser-mobile-2419
npm run test:mobile-production-24117
npm run test:browser-mobile-production-24117
npm run test:survey-collection-responses-2423
npm run test:attendance-timesheets-2425
npm run test:field-stabilization-2401
npm run test:beneficiary-cases-2429
```

Browser tests should verify downloaded project selection, offline/online transitions, failed-survey retry/recovery, attendance embedding, device inventory, 48px mobile controls, typed erase, and focus restoration in dialogs.

## Release gates

```bash
npm run metadata:generate
npm run release:consistency
npm run types:check
npm run check
npm run build
git diff --check
npm run preflight
```

No Android-native smoke test is required for FieldLance. Mobile acceptance is performed in the deployed mobile browser/PWA surface.
