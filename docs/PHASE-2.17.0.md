# POEM 2.17.0 — Finance Core & Double-Entry Ledger

## Goal

Add a provider-independent central financial ledger without replacing the existing worker payable subledger.

## New database foundation

- `finance_accounts` — immutable scoped account metadata with account class, purpose and currency.
- `finance_journals` — append-only posted journal header with organization/project scope, source reference, idempotency key, memo and reversal lineage.
- `finance_postings` — immutable debit/credit lines.

## Accounting invariants

- A journal has at least two postings.
- Total debit amount must equal total credit amount.
- Every posting account uses the same currency as the journal.
- Organization journals cannot post to accounts belonging to another organization.
- Project journals cannot post to another project's scoped account.
- Balances are derived from postings; no mutable balance field exists.
- Posted history is never edited/deleted. Corrections create a reversal journal.
- Exact retries are idempotent and source/type references are exactly-once.

## Authorization

Generic finance account creation, journal posting and reversal are limited to active POEM `admin` / `super_admin` accounts. An active NGO Admin may read the ledger for its own organization. Project Manager, Area Focal and volunteers do not receive finance access from their operational roles.

This is deliberate: 2.17.1 will add constrained project-funding/reservation commands rather than exposing generic journal creation to NGOs.

## Existing payable subsystem

`work_payable_units`, `work_payable_events`, `work_payable_receipts` and `work_contract_amendments` remain unchanged and authoritative for worker entitlement. 2.17.0 does not create a payable bridge. The idempotent payable-event → finance-journal bridge is 2.17.2.

## Explicitly out of scope

- Project funding/reservation business workflow — 2.17.1
- Payable-event finance bridge/reconciliation — 2.17.2
- JazzCash/provider callbacks, withdrawals and settlement — 2.18
