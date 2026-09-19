# POEM 2.19.1 — Assistance Distribution Planning

## Objective

Turn an **approved 2.19.0 assistance request** into one controlled operational plan that can be edited, scheduled/rescheduled, marked ready, or cancelled before any real delivery is recorded.

Authoritative chain:

`approved survey → beneficiary_needs → beneficiary case → approved assistance request → distribution plan → future delivery workflow → assistance_entries`

## What is new

- `assistance_distribution_plans` — request-linked operational planning record.
- `assistance_distribution_plan_revisions` — immutable plan version history.
- One non-cancelled plan per approved request; cancelled plans remain history and may be replaced.
- Planning lifecycle: `draft → scheduled → ready` or `cancelled`.
- Request-version snapshot on plan creation for audit provenance.
- Distribution mode, location/venue, responsible-party label, instructions and start/end schedule.
- Guarded create/edit/schedule/ready/cancel RPCs with optimistic versions.
- `assistance_distribution_plan_queue` for scoped operational monitoring.
- Case detail now returns request-linked distribution plans.
- Approved-request cancellation is blocked while an active plan exists.
- Case workspace adds planning queue and per-request plan controls.
- `npm run test:distribution` / `scripts/test-phase2191.mjs`.

## Authorization

POEM survey authority, NGO Admin and Project Manager use the existing `app_private.can_manage_project()` boundary for planning. Area Focal is intentionally excluded. Project Manager gains no NGO-wide administration or request-approval authority.

The `responsible_party` field is descriptive operational metadata only. It does not assign a POEM account, grant visibility or bypass RLS.

## Integrity rules

- Request must be `approved` before plan creation.
- Beneficiary case must be `open` before create/edit/schedule/readiness.
- Organization must be active for create/edit/schedule/readiness.
- The request/case/person/project/organization lineage is server-derived, not trusted from browser input.
- The assessed need must remain actively linked when the plan is created.
- One non-cancelled plan per request prevents duplicate active planning.
- Plan mutation uses optimistic `version` checks and immutable revision snapshots.
- Request cancellation must follow plan cancellation when an active plan exists.

## Explicit non-goals

2.19.1 does **not**:

- create or update `assistance_entries`;
- claim that scheduled/ready support was delivered;
- create beneficiary wallet/balance functionality;
- use worker `work_payable_*` tables;
- reserve/post project finance journals;
- use JazzCash/Easypaisa withdrawal settlement;
- implement inventory, proof-of-delivery or beneficiary cash disbursement;
- add duplicate-support intelligence or cross-NGO beneficiary discovery;
- automatically close needs/cases.

Those remain later 2.19 phases.
