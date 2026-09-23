# FieldLance 2.38.0 — Assignment Attendance, Work Sessions, Timesheets, Explicit Location Evidence & Daily-Payable Integration

FieldLance 2.38.0 adds assignment-bound attendance without introducing continuous worker surveillance or a second payment ledger. Field Workers explicitly start and end field sessions; check-in/check-out timestamps and optional project-policy location evidence are retained as operational evidence. Organization Admins and active Project Managers review attendance. FieldLance Staff retain authorized oversight but are not routine attendance approvers.

## Scope

- Assignment-bound check-in and checkout for active accepted work assignments.
- Personal **My Attendance** and **My Timesheets** routes using the 2.36 deep-link foundation.
- Project **Field Work** attendance review for Organization Admin / Project Manager authority.
- Explicit check-in/check-out location snapshots only; no 24/7 or background tracking.
- Project attendance policy: IANA timezone, `required` / `preferred` / `not_required` location evidence, and an accuracy threshold.
- Raw captured timestamps plus server received timestamps so delayed/offline synchronization remains visible.
- Encrypted IndexedDB attendance queue for already-loaded browser sessions that temporarily lose connectivity.
- Immutable attendance event history and reviewer time-adjustment history; raw captured evidence is not overwritten.
- Daily-rate payable integration using the existing `work_payable_units` ledger. Approval creates/reuses one day unit; finance approval/payment remains separate.
- Existing `per_verified_survey` and `fixed_assignment` compensation semantics remain unchanged. No hourly-rate compensation type is introduced.
- Existing 2.37 weekly availability limit is enforced when starting a new attendance workday.

## Data model

One forward migration is added:

`20261013000400_assignment_attendance_timesheets_location.sql`

New tables:

- `project_attendance_policies`
- `assignment_work_sessions`
- `assignment_session_locations`
- `attendance_adjustments`
- `attendance_events`

The migration also validates worker/project IANA timezones, extends `claim_work_payable` so daily-rate claims require approved attendance, and adds guarded attendance RPCs. Existing `work_assignments`, `work_payable_units`, `work_payable_events`, survey-payable reconciliation and finance journals remain authoritative.

## Attendance lifecycle

`open → submitted → approved`

A submitted session may instead become `correction_required` or `rejected`. A correction-required session can be resubmitted by the Field Worker. Approved attendance cannot be casually edited; effective-time corrections are allowed only before approval and append an immutable adjustment record.

## Location privacy

Location capture occurs only when the worker explicitly selects **Start field work** or **End & submit workday**. A project may require, prefer, or not require location evidence. Coordinates, accuracy, capture time, receive time and permission state are stored as evidence. Poor accuracy is retained as a review signal; it is not an automatic misconduct or fraud finding.

FieldLance 2.38.0 does not add background tracking, continuous breadcrumb trails, geofencing polygons, device surveillance, or hidden location collection.

## Authority

- **Field Worker:** start/end own eligible assignment sessions; read own attendance/timesheets; resubmit correction-requested sessions.
- **Organization Admin / active Project Manager:** configure project attendance policy, review/adjust submitted attendance, request correction, reject or approve.
- **FieldLance survey/admin staff:** authorized oversight/read access follows existing project authority, but routine attendance approval/policy mutation is not granted by platform survey authority alone.
- **Area Focal Person:** does not gain broad attendance-management authority in 2.38.
- **Unrelated Organization/user:** cannot read or mutate another worker/project attendance.

## Financial boundary

Attendance approval for a paid `daily_rate` assignment creates or reuses a pending day payable unit. It does **not** approve or pay money. Existing payable and finance authorities continue to control financial approval, disputes, funding reconciliation and payout settlement.

## Deliberately out of scope

- Hourly-rate compensation and automatic `hours × rate` payment.
- Continuous/background worker location tracking.
- Polygon geofence enforcement.
- Facial/biometric attendance.
- Area Focal attendance approval.
- Replacing the existing payable/finance ledgers.
