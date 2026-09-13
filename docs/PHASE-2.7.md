# POEM Phase 2.7 — Volunteer Marketplace & Project Assignment Foundation

Phase 2.7 connects the existing volunteer directory, shortlists, invitations and survey-project system into an operational field-workforce workflow. It does not introduce automatic volunteer ranking or payment settlement.

## What is added

- Survey-project-linked workforce opportunities with work area, positions, optional skill/language criteria and proposed paid/unpaid terms.
- Volunteer discovery of matching local opportunities only after profile verification and explicit profile sharing with the NGO.
- Volunteer applications with withdraw, NGO shortlist/select/reject review and optimistic versions.
- Project workforce candidate search using safe aggregate indicators: approved/reviewed surveys, completed assignments, verified experience count and a non-numeric match label.
- Formal assignment offers sourced from a selected application, accepted invitation or NGO-selected shortlist.
- Immutable assignment term snapshots: volunteer/paid mode, compensation basis, currency/rate, target, dates and deliverables.
- Volunteer accept/decline step. Survey assignment is activated only after acceptance.
- Assignment completion/cancellation, automatic survey-access revocation and structured supervisor feedback.
- POEM survey-manager read-only oversight through existing RLS scopes.
- Project closure fails closed: unresolved opportunities/applications and offered/active workforce assignments are closed/cancelled and survey assignment access is revoked.

## Important permission boundary

A marketplace application does not grant another NGO access to the volunteer profile. The NGO must already have the volunteer's explicit `profile_shares` grant before the volunteer can discover/apply to its opportunity. Historical application/assignment records remain auditable after the recruiting decision; raw volunteer profile access continues to follow the profile-sharing rules.

## Match labels are not performance scores

`local_verified`, `good_match` and `strong_match` are coarse discovery labels built from verified location plus objective historical counts. No 0–100 score, level promotion or automated hiring decision is introduced. An approval rate is returned only when at least five reviewed surveys exist; otherwise the UI displays `Insufficient data`.

## Assignment lifecycle

```text
Opportunity
  -> Application selected / Invitation accepted / Shortlist selected
  -> Formal assignment offered
  -> Volunteer accepts
  -> survey_assignments.active = true
  -> Field work
  -> NGO completes or cancels assignment
  -> survey_assignments.active = false
```

The accepted assignment narrows collection to its assignment start/end dates through `app_private.can_collect`. Legacy direct survey assignments remain supported for inherited tests/operational override, but the UI points normal workforce operations to the Marketplace.

## Paid-work boundary

Phase 2.7 stores agreed compensation terms only. It does **not** calculate payables, approve payments, integrate a payment gateway, create invoices or resolve payment disputes. Those belong in the next workforce-operations phase.
