# FieldLance 2.42.11 — Dashboards + Dialogs / Tables / Forms Consistency

2.42.11 closes the 2.42 UI consistency series across the three role dashboards and the remaining high-value operational tables/forms without changing backend authority or workflow state machines.

## Stage A — Dashboards

- Field Worker, Organization and FieldLance Staff dashboards move to scoped 2.42 CSS modules.
- Shared `MetricCard`, `StatusBadge` and `Alert` presentation replaces dashboard-local metric/status/error styling.
- `MetricCard` gains an optional native-button action mode while existing non-interactive cards remain compatible.
- Field Worker earnings and Staff payout rows distinguish unavailable/malformed finance values from a real numeric zero.
- Existing read-only dashboard sources, navigation callbacks and Staff capability gates remain unchanged.

## Stage B — tables and touched forms

The five audited raw operational-table surfaces use shared desktop `DataTable` and mobile `MobileRecordCard` presentation:

- Reports & Analytics
- Geography Manager
- Organization application review
- Volunteer / Field Worker Directory
- Organization Memberships

Only forms on these touched surfaces move to shared FieldLance fields/actions. Existing RPC names, argument shapes, filters, pagination, export limits and authorization boundaries remain unchanged.

## Stage C — dialogs and proven CSS cleanup

- `ActionDialog` keeps its existing API, focus containment, Escape handling, focus restoration, reason validation and busy semantics while moving to token-based 44px desktop / 48px mobile presentation at the approved 639px breakpoint.
- Organization-application decisions and membership role/status changes use shared confirmation dialogs with captured entity/action context.
- Proven-dead dashboard/reporting/action-dialog legacy CSS is removed; unrelated live legacy forms/dialogs remain in place.

## Database and authorization

No schema, migration, RLS, grant, route, capability or backend RPC change is included. The migration inventory remains 87 with `20261013000580_project_lifecycle_e2e_integrity.sql` as the head.
