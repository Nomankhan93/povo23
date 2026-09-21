# FieldLance 2.26 — Paid Work Funding Assurance & Project Finance Closure

## Purpose

2.26 protects paid field-work commitments without creating a second ledger or payment provider. Existing double-entry finance, workforce payable units, and the payable-to-finance bridge remain authoritative.

## Funding assurance

- Published paid opportunities are checked atomically while the project row is locked.
- A paid opportunity is rejected when reserved project coverage cannot support its structured rate and required volunteer exposure.
- Each accepted paid opportunity receives one immutable operational funding commitment.
- Pending commitments remain protected until expiry, cancellation, or assignment lifecycle release.
- Expired opportunities can be swept safely; active/completed assignments cannot be released as unused funds.
- `project_funding_assurance` exposes reserved balance, pending offers, active assignment exposure, available coverage, shortfall, and the paid-offer gate.

## Closure lifecycle

Projects now expose four distinct states:

```text
open
  → collection_closed
  → operational_completed
  → financially_reconciled
  → fully_closed
```

Collection closure stops new collection/recruitment. Operational completion requires no offered or active assignments. Financial reconciliation requires matched payable/finance bridge results and no pending funding commitments. Final closure is only available after those controls pass.

## Safety boundaries

- No live payment provider, bank API, IBAN flow, or fake settlement integration is introduced.
- Finance balances remain derived from immutable postings.
- Funding commitments are protected by RLS and guarded RPCs.
- The migration is forward-only and must be applied after the 2.25.1 identity migration.
