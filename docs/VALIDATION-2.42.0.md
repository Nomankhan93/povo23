# FieldLance 2.42.0 Validation

## Dedicated regression

`npm run test:ui-foundation-2420`

Covers:

- package release and no-new-migration boundary;
- byte-identical `routes.ts` and `capabilityContract.ts` against the uploaded 2.41.20 baseline;
- Field Worker Attendance/Timesheets navigation grouping;
- Organization Direct invitations grouping;
- absence of accidental `Other tools` for full Personal and Organization authorized page sets;
- preserved Field Worker mobile Home / Work / Field / Earnings / Profile destinations;
- authorized-only Organization and Staff mobile primary navigation;
- unchanged Project Workspace tab ID set;
- grouped Project Workspace desktop sections and mobile Project Section selector;
- shared 2.42.0 token/component implementation;
- preservation of existing project workflow component/callback wiring.

## FAST release validation

```bash
npm run test:ui-foundation-2420
npm run test:navigation-capability-24114
npm run test:routing-236
npm run test:mobile-production-24117
npm run release:consistency
npm run check
npm run build
git diff --check
```

Full historical `npm run preflight` is intentionally not part of the 2.42.0 patch validation because this change does not touch DB/auth/RLS/finance calculation/security-critical behavior.
