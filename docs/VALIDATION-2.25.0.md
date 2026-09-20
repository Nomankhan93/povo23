# FieldLance 2.25.0 validation

## Automated contract

Run:

```bash
npm run test:earnings-wallet
```

The regression contract checks versioning, personal finance navigation, authoritative earnings sources, payable/provider separation, wallet/PIN controls, Organization payable reuse, Staff payout/reconciliation reuse, explicit manual/mock provider boundaries, responsive styles and unchanged migration head.

## Full validation

```bash
npm run metadata:check && \
npm run check && \
npm run test:earnings-wallet && \
npm run test:payments && \
npm run test:notification-center && \
npm run test:task-center && \
npm run test:staff-operations && \
npm run test:organization-workspace && \
npm run test:field-worker-workspace && \
npm run test:workforce-marketplace && \
npm run test:ngo-application && \
npm run test:visual-system && \
npm run test:branding && \
npm run test:frontend-foundation && \
npm run preflight && \
npm run test:local && \
npm run test:operations
```

## Browser checks

1. Field Worker Home → Earnings opens the new finance overview.
2. Earnings metrics match Wallet & withdrawals summary.
3. Earnings ledger still permits only existing worker actions; self-approval/payment is unavailable.
4. Wallet setup, PIN, activation hold, request and cancellation rules remain intact.
5. Organization workspace shows **Field Worker payables** and existing payable controls.
6. FieldLance Staff shows **Payout operations**, summary metrics, status filters and existing settlement/reconciliation controls.
7. Manual/mock provider wording is visible; no UI claims a live provider API is connected.
8. Desktop/tablet/mobile layouts show no horizontal page overflow.

## Database

No migration is added. Expected latest migration remains:

`20261009000800_notifications_communication_center.sql`
