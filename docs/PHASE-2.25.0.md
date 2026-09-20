# FieldLance 2.25.0 — Earnings, Wallet & Withdrawal UX

## Objective

Turn the already-built payable/e-wallet/withdrawal core into one understandable finance journey for Field Workers, Organizations and FieldLance Finance without changing accounting authority.

## Field Worker experience

- **Earnings** home with approved, available, pending-withdrawal and paid-out metrics.
- Paid-contract and withdrawal activity summaries.
- A visible lifecycle: Earn → Approve → Available → Withdraw → Settled.
- Contextual next action for wallet setup, available balance or a pending withdrawal.
- Existing payable-unit ledger embedded for claims/disputes and immutable accounting detail.
- Wallet & withdrawals keeps wallet binding, mock verification, PIN security, activation hold, withdrawal request and history.

## Organization experience

- Public label becomes **Field Worker payables** while the internal route stays `Workforce payables`.
- Existing paid assignments, contract amendments, payable approval/dispute/rejection/adjustment/payment journal and receipt controls remain authoritative.
- Manual accounting remains clearly distinct from moving money through a provider.

## FieldLance Finance experience

- Public label becomes **Payout operations** while the internal route stays `Withdrawal operations`.
- Finance attention metrics summarize requested, approved/processing, failed and reconciliation states.
- Quick status filters improve queue handling.
- Existing payout policy, dual control, manual settlement, failure/reversal and reconciliation RPCs remain unchanged.

## Boundaries

- No database migration.
- No new balance table or duplicate ledger.
- No live JazzCash/Easypaisa API.
- No bank/IBAN payout.
- No editable finance balances.
- Existing 2.18.x payment architecture stays frozen as the source of truth.
