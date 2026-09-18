# POEM Payments Deep Audit — baseline 2.18.0 → stabilization 2.18.1

## Audited payment/accounting chain

The current codebase has one coherent chain rather than parallel payment engines:

1. `20261008000400_project_compensation_assignment_contract.sql` — project compensation defaults, opportunity snapshots and immutable assignment contract terms.
2. `20260929000100_workforce_payables.sql` plus later payable fixes — worker entitlement units/events, receipts, amendments and NGO approval/payment actions.
3. `20261008000600_finance_core_double_entry_ledger.sql` + `00610` — immutable double-entry accounts/journals/postings and finance RLS helper permission repair.
4. `20261008000700_project_funding_reservation.sql` — verified organization funding plus project available/reserved/committed/spent buckets.
5. `20261008000800_payable_finance_bridge_reconciliation.sql` — idempotent bridge from monetary payable events to aggregate project finance.
6. `20261008000900_ewallet_mock_withdrawal_sandbox.sql` + `00910` — JazzCash/Easypaisa wallet binding, exact payable allocation reservation, mock provider settlement and default-wallet bug repair.
7. `src/features/payables/PayablesWorkspace.tsx`, `src/features/finance/ProjectFundingWorkspace.tsx`, `src/features/payments/*` — bounded operational UI for the same database workflows.

## Strong existing decisions retained

- `work_payable_*` remains the authoritative worker entitlement/payment subledger.
- Finance balances are derived from immutable postings; there is no editable balance column.
- Payable approval requires reserved project funding and bridges atomically into finance.
- Withdrawal requests reserve exact payable slices instead of decrementing a mutable wallet balance.
- Mock provider success writes existing payable `payment` events, so the 2.17.2 bridge remains the only `Committed → Spent` accounting path.
- Sensitive wallet/PIN/allocation/provider tables have no authenticated direct table grants.
- Wallet numbers are returned masked through guarded RPCs.
- End users cannot invoke mock verification/provider-success controls.
- JazzCash/Easypaisa-only scope is clean; bank/IBAN paths are absent.

## Gaps found in the 2.18.0 baseline

### High — settlement guard trusted a custom session GUC

`protect_wallet_reserved_payable_event()` allowed the controlled settlement path based on `current_setting('app.wallet_settlement', ...)`. A custom session setting is not a strong authorization token. 2.18.1 replaces it with exact server-generated allocation request identities (`payment_request_id` / `reversal_request_id`) plus unit/assignment/amount/reversal matching.

### High — no persistent PIN brute-force lockout

PIN hashes were protected and unreadable, but wrong PIN checks did not persist attempt counters. 2.18.1 adds five-attempt / 15-minute lockout state and closes the original browser PIN mutation RPC in favor of a lockout-aware secure flow.

### Medium — wallet number could be bound by multiple POEM accounts

The baseline limited one wallet per provider **per user**, but did not prevent the same active JazzCash number from being linked by two POEM accounts. 2.18.1 adds provider-scoped active wallet-number uniqueness.

### Medium — verification event identity was not globally protected per provider

`verification_reference` gave a wallet local replay marker, but the same verification event key was not stored in an immutable provider-scoped event table. 2.18.1 adds `e_wallet_verification_events` and rejects cross-wallet/outcome reuse for the same provider event key.

### Medium — newly verified wallet was immediately withdrawable

There was no cooling period after binding/verification. 2.18.1 adds a 24-hour withdrawal activation hold. The mock admin can explicitly bypass it only for development testing, with an audit/event record.

### Medium — request-id replay lookup occurred before account serialization

The baseline checked `request_id` before acquiring the account row lock. Two concurrent same-user requests could both observe no prior row and race to the unique constraint. 2.18.1 locks the account first, then performs the replay check and allocation.

### Low/UX — failure/cancel status had weaker user feedback

2.18.1 adds explicit withdrawal failure/cancel notifications while preserving the existing history status/error fields.

## Decisions intentionally not changed

- Verified wallet title/number is not edited in place. The stronger rule is unlink + relink + fresh verification.
- A withdrawal may aggregate earnings across multiple eligible projects; each allocation settles through its own payable/finance project context.
- Provider `succeeded` may follow `requested` directly because real providers may return immediate terminal success; `processing` is not mandatory.
- Failed/cancelled withdrawal allocation rows remain as immutable history; only active request statuses reserve balance.
- No bank API or bank payout schema is introduced.
- No live JazzCash/Easypaisa endpoint, credential or signature logic is invented without official provider documentation.
