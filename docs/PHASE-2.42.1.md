# FieldLance 2.42.1 — Project Workspace Navigation & Header

## Goal

Refine the Project Workspace shell established in 2.42.0 so project identity, grouped navigation and mobile section switching stay clear at desktop, tablet and mobile widths without changing any project route, tab ID, capability, lifecycle or feature workflow.

## Presentation changes

- Added a reusable compact `ProjectWorkspaceHeader` using the 2.42.0 Operational SaaS tokens and shared `Button` / `StatusBadge` primitives.
- Project identity now shows the already-available project name, operational status, organization name, date range and exact project staff role when that role is already present in AppShell context.
- AppShell now owns only the generic `Project workspace` page context; Project Workspace owns the project-specific H2 identity, eliminating the duplicated project title hierarchy.
- Kept the approved grouped desktop navigation: Overview, Delivery, Impact and Administration. Existing capability filtering still removes unauthorized tabs before groups are rendered.
- Extended the existing `MobileSectionPicker` with an opt-in bottom-sheet presentation. Project Workspace uses this mode so mobile no longer relies on a horizontal 12-tab scroller and the current authorized section remains visible.
- Added a compact display-only lifecycle strip for Setup → Recruitment → Field Delivery → Review → Completion. A stage is highlighted only when existing project/status/date/closure data supports a reliable derivation; otherwise the strip is omitted.
- Preserved responsive title wrapping, 44px+ mobile controls, safe-area bottom-sheet padding, focus visibility, forced-colors treatment and reduced-motion behavior.

## Deliberately unchanged

- `src/app/routes.ts`, `src/app/capabilityContract.ts` and `src/app/navigation.ts` are byte-identical to the 2.42.0 baseline.
- All 12 Project Workspace tab IDs and URLs are unchanged.
- Existing browser route synchronization, back/forward handling and direct project deep links remain wired through the same callbacks.
- Existing Project Workspace capability booleans remain the only frontend tab presentation gates.
- Project Manager / Area Focal Person capability boundaries are unchanged.
- The existing Project Workspace title lookup remains the same `survey_projects.select("title")` read; no new database query was added for decoration.
- No Supabase migration, schema, RLS, grant, RPC or backend lifecycle change.
- Team, Recruitment, Field Work, Map, Responses, Cases, Finance, Governance, Documents and Activity continue rendering their existing operational components and callbacks.
