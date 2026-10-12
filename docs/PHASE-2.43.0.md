# FieldLance 2.43.0 — Data Integrity & Reporting Consistency

2.43.0 closes the data-integrity/reporting follow-up that was originally identified after 2.41.20 and intentionally deferred while the 2.42 UI consistency series was completed.

## Correctness fixes

### Survey review tasks

`survey_responses.status` uses `correction_required`, but the historical Task Center derivation checked `correction_requested`. A response moved from `submitted` to `correction_required` could therefore lose its actionable review task even though the authoritative survey workflow still required review.

2.43.0 aligns the derived-task trigger and repair backfill with `submitted` / `correction_required`. Task completion remains presentation/operations metadata only and never approves or rejects the response.

### Case due reporting

Operational reporting previously used only `beneficiary_cases.follow_up_on` for the case due date. Structured case follow-ups introduced later are the authoritative scheduled work items and can legitimately diverge from the older case-level convenience date.

2.43.0 reports the earliest scheduled `beneficiary_case_followups.due_on` first, with the legacy case-level date retained only as fallback when no structured scheduled follow-up exists. Case status, follow-up ownership and closure authority are unchanged.

### Verified work history and project closure

Historical direct-assignment work history treated any project with `status='closed'` and submitted work as completed. Since project closure is now staged, `status='closed'` represents collection closure and does not by itself mean operations are complete.

2.43.0 keeps explicit completed workforce assignments authoritative and treats direct-assignment project work as completed only after `project_closure_state` reaches `operational_completed`, `financially_reconciled` or `fully_closed`. At `collection_closed`, reviewed work remains recorded/verified history but is not prematurely labelled complete.

## Preserved boundaries

- Existing survey-review RPCs and response statuses are unchanged.
- Task Center authority and task-management permissions are unchanged.
- Beneficiary-case/follow-up ownership, mutation and closure rules are unchanged.
- Attendance capture/review, payable generation, finance reconciliation and project-closure transition RPCs are unchanged.
- Recruitment, routing, capability, offline-store and UI contracts are unchanged.

## Database

Forward migration: `20261013000590_data_integrity_reporting_consistency.sql`.

Migration inventory: 88.
