# POEM 2.19.4 validation

## Automated checks

Run:

```bash
npm run test:frontend-foundation
npm run check
npm run preflight
npm run test:followup
npm run test:assistance
npm run test:distribution
npm run test:cases
npm run test:payments
npm run test:local
npm run test:operations
npm run release:consistency
```

Expected frontend-foundation result:

```text
5 POEM 2.19.4 frontend foundation scenarios passed.
```

## Browser smoke checks

- Project Manager with valid project scope can see Recruitment under the grouped sidebar.
- Authorized finance operator can see Withdrawal operations under the grouped sidebar.
- Needs and Survey list/detail pagination still moves backward/forward and disables buttons correctly while busy or at boundaries.
- The branded POEM favicon remains visible.

## Database expectation

No 2.19.4 migration exists. Local and remote migration history remains unchanged at `20261009000400_case_followup_outcomes_closure.sql`.
