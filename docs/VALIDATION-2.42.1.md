# FieldLance 2.42.1 Validation

## Dedicated regression

`npm run test:project-workspace-2421`

Covers:

- package release and no-new-migration boundary;
- byte-identical routes, capability contract and global navigation implementation against 2.42.0;
- unchanged Project Workspace tab ID and route-tab sets;
- unchanged Project Manager / Area Focal Person capability boundaries;
- unchanged project-tab capability filtering;
- approved grouped desktop navigation map;
- mobile Project Section bottom-sheet presentation using the 2.42.0 primitives;
- project identity metadata from already-available AppShell context while preserving the existing title query;
- conservative display-only lifecycle stage derivation with a null/omit fallback;
- AppShell/page vs Project Workspace/entity heading ownership;
- browser back/forward and direct-deep-link source wiring;
- continued rendering of the existing detailed feature components and callbacks.

## FAST release validation

```bash
npm run test:project-workspace-2421
npm run test:ui-foundation-2420
npm run test:navigation-capability-24114
npm run test:routing-236
npm run test:mobile-production-24117
npm run release:consistency
npm run check
npm run build
git diff --check
```

Full historical `npm run preflight` is intentionally not part of 2.42.1 FAST validation because this patch does not touch DB/auth/RLS/finance calculation/security-critical behavior.
