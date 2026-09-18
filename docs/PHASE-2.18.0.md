# POEM 2.18.0 — JazzCash & Easypaisa E-Wallet Binding + Mock Withdrawal Sandbox

## Objective

Build the payout-method and withdrawal lifecycle before live provider credentials exist, while preserving the existing worker-payable and immutable finance architecture. This release intentionally supports **JazzCash and Easypaisa only** and uses a clearly labelled mock provider.

## Data model

- `e_wallets` — owner, provider, normalized wallet mobile, account title, verification/default lifecycle.
- `e_wallet_security` — server-only transaction-PIN verifier.
- `e_wallet_withdrawals` — immutable request identity plus controlled lifecycle (`requested → processing → succeeded/failed`, optional `reversed`, or pre-processing `cancelled`).
- `e_wallet_withdrawal_allocations` — exact approved/unpaid payable-unit slices reserved by each active withdrawal.
- `e_wallet_provider_events` — idempotent mock callback/event keys.

Browser roles do not receive direct table grants. Read/write flows use guarded RPCs and return masked wallet numbers.

## Wallet binding

A personal account may maintain at most one active JazzCash wallet and one active Easypaisa wallet. The user submits the wallet, but only POEM Admin/Super Admin can run the mock verification outcome. Verification checks that the submitted account title matches the POEM account name before marking the wallet verified. This is only a development ownership simulation; it does not prove that the wallet number is actually owned by that person.

## Transaction PIN

Withdrawal requests require a six-digit transaction PIN separate from login credentials. The server stores only a cryptographic verifier using the database `crypt/gen_salt` extension functions. The verifier table is not readable by authenticated clients.

## Withdrawal reservation

Available withdrawal balance is derived from approved entitlement minus payments and active withdrawal reservations. Request creation locks/allocates exact payable units. While an allocation is active, competing adjustment/payment/reversal events on that unit are blocked unless the event is the controlled settlement for that withdrawal.

## Mock provider lifecycle

POEM Admin/Super Admin uses the dedicated **E-Wallet sandbox** workspace. `simulate_mock_e_wallet_provider()` supports development outcomes; the wallet owner cannot invoke these provider outcomes:

- `processing` — marks the request in progress.
- `succeeded` — writes one existing payable `payment` event per allocation; the 2.17.2 bridge moves aggregate project committed funding to spent.
- `failed` — releases the withdrawal reservation and creates no payable payment.
- `reversed` — creates payment-reversal events for a previously successful mock withdrawal.

Provider event keys are idempotent. Replaying the same event key/outcome returns current state and does not duplicate accounting events.

## Explicit exclusions

- No live JazzCash API.
- No live Easypaisa API.
- No provider credentials or callback signature verification.
- No bank accounts, IBAN or bank transfer.
- No provider clearing/custody implementation beyond the existing project funding/payable accounting buckets.

Live adapters must preserve the same request/allocation/idempotency rules rather than bypassing them.
