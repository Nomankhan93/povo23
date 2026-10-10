# FieldLance 2.42.9 validation

## Dedicated regression

```bash
npm run test:beneficiary-cases-2429
```

The dedicated test protects:

- 2.42.9 package/lock version consistency;
- unchanged migration inventory and protected route/capability/project integration files;
- existing case, ownership, assistance, distribution, duplicate-support, follow-up and closure RPC names;
- desktop tables and mobile record cards for manager and delegated queues;
- restricted delegated-case data boundaries;
- server-authoritative closure eligibility;
- stable client create identifiers for case/request/plan/follow-up retries;
- existing delivery-id retry behavior;
- visit-location evidence and no-background-tracking semantics;
- 44px desktop / 48px mobile target sizes, token-only feature CSS, approved breakpoints and >=12px typography.

## Required historical regressions

```bash
npm run test:cases
npm run test:distribution
npm run test:assistance
npm run test:followup
npm run test:case-ownership-239
npm run test:field-map-240
```

## UI / integration regressions

```bash
npm run test:project-workspace-2421
npm run test:ui-foundation-2420
npm run test:accessibility-24120
npm run test:mobile-production-24117
```

## Release gates

```bash
npm run release:consistency
npm run types:check
npm run check
npm run build
git diff --check
npm run preflight
```

No Android smoke test is part of this FieldLance web patch.
