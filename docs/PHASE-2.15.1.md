# POEM 2.15.1 — NGO Project Self-Service & POEM Project Approval

## Goal

Allow active Partner NGO Admins to stage and submit survey projects without granting them POEM survey-management authority or creating a parallel operational project model.

## Data model

- `survey_project_drafts` stores the organization-owned approval envelope, optimistic `version`, decision state, review note and optional `approved_project_id`.
- `survey_project_review_events` stores append-only submit/resubmit/decision history.
- `survey_projects` remains the only operational project table and keeps its existing `active` / `closed` status semantics.

## Workflow

`draft → submitted → changes_requested → resubmitted → approved` or `rejected`.

Only `draft` and `changes_requested` are editable. Approval atomically calls the existing project-creation path, stores the new project ID and locks the request. Retrying an already-approved decision returns the existing project instead of creating another one.

## Template boundary

NGO project drafts may use:

1. POEM-owned published templates (`organization_id IS NULL`), or
2. immutable approved templates owned by the same NGO.

Another NGO's private approved template cannot be stored in a draft or used through direct POEM project creation.

## Authorization

- NGO Admin: own-organization draft/save/submit/resubmit and review-history read.
- POEM survey manager/admin: submitted queue and review decisions.
- Project Manager / Area Focal Person: no new draft or approval authority.
- Direct table mutation: denied; RLS + guarded RPCs remain the boundary.

## Out of scope

Recruitment-capacity closing/reopening, project compensation defaults, funding reservation, balances and payment providers remain later phases.
