# POEM 2.12.6 — Automatic Verified Work Experience

## Objective

Automatically derive a volunteer's POEM work history from authoritative survey-project evidence instead of asking the volunteer or NGO to duplicate the same work manually.

## Product behavior

The Work experience page now separates two sources:

1. **POEM verified work** — derived live from survey assignments, workforce assignments and survey review outcomes.
2. **Previous / external experience** — the existing volunteer-entered experience flow that may be submitted to an NGO for confirmation.

A POEM project appears automatically when the volunteer has active project access, accepted workforce history, or survey responses. Survey counts update from the current response states, so an approved/rejected/correction decision immediately changes the displayed metrics without creating a second experience record.

## Automatic fields

Each project history entry exposes bounded operational evidence:

- partner NGO name;
- survey project;
- survey/template field label;
- project and recorded field areas;
- role label (opportunity title when available, otherwise Field Surveyor);
- work state: in progress, completed, cancelled or recorded;
- start/end activity period;
- submitted, accepted, correction-required, rejected and pending-review survey counts.

`verified=true` means the platform has either an approved survey response or a completed workforce assignment. An active assignment with no accepted survey remains an in-progress POEM record and is not presented to third-party profile readers as verified evidence.

## Privacy

- The volunteer can read their own complete POEM work history.
- POEM Volunteer Managers can inspect complete history for authorized volunteer-management work.
- An NGO/other profile reader must already have normal profile-read authorization and receives only entries backed by verified POEM evidence.
- No beneficiary answers, names, case notes, private documents, payment values or supervisor feedback are exposed by the work-history RPC.
- Permanent NGO profile sharing is still optional for public recruitment browsing/application.

## Recruitment snapshot

Explicit recruitment-profile consent now includes a bounded list of up to 10 POEM-verified work summaries. It does not grant permanent profile access. The snapshot also fixes blank account-display-name fallback by using the published profile name when the account name is empty.

## Data model decision

No duplicate `platform_experience` table is introduced. `public.work_experience_history()` derives the current history from existing authoritative records. This prevents drift between survey review outcomes and a copied experience table, and keeps retry/idempotency behavior simple.

Manual/external records remain in `volunteer_experiences` unchanged.

## Explicit exclusions

- automatic levels/rankings;
- quality score calculation;
- specialization taxonomy beyond the current survey-template field label;
- misconduct/penalty logic;
- public profile exposure without existing profile authorization;
- editable POEM-generated history.

Those belong to the later Levels & Performance phase.
