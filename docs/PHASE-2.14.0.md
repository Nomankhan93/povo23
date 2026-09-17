# POEM 2.14.0 — Project Team & Area Governance Foundation

## Objective

Introduce project-scoped operational roles without converting staff into organization-wide NGO Admins, and create a reliable geography anchor that RLS can enforce.

## Added

- `project_staff_assignments` with `project_manager` and `area_focal_person` roles.
- `project_staff_areas` for focal-person geography roots.
- Assignment/revocation RPCs with audit events, notifications, optimistic versioning and date boundaries.
- Project authorization helpers: `can_manage_project_team`, `can_manage_project`, `can_review_project_area`.
- `collection_geography_id` on workforce assignments, survey assignments, survey responses and capture evidence.
- Server-side stamping/validation of assignment, household, response and evidence geography.
- Area-aware RLS for survey assignments, responses, capture evidence and workforce assignments.
- Area-aware survey review RPC.
- `set_survey_assignment_scope` for an explicit collection area.
- `project_staff_roster` bounded to authorized project visibility.

## Security boundaries

Project Manager gets project operations, not organization-wide administration. Area Focal Person receives only assigned geography roots and descendants. Neither role receives new permissions for finance, templates, organization membership management, canonical administration or cross-NGO sharing.

Project staff authority is dependent on the staff account remaining active and retaining an active membership in the owning NGO. Revoking/suspending the underlying membership therefore removes authorization without relying on UI refresh logic.

## Historical data

2.14.0 does not infer historical taluka/UC precision. Existing assignment/response/capture rows are backfilled from the strongest already-stored scope available. New records are stamped server-side from current assignment scope.

## Deliberately deferred to next 2.14.x patch

- Dedicated Project Team management UI.
- Project-manager/focal workspace navigation.
- Recruitment marketplace screens filtered to project-manager projects.
- Area progress dashboard and focal monitoring cards.

These screens must consume the 2.14.0 database permissions rather than implement authorization through frontend filters.
