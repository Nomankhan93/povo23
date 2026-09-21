# FieldLance 2.30.1 — Project Workspace Stabilization

- Add forward migration 20261012000200_project_workspace_stabilization.sql. Storage SELECT admits deleting objects only for active project managers, making authenticated DELETE possible while retaining ready-only member downloads.
- Await registered device draft persistence before voluntary project tab/back navigation. Pending attachment capture or persistence errors keep the form mounted and display an error. Permission revocation still removes unauthorized content immediately.
- Count pending and shortlisted recruitment applications in Project Overview.
- Lazy-load project finance, surveys, governance, marketplace and organization verification. Use a consistent static import for the shared attachment utility.
- Replace obsolete 2.14.1 literal-prop assertions with current wiring checks and executable permission combinations.
- Strengthen deletion tests with exact deleted-row counts, denied premature deletion, denied non-manager deletion, and interrupted-delete recovery.

Authorization remains enforced by existing database helpers and RPCs. A manager may read an object pending deletion to support the Storage delete protocol; focal staff cannot. Historical migration 20261012000100 is unchanged.
