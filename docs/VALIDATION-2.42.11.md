# FieldLance 2.42.11 Validation

## Dedicated contract

```bash
npm run test:ui-consistency-24211
```

The dedicated suite protects the 87-migration boundary; route/capability/navigation and field-work contracts; dashboard read-only sources and Staff gates; missing-money display semantics; shared responsive table/form migration; captured confirmation context; ActionDialog accessibility; scoped token styling; approved 1023px/639px breakpoints; and 12px typography floor.

## Targeted regressions

```bash
npm run test:field-worker-workspace
npm run test:organization-workspace
npm run test:staff-operations
npm run test:analytics
npm run test:identity-workspaces
npm run test:ngo-application
node scripts/test-geography-reference.mjs
npm run test:navigation-capability-24114
npm run test:ui-foundation-2420
npm run test:accessibility-24120
npm run test:mobile-production-24117
```

## Browser/mobile regressions

```bash
npm run test:browser-mobile-2419
npm run test:browser-mobile-production-24117
```

Verify 360/390/430px layouts, no horizontal overflow, reachable row/card actions, focus-managed confirmations, and preserved marketplace/offline/mobile behavior.

## Release gates

```bash
npm run check
npm run build
git diff --check
npm run metadata:generate
npm run release:consistency
npm run preflight
```

No Android-native smoke test is required for FieldLance. Mobile acceptance remains the deployed browser/PWA surface.
