# Phase 2.4 — Canonical Beneficiary Identity Foundation

Phase 2.4 adds a POEM-wide identity layer **without replacing** project-scoped `registry_persons`.

## Why

A person may be collected in NGO A's project and later appear in NGO B's project. Project records must remain isolated for operations and RLS, while POEM needs a central identity that can connect reviewed records for coordination.

## Added

- `canonical_persons`: POEM-wide beneficiary identity and stable beneficiary number.
- `canonical_person_links`: links each project `registry_person` to one canonical identity.
- Automatic one-to-one canonical creation for every new project person and safe backfill for existing records.
- `canonical_person_revisions`: immutable snapshots of canonical identity state changes.
- `canonical_match_decisions` + revisions: POEM-only cross-project identity review.
- `canonical_merge_events`: reversible, audited canonical merges.
- `canonical_match_candidates(person)`: explainable cross-project candidates for POEM survey managers. No percentage score.
- `check_existing_identity(project,name,birth)`: privacy-safe field preflight. It returns only possible-match/count/action and never reveals the foreign NGO, project, or beneficiary.
- `canonical_assistance_timeline(person)`: POEM-only assistance aggregation across project records already linked to the same canonical identity.
- `canonical_person_summary(person)`: POEM-only central identity summary.

## Security boundary

Canonical/global tables are **not readable by partner NGOs**. Only active POEM `admin`, `super_admin`, or `survey_manager` roles can read canonical details through existing `can_manage_surveys()` scope.

A project collector/reviewer may call `check_existing_identity` only for a project they can currently collect/review. The response contains no foreign identity details.

## Merge behavior

`review_canonical_match(..., 'same_person', ...)` does not delete either project record. It moves their canonical links to one canonical identity and records the moved project-person IDs in an immutable merge event.

`revert_canonical_merge(...)` restores the moved links when no later active merge depends on that identity. The related decision returns to `needs_review` and a new decision revision is recorded.

## Deliberate limits

This is a foundation, not cross-NGO sharing:

- NGO B still cannot see NGO A's surveys, notes, documents, assistance, or canonical identity details.
- No automatic matching/merging.
- No confidence percentage.
- No CNIC/B-Form storage or matching is introduced by this patch.
- No NGO data-sharing grant UI is introduced yet.
- Project records remain the operational source records.

Next safe product step is controlled identifier capture/matching plus explicit NGO-to-NGO sharing grants, built on this canonical layer.
