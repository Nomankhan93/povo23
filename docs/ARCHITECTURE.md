# Current architecture note — FieldLance 2.42.8

2.42.8 extends the feature-local 2.42 presentation architecture to Workforce Payables and Project Finance. `PayablesWorkspace.module.css` and `ProjectFundingWorkspace.module.css` own target-surface layout/responsive presentation while shared 2.42 primitives/tokens own controls, cards, metrics, tables, mobile records, statuses, alerts and confirmations.

Payables remain an assignment-first subledger: paid assignment selection precedes `work_payable_statement`, payable-unit accounting and the immutable event journal. Project Finance remains an aggregate immutable-ledger view using existing funding status/assurance/reconciliation/closure/history contracts. No organization-wide payable aggregation or funding approval queue is introduced.

Client correctness additions are limited to context-safe Project Funding loading, captured financial confirmation payloads and successful-only funding-source form reset. PostgreSQL RPCs/RLS remain authoritative. `fundingRequest.ts` keeps the existing stable request identity and uncertain-retry semantics unchanged. No schema or migration change is included.
