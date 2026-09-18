# POEM 2.15.0 — NGO Template Self-Service & POEM Approval Workflow

## Goal

Allow an approved Partner NGO to prepare survey templates without giving it POEM survey-management authority. The release extends the existing template-draft engine and keeps immutable `survey_templates` as the only published template artifact.

## Data model

`survey_template_drafts` now stores optional `organization_id`, review state/timestamps/reviewer/note and the existing creator `owner_id`. NGO authorization follows `organization_id`; the creator is audit evidence only.

`survey_templates` now stores optional `organization_id` and `source_draft_id`. POEM-owned templates use `organization_id = NULL`. An NGO-approved template preserves its organization ownership after publication.

`survey_template_review_events` preserves submitted/resubmitted/changes-requested/approved/rejected history.

## Workflow

```text
NGO draft
  -> submit
  -> POEM review
      -> changes requested -> NGO edits -> resubmit
      -> rejected
      -> approved -> immutable survey_template
```

POEM-authored private drafts retain direct publication for backward compatibility.

## Security rules

- Active `ngo_admin` membership is required to create/edit/submit an organization draft.
- Editable NGO states: `draft`, `changes_requested`.
- Locked NGO states: `submitted`, `approved`, `rejected`.
- POEM review requires `app_private.can_manage_surveys()`.
- Direct writes to drafts, review events and published templates remain denied to authenticated clients.
- Project Manager and Area Focal Person roles from 2.14 do not receive template authority.
- Other NGOs cannot read the draft/review history or NGO-owned published template.
- Active NGO Admins can read POEM-owned published templates for later project selection.

## UI

The existing Survey Templates builder is reused for both POEM and NGO workspaces. NGO workspaces receive `My templates` and starter-library flows; POEM survey managers receive an additional NGO review queue.

## Out of scope

- NGO project draft/approval/activation (2.15.1)
- compensation and target-closing rules (2.16)
- funding/payment provider work
- database-managed public template marketplace
