# POEM 2.18.1 — E-Wallet & Withdrawal Stabilization

## Objective

Stabilize the 2.18.0 JazzCash/Easypaisa mock payout contract before any live provider adapter is introduced. This release does **not** add live JazzCash/Easypaisa APIs and does **not** add bank/IBAN payout methods.

## Audit-driven hardening

### Wallet identity and binding

- One active JazzCash number may belong to only one POEM account at a time; the same rule applies independently to Easypaisa.
- The same mobile number may still be used once for JazzCash and once for Easypaisa because provider namespaces are independent.
- Verified wallet details remain immutable. A user must unlink and relink to change a verified wallet, so ownership verification is never silently preserved across number/title edits.
- Verification callbacks now have an immutable provider-scoped event record. Reusing the same provider event key for a different wallet/outcome is rejected.

### Activation hold

A newly verified wallet enters a 24-hour withdrawal activation hold. This reduces the risk of an account takeover immediately linking and withdrawing to a new wallet. In the development-only mock sandbox, POEM Admin can explicitly bypass that hold for test execution; the bypass is event-keyed and audited. A live provider adapter must not silently inherit this development override.

### Transaction PIN lockout

The six-digit transaction PIN remains server-hashed. 2.18.1 adds persisted failed-attempt state:

- 5 failed PIN checks trigger a 15-minute lock.
- Correct PIN cannot bypass an active lock.
- Lock state and remaining attempts are returned only through the personal guarded RPC.
- The old unaudited `configure_withdrawal_pin` browser mutation is revoked. The UI uses `configure_withdrawal_pin_secure`, which shares the same failed-attempt protection as withdrawals.

### Withdrawal serialization and idempotency

Withdrawal creation now locks the account before checking `request_id`, so concurrent replays for the same user cannot both pass the initial idempotency lookup. Existing exact payable-unit allocation continues to prevent double withdrawal.

### Payable-reservation boundary

2.18.0 allowed the controlled settlement path through a custom session GUC. 2.18.1 removes that trust signal. While a payable unit is reserved by a pending withdrawal:

- a payment is allowed only when its `request_id` exactly matches the allocation's server-generated `payment_request_id`, assignment and amount;
- a provider reversal is allowed only when its `request_id` and `reverses` event exactly match the allocation's server-generated reversal identity;
- ordinary NGO adjustment/payment/reversal remains blocked.

The existing 2.17.2 payable→finance bridge remains authoritative for `Committed ↔ Spent` movement.

## User experience

The personal E-Wallet workspace now shows:

- verification state and masked wallet number;
- activation-hold/withdrawal-eligible state;
- PIN attempts remaining / temporary lock state;
- only withdrawal-eligible verified wallets in the withdrawal selector.

The POEM Admin mock sandbox adds a clearly labelled **Activate now (mock)** development control for a verified wallet still inside the activation hold.

## Explicit exclusions

- No live JazzCash API.
- No live Easypaisa API.
- No provider secrets or signature verification.
- No bank account, IBAN or bank-transfer payout path.
- No replacement of `work_payable_*` or the central finance ledger.
