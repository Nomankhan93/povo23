# POEM 2.19.0 — Validation Stabilization

This follow-up keeps the already-applied 2.19.0 case/request architecture intact. It does not add a second beneficiary registry, assistance ledger, payable engine, finance ledger, or payment path.

## Corrections

- `create_assistance_request` now takes a row lock on the beneficiary case before it re-checks case status and the active case→need link. This serializes new draft creation with the existing case-close and need-link mutation lock order and prevents a concurrent close/unlink from leaving a newly created draft attached to stale operational state.
- Assistance-request Approve/Reject UI now reads the actual submitter button through `SubmitEvent.submitter` and refuses to infer a decision when no explicit button was used.
- Case intake only offers assessed needs whose server-supported status is `open`, `in_progress`, or `needs_review`.
- Phase tests now exercise draft request editing/version history and static guards for the serialization/UI fixes.

## Preserved boundaries

- `beneficiary_needs` remains the assessed-needs source of truth.
- `assistance_entries` remains the delivered-assistance ledger.
- Approval still means planning approval only; it creates no delivery row.
- POEM survey authority, NGO Admin, and Project Manager retain case/request management as already scoped.
- Only NGO Admin / POEM survey authority can approve or reject requests.
- Area Focal remains outside 2.19.0 case management.
- Payment, payable, funding, finance, e-wallet, and withdrawal architecture are unchanged.

## Forward migration

`20261009000110_beneficiary_case_request_stabilization.sql`

The original `20261009000100_beneficiary_cases_assistance_requests.sql` remains immutable.
