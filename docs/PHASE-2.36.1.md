# FieldLance 2.36.1 — Partner Self-Publishing & Platform Moderation

## Purpose

FieldLance 2.36.1 removes the pre-publication FieldLance approval gate from Partner Organization survey templates and survey projects. An active Organization Admin owns the draft and may publish it directly. FieldLance survey-management staff retain post-publication governance through audited block, operational removal and restore controls.

This is a policy/workflow correction over the existing 2.15 draft model. It does not create a second project or template system.

Independent Verification is unchanged. Organization verification, Field Worker verification and beneficiary identity verification remain separate evidence/governance workflows; they are not project/template publication approval gates.

## Organization template lifecycle

1. Organization Admin creates or edits an Organization-owned template draft.
2. Organization Admin publishes the saved draft directly.
3. Publication creates one immutable `survey_templates` version owned by that Organization.
4. No FieldLance approval queue or pre-publication decision is required.
5. FieldLance may later block/remove the published version with a reason, or restore it.
6. An Organization may create a new draft/version to correct content; an already-published version remains immutable.

Historical `survey_template_review_events` and review columns are retained for old records. Legacy submit RPCs self-publish; legacy review RPCs fail closed with an explicit retired-workflow error.

## Organization project lifecycle

1. Organization Admin creates or edits an Organization project draft.
2. The draft may use an allowed FieldLance template or an allowed published template owned by the same Organization.
3. Organization Admin publishes the saved draft directly.
4. Publication materializes exactly one existing `survey_projects` operational record immediately.
5. No FieldLance project-approval queue is required.
6. FieldLance may later block/remove the published project with a reason, or restore it.

Existing `survey_projects.status` remains the operational `active/closed` lifecycle. Moderation is separate so historical responses, cases, payables and audit records are not destroyed.

## Platform moderation

`survey_templates` and `survey_projects` gain `moderation_status` (`allowed`, `blocked`, `removed`), moderation reason/actor/time, and projects record whether a restriction was direct or inherited from a template.

`content_moderation_events` is an immutable audit surface for block/remove/restore decisions. Organization Admins may read moderation history for their own Organization; FieldLance survey-management roles may read/manage the platform moderation surface.

A temporary **block** makes the project/template operationally ineligible without rewriting existing opportunity/assignment state, so existing commitments are paused and can resume after restore if the project still satisfies its normal rules. **Remove from operation** is stronger: it closes recruitment/opportunities, deactivates direct survey assignments, cancels pending recruitment items and offered/active formal work assignments, and prevents new collection. Historical survey/case/assistance/payable/audit records remain readable under their existing permissions.

Template moderation cascades the same block/remove state to dependent projects. Restoring a temporary block can resume preserved commitments; restoring removed content does **not** silently reopen recruitment or recreate cancelled assignments, so the Organization must deliberately reopen/reassign work.

## Enforcement

Moderation is not a frontend-only control. Guarded database helpers/triggers prevent moderated projects/templates from being used to:

- open project recruitment;
- activate direct survey assignments;
- publish/open project work opportunities;
- create/reactivate offered or active formal assignments;
- insert new survey responses or change collection answers/consent toward submission.

Existing RLS/RPC project, Organization and geography authorization remains authoritative.

## Migration

Adds one forward migration:

`20261013000200_partner_self_publish_platform_moderation.sql`

Existing approved/published artifacts remain allowed. Unresolved old NGO template/project submissions that have not produced a published artifact are returned to editable draft state so the owning Organization can decide whether to publish them.
