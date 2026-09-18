# POEM 2.18.2 validation

Required release gates:

- `npm run types:generate`
- `npm run preflight`
- `node scripts/test-phase217.mjs`
- `node scripts/test-phase2171.mjs`
- `node scripts/test-phase2172.mjs`
- `node scripts/test-phase218.mjs`
- `node scripts/test-phase2181.mjs`
- `node scripts/test-phase2182.mjs`
- `npm run test:local`
- `npm run test:operations`
- `git diff --check`

2.18.2 scenarios cover payout-policy permissions/limits, manual approval, reservation continuity through `approved`, processing, dual-control settlement, external-reference uniqueness, manual failure release, exact payable/finance posting, provider reconciliation, reversal, operation-history privacy and JazzCash/Easypaisa-only scope.

The manual path is an operational record of a payment executed outside POEM through the provider app/portal. It is not a provider API simulation and does not authorize arbitrary ledger mutation.
