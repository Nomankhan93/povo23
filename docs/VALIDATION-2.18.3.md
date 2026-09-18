# POEM 2.18.3 validation

## Automated gates

```bash
npm run types:generate
npm run test:payments
npm run preflight
npm run test:local
npm run test:operations
git diff --check
```

Expected payment-suite release tail:

```text
POEM 2.17.0 ... passed
POEM 2.17.1 ... passed
POEM 2.17.2 ... passed
POEM 2.18.0 ... passed
POEM 2.18.1 ... passed
POEM 2.18.2 ... passed
8 POEM 2.18.3 payments release consolidation / operations QA scenarios passed.
```

## Browser QA matrix

1. **Volunteer:** link JazzCash/Easypaisa, observe verification/activation hold, configure PIN, request eligible withdrawal, inspect masked history.
2. **POEM Admin:** mock-verify wallet and use only clearly labelled development activation controls.
3. **POEM Finance/Admin:** approve a manual withdrawal, start processing, record external provider reference, confirm matched reconciliation.
4. **Failure:** record provider failure and confirm reserved earnings return without payment.
5. **Reversal:** reverse a settled manual payout and confirm payable/finance reconciliation returns to matched state.
6. **Permissions:** volunteer, NGO Admin, Project Manager and Area Focal cannot use POEM provider/finance operations.

## Release boundary

No bank/IBAN payout, no embedded provider secrets and no claimed live JazzCash/Easypaisa API integration.
