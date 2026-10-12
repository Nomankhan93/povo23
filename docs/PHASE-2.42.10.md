# FieldLance 2.42.10 — Offline / Mobile Field Workspace

2.42.10 modernizes the offline/mobile Field Worker surface without changing the offline data architecture.

## Scope

- Separate the field workspace into **Surveys**, **Attendance** and **Device** sections.
- Present downloaded survey projects with desktop tables and mobile record cards.
- Keep survey sync/recovery visible in the field-readiness context.
- Move encrypted survey/attendance/attachment inventory and cleanup into the Device section.
- Replace Offline Field `window.confirm` / `window.prompt` operations with accessible shared dialogs.
- Require typed `ERASE` confirmation for device-data erase while preserving the existing inventory warning and server-record boundary.
- Modernize `SurveySyncStatus` presentation and failed-copy discard confirmation.
- Preserve the 2.42.9 attendance-client regression harness correction required by the redesigned delegated Cases component.

## Correctness boundaries

The following remain authoritative and unchanged: encrypted survey drafts/queue, stable survey request IDs, recovery-copy semantics, device owner/generation checks, attachment resume offsets, attendance offline queue/download behavior, seven-day download freshness/revocation, SurveyForm behavior, AttendanceWorkspace behavior, service-worker/offline-shell policy, routes and capabilities.

Financial actions, beneficiary-case operations and basemaps remain unavailable offline. No background GPS or background-sync requirement is introduced.

## Database

No schema, migration, RLS, grant or RPC change is included. The migration inventory remains at 87 with `20261013000580_project_lifecycle_e2e_integrity.sql` as the head.
