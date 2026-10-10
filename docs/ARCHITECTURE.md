# Current architecture note — FieldLance 2.42.9

2.42.9 extends the feature-local 2.42 presentation architecture to Beneficiary Cases. `BeneficiaryCasesWorkspace.module.css` and `DelegatedCasesWorkspace.module.css` own case-surface layout/responsive presentation while shared 2.42 primitives own metrics, tabs, tables, mobile records, statuses, alerts, filters and buttons. Existing case-detail workflows continue to call the same guarded RPCs.

Client correctness changes are limited to create-intent identity: one exact case/request/plan/follow-up payload keeps one caller-generated UUID until success, matching the idempotent replay behavior already implemented by the backend. Delivered-assistance retry identity, duplicate-support controls, follow-up location evidence, ownership, closure eligibility, RLS and RPC authorization remain unchanged. No schema or migration change is included.

# Historical architecture note — FieldLance 2.42.8

2.42.8 extends the feature-local 2.42 presentation architecture to Workforce Payables and Project Finance. `PayablesWorkspace.module.css` and `ProjectFundingWorkspace.module.css` own target-surface layout/responsive presentation while shared 2.42 primitives/tokens own controls, cards, metrics, tables, mobile records, statuses, alerts and confirmations.

Payables remain an assignment-first subledger: paid assignment selection precedes `work_payable_statement`, payable-unit accounting and the immutable event journal. Project Finance remains an aggregate immutable-ledger view using existing funding status/assurance/reconciliation/closure/history contracts. No organization-wide payable aggregation or funding approval queue is introduced.

Client correctness additions are limited to context-safe Project Funding loading, captured financial confirmation payloads and successful-only funding-source form reset. PostgreSQL RPCs/RLS remain authoritative. `fundingRequest.ts` keeps the existing stable request identity and uncertain-retry semantics unchanged. No schema or migration change is included.
