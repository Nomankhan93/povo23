# FieldLance 2.41.15 — Project Lifecycle E2E Integrity

Baseline: FieldLance 2.41.14.

This release closes a cross-layer authorization mismatch in the formal project-work lifecycle. Project Managers already had project recruitment authority and the Project Workspace exposed assignment completion/cancellation, but the historical completion/cancellation RPCs still required NGO Admin or platform survey authority.

## Lifecycle contract

Published project → automatic marketplace listing → Field Worker application → project review/selection → formal assignment offer → worker acceptance → active survey assignment → attendance / survey collection → independent review → existing payable engine → completion/cancellation.

## Change

`complete_work_assignment` and `cancel_work_assignment` now authorize with `app_private.can_manage_project(w.survey_project_id)`, the same server-side project-management contract used by recruitment and survey review. This grants no new authority to Area Focal Persons or ordinary Organization members.

Completion/cancellation still deactivates the linked survey assignment, preventing new forward collection while preserving response, attendance, payable, work-history and audit records.

## Database

Forward migration: `20261013000580_project_lifecycle_e2e_integrity.sql`.
