# POEM 2.16.0 — Project Targets & Recruitment Capacity

## Purpose

POEM 2.16.0 turns the existing project survey target into an operational **approved-response target** and adds a separate project-level volunteer-capacity control. It deliberately does not hard-stop field synchronization at the target because POEM supports offline queues and cannot trust client timestamps to prove when an offline form was created.

## Data model

`survey_projects` gains:

- `required_volunteers` — optional configured project team capacity.
- `recruitment_status` — manager-controlled `open` / `closed` gate.
- `recruitment_version` — optimistic concurrency token for plan changes.

`survey_projects.target` remains the survey target. Approved counts, committed volunteer counts, remaining values and over-target values are derived from authoritative existing rows rather than copied into mutable counters.

## Soft target model

```text
Approved < target + capacity remains + manual open
→ new recruitment allowed

Approved >= target
→ new opportunity publication/invitations/offers/direct activations blocked
→ existing assignments remain valid
→ existing/offline survey responses can still synchronize and be reviewed
→ excess approvals are retained as over-target
```

Target reach does **not** automatically set `survey_projects.status='closed'`. Explicit project closure remains a separate operational decision.

## Recruitment capacity

Committed volunteers are counted distinctly across current `work_assignments` (`offered`/`active`) and active `survey_assignments`. A volunteer represented in both systems counts once. Capacity therefore controls people, not survey units.

## Authorization

- NGO Admin: manage plan for own active projects.
- Project Manager: manage plan/recruitment for assigned project.
- Area Focal: no global plan mutation/read RPC; retains scoped operational monitoring/review.
- Volunteer: new discovery/application only while the effective recruitment gate is open.

## Existing systems reused

- Existing `work_opportunities`, `work_applications`, `work_invitations`, `work_assignments` and `survey_assignments` remain the recruitment/assignment model.
- Existing `survey_responses` review status remains the target evidence.
- Existing payable tables remain untouched; compensation defaults are 2.16.1.

## Out of scope

- Hard pre-issued collection slots/quotas.
- Client-timestamp-based target enforcement.
- Project compensation defaults or financial ledger changes.
- Automatic closing of active field collection at target.
