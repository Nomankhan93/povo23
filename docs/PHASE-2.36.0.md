# FieldLance 2.36.0 — URL Routing, Deep Links, Workspace Navigation & Mobile Field Worker IA

FieldLance 2.36.0 converts the existing in-memory workspace/page navigation into canonical browser URLs without changing PostgreSQL RLS, guarded RPCs or workspace authority.

## Scope

- Canonical routes for personal, Organization, FieldLance Staff and project-scoped workspaces.
- Browser Back/Forward and refresh restore the authorized workspace/page.
- Project workspace tabs are reflected in the URL.
- Case record deep links restore the selected beneficiary case.
- Recruitment application/assignment deep links can restore and focus the matching record card.
- Existing notification/task `onNavigate(page)` actions now move to canonical URLs through the AppShell navigation layer.
- Browser history changes wait for `flushActiveDraft()`; failed draft persistence restores the previous URL instead of silently unmounting field work.
- Personal Field Worker mobile navigation adds five thumb-friendly primary destinations: Home, Work, Field, Earnings and Profile.

## Canonical route examples

- `/app/home`
- `/app/work/opportunities`
- `/app/work/applications/:applicationId`
- `/app/work/assignments/:assignmentId`
- `/app/field`
- `/app/earnings`
- `/app/profile`
- `/org/:organizationId/home`
- `/org/:organizationId/cases/:caseId`
- `/org/:organizationId/projects/:projectId/:tab`
- `/staff/home`
- `/staff/projects/:projectId/:tab`
- `/projects/:projectId/:tab` for an explicitly authorized project-staff workspace

## Security boundary

Routes are presentation and navigation state only. A URL never grants workspace access. `my_workspace_access`, PostgreSQL RLS, Storage policies and guarded RPCs remain authoritative. An unavailable workspace or page is canonicalized back to an authorized home route.

## Data / migration impact

No database migration is introduced by 2.36.0.

## Compatibility

Historical internal page keys remain unchanged so existing dashboard, notification and Task Center navigation callbacks continue to work. The new route adapter translates those page keys into stable paths.

## Version sequencing note

2.36.0 was intentionally built directly on the validated 2.31.0 baseline. Planned scopes previously labelled 2.32–2.35 were not included in this release. Future implementation of those deferred scopes must use a version greater than 2.36.0 rather than publishing a lower package version.
