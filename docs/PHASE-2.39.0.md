# FieldLance 2.39.0 — Case Ownership & Delegated Field Operations

FieldLance 2.39.0 adds named operational responsibility to the existing beneficiary-case lifecycle without creating a second case, follow-up, task, beneficiary, assistance or finance system.

## Authoritative model

`Existing beneficiary case → explicit owner delegation → bounded My Cases / My Follow-ups access → existing structured follow-up → existing Task Center SLA → manager reassignment / closure`

A case may have one active operational owner at a time:

- **Field Worker** — only when the worker has a current active survey assignment whose collection geography contains the case geography.
- **Area Focal Person** — only when the focal has a current active project-staff assignment and one of the assigned focal areas contains the case geography.

Project Manager, NGO Admin and existing FieldLance survey authority keep their current full case-management permissions. Delegation does not grant finance, organization administration, assistance approval or broad beneficiary access.

## Ownership history

`beneficiary_case_assignments` stores the current/historical assignment records and `beneficiary_case_assignment_events` stores immutable assignment, reassignment, unassignment, eligibility-ended and case-closed events.

Reassignment requires the current assignment ID/version so stale manager actions fail instead of overwriting a newer owner decision.

## Delegated Field Worker / Area Focal workspace

New personal routes:

- `/app/field/cases`
- `/app/field/cases/:caseId`
- `/app/field/follow-ups`

The delegated workspace exposes only bounded operational context:

- case title, summary, priority and geography;
- beneficiary name and registry number;
- linked assessed needs;
- scheduled/completed follow-ups and outcomes;
- follow-up scheduling, completion and cancellation.

It intentionally does **not** expose assistance-request financial detail, the case identity snapshot, Organization settings or finance controls.

An Area Focal can also open the project-scoped Cases page, but only explicitly delegated cases inside current focal geography authority are returned.

## Task Center integration

The existing `beneficiary_case_followup` derived operational task remains authoritative. 2.39 reassigns that task to the current valid case owner. Reassigning/unassigning a case refreshes existing open follow-up tasks rather than creating a parallel task engine.

## Authority revocation

Live delegated access ends when:

- a Field Worker survey assignment is deactivated or moved outside the case geography;
- an Area Focal project-staff assignment is revoked or no longer valid;
- the beneficiary case is closed;
- a manager explicitly unassigns/reassigns the case.

Historical ownership events remain retained.

## Forward migration

`20261013000430_case_ownership_delegated_operations.sql`

## Out of scope

- Replacing the existing `beneficiary_cases` lifecycle.
- New case statuses duplicating follow-up/task state.
- Giving Area Focal broad Organization case access.
- Delegating assistance approvals, finance or payout controls.
- Automatic case assignment algorithms.
- Continuous worker location tracking.
