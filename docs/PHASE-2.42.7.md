# FieldLance 2.42.7 — Project Team / Team & Access

FieldLance 2.42.7 modernizes the existing Project Team experience into a focused Team & Access workspace without changing staff authorization, recruitment, collection eligibility, finance/payables behavior, routes, capability contracts, RPCs, RLS or database state.

## Team & Access workspace

- Establishes Team & Access / Project team as the primary information hierarchy.
- Keeps NGO-level project selection and Project Workspace single-project integration intact.
- Shows compact project context, the current user's visible role/access and returned scope where available.
- Adds presentation-only roster summaries for Active staff, Project Managers, Area Focal Persons and Revoked assignments.
- Uses shared DataTable on desktop and MobileRecordCard on mobile.
- Adds an authorized local All / Active / Revoked roster filter over the already-returned roster only.

## Staff management

Authorized team managers retain the existing `project_staff_candidates`, `assign_project_staff`, `revoke_project_staff` and `project_staff_roster` contracts. Project Manager and Area Focal assignment semantics remain unchanged, including project-date limits, Area Focal area selection and Project Manager no-area behavior.

Revocation now uses the shared reason dialog with meaningful staff/role/scope context while retaining the audited reason requirement and existing RPC.

## Read-only operational context

Project Managers / Area Focals without team-management authority receive an operational context view rather than disabled administration controls. Existing RLS-filtered Active survey assignments, Pending review, Approved, Corrections, Rejected, visible assignment areas, latest visible responses and quick actions remain in place. Historical records continue not to establish collection eligibility; accepted active contracts remain required.

## Staffing policy and compensation

Recruitment capacity and compensation defaults remain secondary to Team & Access. Existing recruitment target/capacity semantics and compensation snapshot behavior are unchanged. Project Managers do not gain compensation-default authority.

## Presentation architecture

- Adds `src/features/projects/ProjectTeamWorkspace.module.css`.
- Migrates Project-Team-owned legacy global selectors out of `src/styles/design-system.css` while retaining shared selectors used by Project Overview / Finance.
- Uses shared 2.42 UI primitives for cards, metrics, forms, statuses, tables, mobile records, buttons and reason dialogs.
- New Project Team CSS has no hard-coded colors, no `!important`, no operational typography below 12px and only the approved 1023px / 639px feature breakpoints.

## Backend boundary

No migration, schema, RLS, RPC signature/implementation, grant or Supabase deployment change is included. Migration inventory remains 87 files with head `20261013000580_project_lifecycle_e2e_integrity.sql`.
