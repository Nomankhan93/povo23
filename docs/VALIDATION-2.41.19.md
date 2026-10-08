# FieldLance 2.41.19 Validation

## Targeted static regression

`node scripts/test-observability24119.mjs`

Expected: 8 scenarios pass covering release registration, uncaught-error containment, redaction/memory-only diagnostics, RPC/database transport instrumentation, auth/workspace/service-worker diagnostics, offline/map/notification diagnostics, safe context exclusions and the no-migration/no-remote-telemetry boundary.

## Required local validation before commit

```bash
npm run test:observability-24119
npm run test:performance-24118
npm run test:workspace-refresh-24113
npm run test:notification-routing-2413
npm run test:mobile-production-24117
npm run check
npm run build
git diff --check
```

## Expected build properties

- TypeScript check passes.
- Vite production build remains code-split (2.41.18 performance boundaries preserved).
- Offline shell still precaches only critical assets.
- Existing `test-field-worker211.mjs` service-worker cache-safety checks pass from the normal build command.
- No Supabase migration is added.
