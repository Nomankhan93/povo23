# POEM 2.14.2 — Project Operational Dashboard & Browser Stabilization

2.14.2 turns the 2.14 project-scoped workspace into a practical monitoring/review surface without widening database authority or adding a parallel reporting system.

## Delivered

- Project-scoped operational dashboard with accepted-target progress, active volunteer count, pending review, approved, correction and rejected metrics.
- Latest visible response queue and visible assignment-area coverage; all records are still filtered by existing RLS.
- Quick actions from the project workspace into detailed responses/reviews and notifications.
- Project-scoped Survey Projects now opens the authorized project directly and returns to the project workspace cleanly.
- Response list supports server-side status filtering while retaining existing project/geography scope.
- Project Manager assignment-management controls are separated from response-review permission. Area Focal Persons retain scoped review/monitoring without receiving assignment-management UI.
- Revoked project workspace state automatically returns the user to the personal workspace instead of leaving a dead scoped screen.
- Candidate lookup is lightly debounced and project detail loading ignores stale overlapping requests.
- Project roster, response filters, progress and operational cards have mobile/browser responsive stabilization.

## Database boundary

2.14.2 adds **no database migration**. The migration head remains `20261007000300_project_team_workspace_ui.sql`. Existing 2.14 RLS, project staff helpers and immutable `collection_geography_id` remain authoritative.

## Security boundary

Frontend metrics, queues and quick actions do not widen access. A Project Manager receives only existing project-scoped operational authority. Area Focal Persons receive only rows allowed by assigned geography roots and descendants. Finance, templates, canonical administration, organization membership and cross-NGO sharing remain outside project-staff authority.
