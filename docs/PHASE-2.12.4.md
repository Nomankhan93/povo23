# POEM 2.12.4 — Open Opportunities & Volunteer Applications
## Recruitment Stabilization Revision

This revision replaces the **unshipped** first 2.12.4 draft. It must be applied directly to a clean **POEM 2.12.3** codebase/database. Do not apply the earlier draft first.

POEM 2.12.4 extends the existing Workforce domain into a complete logged-in recruitment workflow. It does not create a parallel recruitment, contract, payable, or survey-access system.

## Existing primitives reused

- `work_opportunities` — recruitment opportunity and legacy invitation source.
- `work_applications` — one application record per volunteer/opportunity.
- `work_assignments` — formal offer/acceptance and immutable terms.
- `survey_assignments` — actual operational survey access.
- `profile_shares` — separate permanent volunteer-controlled full-profile sharing, retained for direct candidate/invitation workflows.
- project governance and independent verification from 2.9.
- contract/payable accounting from 2.12.

## Volunteer journey

1. **Available Opportunities** — browse only a safe recruitment projection.
2. **Apply** — provide availability, a short message and explicit consent for an application-scoped recruitment profile snapshot.
3. **My Applications** — track status and withdraw while Pending/Shortlisted.
4. NGO Admin or authorized POEM survey-management staff review — shortlist, reject or select.
5. Selected applicant receives a formal `work_assignment` offer.
6. **My Assigned Surveys** — accept/decline the formal offer. Survey access activates only after acceptance and all current policy checks pass.
7. Existing direct `survey_assignments` also appear in My Assigned Surveys so operational access is not hidden from the volunteer.

An application itself never creates survey access and never opens project/beneficiary tables.

## Stabilized visibility semantics

`work_opportunities.visibility` supports:

- `all` — every logged-in volunteer with an **active/published profile** may browse/apply when skills/language match. Home geography is not an eligibility restriction; travel/work-area expectations belong in the eligibility note and formal selection.
- `area` — volunteer registered geography must be the selected area or one of its descendants. A District therefore includes configured Talukas/other descendants.
- `invite_only` — only volunteers with a current Pending/Accepted invitation can see it.

**Legacy safety:** new columns default existing/legacy opportunities to `invite_only` with `applications_open=false`. Existing invitation workflows therefore do not silently become public/open recruitment after migration.

The old opportunity `status` (`open`/`closed`) remains the legacy invitation/record lifecycle. Recruitment uses the separate `applications_open` flag plus `publication_state` (`draft`/`published`).

## Closing and reopening applications

**Close applications** means: reject new applications only.

It does **not** cancel Pending/Shortlisted applications, invitations, assignment offers or history. Existing applications remain reviewable. Reopening before the deadline simply sets `applications_open=true` again with an optimistic version check.

A recruitment record with applications/invitations/assignments cannot be moved back to Draft.

## Safe opportunity browsing

`available_work_opportunities(...)` is a security-definer RPC and returns only recruitment-safe labels/fields. Direct `work_opportunities` RLS is not opened to all volunteers.

Filters:

- NGO
- hierarchical area
- paid/unpaid
- skill
- work date
- application deadline
- server pagination (50 rows/page)

The UI exposes Previous/Next pagination rather than silently showing only page zero.

## Application privacy and consent

Apply requires an explicit consent checkbox. The application stores a bounded `profile_snapshot` containing recruitment-relevant data such as name, phone, area/location, education, skills, languages, experience, availability, work preferences, transport/smartphone, preferred areas, bio, geography id and profile version.

The snapshot intentionally excludes full address, references, private verification documents, beneficiary records and survey data.

No permanent `profile_shares` row is created by Apply. The permanent full-profile sharing workflow remains separate and explicit.

One database row is retained per `(opportunity_id,user_id)`. An active Pending/Shortlisted/Selected application cannot be duplicated. A Withdrawn/Rejected/Cancelled application can be re-submitted by reusing that same row and refreshing its consent snapshot.

## Review and concurrency

NGO Admins and authorized POEM survey-management staff can manage project recruitment because both already satisfy the existing project-review authorization model.

Review uses optimistic `version` checks. Two reviewers using stale versions cannot silently overwrite one another.

Selection rechecks:

- active account
- active/published volunteer profile
- skill/language eligibility
- selected-area geography where `visibility='area'`
- current project independent organization/volunteer verification policy

## Formal assignment and area semantics

Existing `work_assignments` remain the source of formal assignment terms and payable accounting.

- `application` source: selected application required. `area` recruitment rechecks area; `all` recruitment intentionally permits an applicant from outside their home area.
- `invitation` source: accepted invitation required; selected-area restriction is enforced if the linked recruitment is area-targeted.
- `shortlist` source: existing permanent profile-sharing + local project-area rule is preserved.

Exact assignment-offer retries return the existing assignment when every term is identical. A different retry cannot silently create a second current assignment.

## Verification and survey-access activation

Profile publication is **not** independent identity verification. UI wording therefore says Active/published profile instead of calling it independently verified.

Current project governance is enforced:

- when an application is selected,
- before a formal assignment offer is created,
- again when the volunteer accepts the offer,
- when the existing direct `set_survey_assignment` override activates access.

If project policy requires independent NGO and/or volunteer verification, the current verification must still be effective at each gate.

Survey access is inserted/upserted into the existing unique `(project_id,user_id)` `survey_assignments` record, making acceptance retry-safe.

## Management UI

Volunteer navigation remains explicit:

- Available Opportunities
- My Applications
- My Assigned Surveys

NGO Admin and POEM survey-management workspaces can create/publish recruitment, close/reopen applications, review applicant snapshots, select/reject candidates, and create formal offers. Existing direct/local candidate search remains available.

Survey project detail keeps the **Open project recruitment** entry point.

## Notifications and audit

Recruitment writes existing notification/audit streams for opportunity creation/state change, application submission/review/withdrawal, formal offers and assignment responses. No separate event system is introduced.

## Boundary

2.12.4 is for authenticated volunteer recruitment only. Public/shareable opportunity pages, anonymous browsing and signup-to-apply remain outside this release.
