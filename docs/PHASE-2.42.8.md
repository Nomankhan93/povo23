# FieldLance 2.42.8 — Payables & Project Finance UX

FieldLance 2.42.8 modernizes Workforce Payables and Project Funding on top of the existing 2.42 design system while preserving the authoritative payable, finance, authorization and retry contracts.

## Workforce Payables

- Reorganizes Payables around the existing assignment-first contract: paid assignments → selected assignment → server-calculated assignment summary → payable units → unit accounting → immutable journal.
- Uses shared `DataTable` presentation on desktop and `MobileRecordCard` presentation on mobile.
- Keeps the separate assignment, payable-unit and journal paging contracts at 50 rows per page.
- Labels assignment summary totals as server-calculated assignment totals rather than implying they are sums of the visible unit page.
- Preserves contract amendments, fixed-assignment completion claims, attendance-backed daily payables, earlier approved-survey recovery, receipt upload/download, payment references/dates, reversal references and immutable journal history.
- Uses context-bound confirmation before payable accounting mutations. The command snapshot contains the selected unit, unit version, action payload and one request ID; retry reuses the exact retained command.
- Keeps valid signed monetary values visible, including negative adjustments and overpayment/recovery balances. Missing, malformed or non-finite financial values are not fabricated as zero.

## Project Finance

- Reorganizes Project Funding into Funding Position, Paid Work Funding Assurance, Funding Operations, Payable → Finance Reconciliation, Project Finance Closure, Verified Funding Intake and Funding History.
- Uses only the existing record/reserve/release ledger operations; no funding-request approval state machine is introduced.
- Adds context-safe loading keyed to organization, project and currency. Late RPC/source results, late errors and late `finally` state from an obsolete context cannot overwrite a newer context.
- Clears old financial metrics while a new project/currency context is being verified, preventing mixed-context financial values/actions.
- Binds funding confirmations to a captured request payload and one stable idempotency key. Uncertain retries continue to use the existing `fundingRequest.ts` persistence/lookup behavior unchanged.
- Fixes funding-source authoring so failed source creation preserves entered fields; the form resets only after successful creation.
- Adds context-bound confirmation for historical payable reconciliation, expired commitment release and project-closure transitions.
- Replaces the stale version-specific closure note text with a neutral project-closure audit note; closure state/RPC semantics remain unchanged.
- Labels funding history as the latest 50 movements rather than implying a complete ledger export.

## Presentation architecture

- Adds `src/features/payables/PayablesWorkspace.module.css`.
- Adds `src/features/finance/ProjectFundingWorkspace.module.css`.
- Uses shared 2.42 cards, metrics, tables, mobile records, alerts, buttons, fields, statuses and confirmation dialogs.
- New feature CSS uses design tokens only, no hard-coded colors, no `!important`, no operational font below 12px, and only the 1023px / 639px responsive breakpoints.
- Desktop interactive controls enforce a 44px minimum target; mobile controls enforce 48px.
- Existing shared legacy finance CSS remains in place for Earnings/Wallet and other consumers; this release does not wholesale remove shared finance selectors.

## Backend and authorization boundary

No schema, migration, RLS, grant, finance RPC implementation, payable calculation, daily-payable generation, funding idempotency helper, route, capability or Project Workspace integration change is included.

Migration inventory remains 87 files with head `20261013000580_project_lifecycle_e2e_integrity.sql`.
