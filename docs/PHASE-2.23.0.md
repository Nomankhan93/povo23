# FieldLance 2.23.0 — Tasks, SLA & Escalation Center

## Goal

Create one operational action layer across Field Worker, Organization, Project and FieldLance Staff workspaces without duplicating the authoritative state of surveys, applications, cases, assignments or withdrawals.

## Delivered

- `operational_tasks`, `operational_task_sla_policies`, and immutable `operational_task_events`.
- RLS and guarded RPCs for queue reads and task mutation.
- My Tasks, Team Tasks, Due Today, Overdue, Escalated and Completed views.
- SLA escalation levels 1–3.
- Derived tasks for organization application review, Field Worker recruitment review, assignment offers, survey review, beneficiary case follow-up and withdrawal operations.
- Manual coordination tasks for authorized managers.
- Task Center links back to the source module.
- Workspace navigation and dashboard shortcuts.

## Boundary

Task completion is coordination state only. It must never approve/reject a source workflow, settle money, close a beneficiary case, verify a survey or grant organization/Field Worker access.
