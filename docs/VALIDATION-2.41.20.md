# FieldLance 2.41.20 Validation

## Targeted regression

`npm run test:accessibility-24120`

Expected: 9 scenarios pass covering release registration, shared dialog labelling/focus containment, single-modal unsaved-authoring behavior, SPA/crash focus recovery, Partner Organization success-modal keyboard behavior, assertive error semantics, touch/reduced-motion/contrast/RTL CSS fallbacks, notification accessible naming and the no-migration/no-new-runtime-dependency boundary.

## Required local validation before commit

```bash
npm run test:accessibility-24120
npm run test:observability-24119
npm run test:performance-24118
npm run test:workspace-refresh-24113
npm run test:notification-routing-2413
npm run test:mobile-production-24117
npm run release:consistency
npm run check
npm run build
git diff --check
```

Full historical `npm run preflight` remains deferred to 2.42.0 release certification unless a later change touches DB/auth/RLS/finance/security-critical behavior.
