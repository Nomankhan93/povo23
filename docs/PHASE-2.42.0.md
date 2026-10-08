# FieldLance 2.42.0 — Design System & Workspace Shell Foundation

## Goal

Replace the fragmented shell-level presentation with one reusable FieldLance Operational SaaS foundation while preserving every existing business workflow, route, capability and backend authorization boundary.

## Presentation changes

- Added a dedicated token layer for the approved soft blue-gray canvas, white surfaces, restrained blue action color, teal operational accent, semantic states, spacing, radii, shadows and responsive breakpoints.
- Added reusable presentation primitives in `src/components/ui/FieldLanceUI.tsx` for page/section headers, actions, form structure, cards, status, data presentation, navigation and overlays.
- Migrated the AppShell page heading to the shared `PageHeader` hierarchy; feature screens continue to own their operational content.
- Restyled desktop/tablet workspace navigation as a clean white SaaS sidebar with clear active states and the existing workspace switcher.
- Added authorized-only mobile primary navigation for Organization and FieldLance Staff workspaces. Field Worker Home / Work / Field / Earnings / Profile destinations are preserved.
- Moved Field Worker Attendance and Timesheets into the existing Field Operations navigation group.
- Moved Organization Direct invitations into the Workforce navigation group, eliminating accidental `Other tools` placement for the affected pages.
- Replaced Project Workspace's flat 12-tab presentation with grouped desktop navigation: Overview, Delivery, Impact and Administration.
- Added an accessible mobile `Project section` selector using the same existing project tab IDs.
- Removed the redundant Project Workspace top-level H1; AppShell remains the owner of page/project context while the project shell keeps lightweight entity context and Back to projects.

## Deliberately unchanged

- `src/app/routes.ts` is byte-identical to the 2.41.20 baseline.
- `src/app/capabilityContract.ts` is byte-identical to the 2.41.20 baseline.
- No Supabase migration, schema, RLS, grant or RPC change.
- No recruitment, survey, attendance, finance/payable, offline sync, notification or project lifecycle state change.
- Detailed Project Team, Recruitment, Map, Responses, Finance and other feature content screens remain on their existing styles for later migration.
