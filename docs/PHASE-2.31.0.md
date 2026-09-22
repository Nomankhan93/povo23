# FieldLance 2.31.0 — Operational Analytics, Dashboard Accuracy & Reporting

Organization, staff and project workspaces gain Reports & Analytics. Database-derived totals replace capped-list dashboard counts. Report rows and totals share the same authorized filtered dataset. Active assignments drill down to assignments; distinct workers are separately labelled.

Reports include projects, recruitment, assignments, responses, cases, assistance and finance according to existing authority. Area Focal reports retain collection-area restrictions. Operational-only roles cannot access financial reports. Organization scope cannot widen project membership permissions.

Filters cover organization, project, descendant geography, current status and inclusive UTC dates. Dates mean creation time; profiles use last update. Monthly trends group records by creation month and current state, not historical transitions or conversion rates. Financial events are grouped separately by currency and event; they are not wallet balances or available funding.

Pages contain 50 records. CSV exports include all filtered records up to 5,000; larger exports are refused. Exports are audited and spreadsheet formulas neutralized. Export fields exclude survey answers, beneficiary identity details and private documents. Operational worker names remain visible only to authorized managers.

Dashboard previews remain small recent samples. Exact metrics come from the reporting RPC. No funding or entitlement logic changes. Apply the additive migration; do not reset the database.
