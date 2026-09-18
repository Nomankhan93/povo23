# POEM 2.17.2 — Payable → Finance Bridge & Reconciliation

## Objective
Connect the existing worker-entitlement subledger to the immutable central finance ledger without creating a second payable engine.

## Accounting flow

- Payable approval / positive entitlement movement: project `reserved` → `committed`.
- Recorded payment: project `committed` → `spent`.
- Payment reversal: `spent` moves back according to the current outstanding entitlement.
- Negative entitlement adjustment: only unpaid commitment returns to `reserved`; prior recorded payments remain `spent` until an explicit payment reversal exists.

The bridge uses the existing payable event as the source of truth. It does not recompute rates, assignment terms, response eligibility or worker identity.

## Data model

`finance_payable_event_links` provides a unique immutable link from each monetary `work_payable_event` to its bridge result. Events with no aggregate finance movement are recorded as `no_movement`; events requiring movement reference exactly one balanced `payable_finance_bridge` journal.

## Funding safety

New monetary events bridge in the same database transaction. If a new payable approval would make project reserved funds negative, the whole approval is rejected and no payable event survives the transaction.

## Reconciliation

- `project_payable_finance_reconciliation()` compares payable-subledger totals with finance committed/spent balances.
- `reconcile_project_payable_finance()` replays historical unbridged events in bounded batches.
- `reconcile_work_payable_finance()` repairs one payable unit.

## Boundaries

No JazzCash/provider callback, withdrawal or provider-clearing flow is added. Project Manager and Area Focal do not gain central finance access.
