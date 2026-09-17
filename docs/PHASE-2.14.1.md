# POEM 2.14.1 — Project Team Management & Scoped Workspaces

2.14.1 exposes the 2.14 project-scoped authorization model through operational UI without creating a second role or permission system.

## Delivered

- NGO Admin `Project team` workspace for each authorized NGO.
- Project Manager and Area Focal Person assignment using existing `assign_project_staff` RPC.
- Active organization-member candidate lookup through guarded `project_staff_candidates` RPC; broad `accounts` read access is not granted to NGO Admins.
- Multiple geography scopes for Area Focal Persons.
- Roster display and audited revocation through `revoke_project_staff`.
- Dedicated workspace selector entries for assigned Project Manager / Area Focal Person contexts.
- Project-scoped dashboard counts for visible volunteers and response statuses. Counts are RLS-filtered; Focal Persons only receive records allowed by assigned geography.
- Project-specific Survey Projects view through the existing survey module.
- 2.14.0 project-access revocation follow-up retained as a forward migration.

## Security boundaries preserved

Project staff do not receive organization membership administration, survey-template publishing, canonical-registry administration, cross-NGO sharing administration or finance authority. Frontend workspace visibility is convenience only; PostgreSQL RLS and guarded RPCs remain authoritative.
