# FieldLance 2.42.5 — Attendance + Timesheets UX

FieldLance 2.42.5 modernizes the existing attendance/timesheet presentation without changing attendance authorization, database state, offline queue semantics, payables calculations, routes or RPC behavior.

## Field Worker Attendance

- Prioritizes the current assignment, workday status and next attendance action.
- Separates field-readiness/download/sync state from the workday action card.
- Makes explicit-only location capture and location policy visible before check-in/out.
- Preserves `start_assignment_work_session` and `checkout_assignment_work_session` exactly.
- Preserves the 24-hour downloaded attendance lease, encrypted local pending queue, reconnect sync and server authorization recheck.

## My Timesheets

- Presents Submitted, Approved, Needs correction and Rejected summary metrics.
- Adds a clear status filter for historical workdays.
- Uses compact desktop records and mobile workday cards without creating a new timesheet data model.
- Keeps effective timestamps operationally visible while retaining raw capture evidence separately.

## Organization / Project review

- Authorized Organization Admin / active Project Manager review remains gated by the existing `policy.can_manage` result.
- Submitted workdays open in the shared focus-managed Drawer; on mobile the same drawer becomes a bottom detail surface.
- Approve, Request correction, Reject and effective-time adjustment still call the existing guarded attendance RPCs.
- Raw captured timestamps, effective timestamps, location evidence, worker note, payable state and immutable adjustment semantics remain distinct.

## Presentation architecture

- Adds `src/features/workforce/AttendanceWorkspace.module.css`.
- Retires Attendance-specific legacy selectors from `src/styles/design-system.css` only after source search confirms they have no remaining consumer.
- Uses shared FieldLance 2.42 primitives and `--fl-*` tokens.
- Adds no hard-coded feature palette, `!important`, sub-12px operational typography or arbitrary responsive breakpoints.
- Uses the approved 1023px / 639px feature breakpoints and mobile safe-area padding.

## Backend boundary

No migration, schema, RLS, RPC implementation, grant or Supabase deployment change is included. The migration inventory remains 87 files with head `20261013000580_project_lifecycle_e2e_integrity.sql`.

## 2.42.5-r1 artifact correction

The r1 installer supersedes the initial 2.42.5 artifact without changing the package version. It restores desktop worker correction/resubmission through a shared correction Drawer, isolates My Attendance current-workday loading from stale Timesheets status/page state, and renders the Current Workday date using the configured attendance/project timezone. No backend, authorization, offline-queue or migration behavior changes.
