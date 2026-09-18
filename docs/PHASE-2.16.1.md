# POEM 2.16.1 — Project Compensation Defaults & Assignment Contract Integration

## Purpose

POEM 2.16.1 connects project compensation configuration to existing recruitment, assignment contracts and the existing payable subsystem. It does not create a second finance or payable engine.

## Project defaults

`survey_projects` now stores future-work defaults:

- `work_mode`: `volunteer` or `paid`
- `compensation_type`: `none`, `per_verified_survey`, `daily_rate`, `fixed_assignment`
- `compensation_currency`
- `compensation_rate`
- `compensation_note`
- optimistic `compensation_version`

Volunteer projects require `none` + null rate. Paid projects require a supported basis and positive two-decimal rate.

## Opportunity snapshot

Each new project recruitment opportunity receives a structured compensation snapshot plus the project compensation version. Changing project defaults later does not rewrite an existing opportunity. This protects what the volunteer saw when applying.

Historical unpaid project opportunities are safely mapped to volunteer/unpaid. Historical paid opportunities with only free-text legacy terms are not guessed; they must be replaced before issuing a new structured assignment.

## Assignment contract

Application/invitation assignments inherit the source opportunity snapshot. A direct selected-shortlist assignment inherits the current project default at offer time. The existing `work_assignments` contract fields remain immutable under `protect_work_terms()`; the new provenance fields identify where the frozen compensation came from.

The server derives compensation. Existing RPC parameters remain for compatibility but cannot override the authoritative project/opportunity snapshot.

## Payable integration

No new payable table or generator is introduced.

For an accepted paid assignment with `per_verified_survey`:

```text
independently approved response
→ existing sync_survey_payable()
→ unique work_payable_units.response_id
→ assignment snapshot rate/currency/provenance
```

Existing daily-rate and fixed-assignment claims continue through `claim_work_payable()`.

## Authorization

- NGO Admin / POEM survey-management authority: may change project compensation defaults.
- Project Manager: may read defaults and manage recruitment/offers, but cannot change the compensation commitment.
- Area Focal Person: no global compensation-plan authority.
- Volunteer: sees opportunity/assignment terms and accepts or declines the frozen offer.

## Out of scope

- project fund availability/reservation
- NGO/project account balances
- deposits/withdrawals
- JazzCash/provider money movement
- automatic settlement

These belong to 2.17/2.18.
