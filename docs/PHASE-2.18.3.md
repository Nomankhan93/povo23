# POEM 2.18.3 — Payments Release Consolidation & Operations QA

## Objective

Freeze the provider-independent payment core after 2.18.0–2.18.2 stabilization without adding a new database model or pretending that JazzCash/Easypaisa live APIs are connected.

## Consolidated runtime fixes

- Wallet-owner normalization uses a wallet-specific helper rather than colliding with canonical beneficiary identity normalization.
- Default-wallet verification is scoped to the wallet owner and serialized.
- Activation idempotency tests compare timestamp values rather than JavaScript `Date` object identity.
- Historical 2.18 UI regression checks validate current manual/mock semantics instead of one obsolete copy phrase.
- 2.18.2 regression tests read sensitive withdrawal state through guarded RPCs instead of direct table SELECT.

## Release QA

`npm run test:payments` runs 2.17.0, 2.17.1, 2.17.2, 2.18.0, 2.18.1, 2.18.2 and 2.18.3. The 2.18.3 suite verifies migration freeze, sensitive-table privileges, role separation, provider scope, regression-test hygiene and release documentation.

## Operational freeze boundary

Current supported payout methods are JazzCash and Easypaisa. Mock execution is for development/testing; manual execution lets POEM Finance record a real external provider transaction reference after an operator completes the transfer outside POEM. Live provider adapters remain future work and must reuse the same allocation, idempotency, dual-control and reconciliation rules.

## Database

No new migration. Migration head remains `20261008000930_withdrawal_operations_manual_settlement.sql`.
