# Upgrade to FieldLance 2.42.9

## Scope

This is a frontend case-operations modernization plus a narrow client retry-correctness improvement. It introduces no database migration.

## Before upgrading

- Start from the certified 2.42.8-r1 source.
- Keep the existing 87 migration inventory unchanged.
- Do not alter case/assistance RLS or RPCs for this patch.

## After upgrading

Run:

```bash
npm ci
npm run test:beneficiary-cases-2429
npm run test:cases
npm run test:distribution
npm run test:assistance
npm run test:followup
npm run test:case-ownership-239
npm run test:field-map-240
npm run test:project-workspace-2421
npm run test:ui-foundation-2420
npm run test:accessibility-24120
npm run check
npm run build
git diff --check
```

Because Beneficiary Cases is authorization- and assistance-sensitive, run the full preflight before release certification:

```bash
npm run preflight
```

## Behavioral notes

- Existing case routes and deep links are unchanged.
- Existing assistance and distribution state transitions are unchanged.
- An approved request remains permission to plan support; it is not a delivery ledger entry.
- Server closure eligibility remains authoritative.
- Repeating an uncertain create with the exact same payload now reuses the original client-generated identifier.
