# POEM 2.18.2 — Withdrawal Operations, Manual Settlement & Provider Reconciliation

## Objective

Make the JazzCash/Easypaisa payout module operational before live provider APIs are available, without creating a second entitlement or accounting engine.

## Operational lifecycle

`requested → approved → processing → succeeded | failed`, with `succeeded → reversed` when an already-recorded provider payout is reversed.

- A user requests withdrawal only from approved unpaid PKR payable entitlement.
- Exact payable allocations remain reserved while status is `requested`, `approved` or `processing`.
- POEM Finance/Admin approves the request for `manual` execution.
- POEM Finance/Admin records provider processing.
- After paying through the real JazzCash/Easypaisa app/portal, the operator records the external provider transaction/reference and settlement date.
- Settlement creates the existing `work_payable_events` payment rows for the exact reserved allocations. The 2.17.2 bridge then moves project finance `Committed → Spent`.
- Failure creates no payment event and releases the reserved entitlement.
- Reversal creates existing `payment_reversal` events and the finance bridge restores `Spent → Committed`.

## Controls

- Configurable minimum, maximum-per-request and daily PKR limits.
- Configurable dual-control threshold. At/above the threshold, the approver cannot record settlement; a different POEM finance administrator must do it.
- Manual execution can be disabled centrally without disabling the mock development sandbox.
- External provider references are unique per provider and cannot settle two withdrawals.
- Manual operation request IDs are idempotent and operation history is append-only.
- Users cannot approve, process, settle, fail or reverse their own withdrawals.
- Wallet numbers remain masked in browser-facing RPCs.

## Reconciliation

The finance workspace compares each withdrawal against:

1. reserved withdrawal allocations,
2. payable payment/reversal events,
3. `finance_payable_event_links`, and
4. manual provider settlement/reversal references.

Rows are reported as `matched` or with an explicit issue such as allocation mismatch, payment mismatch, reversal mismatch, finance-bridge mismatch or missing external reference.

## Provider boundary

Only JazzCash and Easypaisa are supported. This release does **not** call either provider API and does not include bank/IBAN payout methods. The mock provider remains available for development, while manual settlement is the operational fallback until official provider adapters are connected.
