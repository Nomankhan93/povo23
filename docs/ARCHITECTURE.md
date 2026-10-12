# Current architecture note — FieldLance 2.42.11

2.42.11 extends the feature-local 2.42 presentation architecture to the three role dashboards and the remaining audited operational record surfaces. Dashboard CSS is scoped per feature, shared `MetricCard`/`StatusBadge`/`Alert` primitives own repeated presentation, and Reports/Geography/Organization review/Volunteer Directory/Memberships use shared desktop `DataTable` plus mobile `MobileRecordCard` patterns. Only forms adjacent to those surfaces are migrated.

`ActionDialog` keeps its behavioral API and focus contract while its presentation moves to the current token/target-size contract. Organization-review and membership confirmations capture the selected entity/action payload before confirmation. Existing data sources, pagination, RPC argument shapes, routes, capability rules and backend authorization remain authoritative.

# Historical architecture note — FieldLance 2.42.10

2.42.10 extends the feature-local 2.42 presentation architecture to Offline / Mobile Field. `OfflineFieldWorkspace.module.css` and `SurveySyncStatus.module.css` own field-workspace layout while shared 2.42 primitives own tabs, metrics, tables/mobile records, statuses, alerts, buttons and dialogs. SurveyForm and AttendanceWorkspace remain separate existing feature workspaces and are embedded without redesign.

Encrypted survey/attendance stores, owner/generation guards, attachment resume state, stable request IDs, recovery-copy rules, service-worker shell and backend authorization remain unchanged. Device erase still clears local copies only and explicitly leaves server records unchanged; case operations, finance and basemaps remain unavailable offline.

# Historical architecture note — FieldLance 2.42.9

2.42.9 extends the feature-local 2.42 presentation architecture to Beneficiary Cases. `BeneficiaryCasesWorkspace.module.css` and `DelegatedCasesWorkspace.module.css` own case-surface layout/responsive presentation while shared 2.42 primitives own metrics, tabs, tables, mobile records, statuses, alerts, filters and buttons. Existing case-detail workflows continue to call the same guarded RPCs.

Client correctness changes are limited to create-intent identity: one exact case/request/plan/follow-up payload keeps one caller-generated UUID until success, matching the idempotent replay behavior already implemented by the backend. Delivered-assistance retry identity, duplicate-support controls, follow-up location evidence, ownership, closure eligibility, RLS and RPC authorization remain unchanged. No schema or migration change is included.

# Historical architecture note — FieldLance 2.42.8

2.42.8 extends the feature-local 2.42 presentation architecture to Workforce Payables and Project Finance. `PayablesWorkspace.module.css` and `ProjectFundingWorkspace.module.css` own target-surface layout/responsive presentation while shared 2.42 primitives/tokens own controls, cards, metrics, tables, mobile records, statuses, alerts and confirmations.

Payables remain an assignment-first subledger: paid assignment selection precedes `work_payable_statement`, payable-unit accounting and the immutable event journal. Project Finance remains an aggregate immutable-ledger view using existing funding status/assurance/reconciliation/closure/history contracts. No organization-wide payable aggregation or funding approval queue is introduced.

Client correctness additions are limited to context-safe Project Funding loading, captured financial confirmation payloads and successful-only funding-source form reset. PostgreSQL RPCs/RLS remain authoritative. `fundingRequest.ts` keeps the existing stable request identity and uncertain-retry semantics unchanged. No schema or migration change is included.
