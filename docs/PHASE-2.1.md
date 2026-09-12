> Phase 2.2: [Registry Review & Assistance Ledger](PHASE-2.2.md) adds identity corrections, project-scoped match decisions and recorded deliveries. See [upgrade instructions](UPGRADE-2.2.md). Earlier-phase sections retain their historical scope.

# Phase 2.1 — Survey & Registry Pilot

This online pilot extends Phase 1.4. It is not the complete operational MVP.

## Included

- Immutable published survey versions: text, number, date, single choice and yes/no; required fields and server-side answer validation.
- NGO projects with a fixed template, geography, target, dates, purpose and consent notice/version. Closing a project stops collection.
- Explicit surveyor assignments and revocation. Assignment candidates must be active, verified volunteers currently sharing their profile with that NGO.
- Draft, submitted, correction required, approved and rejected responses; optimistic version checks and revision history. No self-review.
- Separate project-scoped persons and households, reusable across responses within authorized scope; automatically allocated POEM-BEN numbers.
- Server-recorded consent metadata. Minor or unknown-age records require a representative name and relationship.
- Database-enforced organization, project and collector isolation, audit events and notifications.

## Permissions

| Role | Survey access |
| --- | --- |
| Super Admin / Admin / Survey Manager | Publish templates, create/close projects, assign surveyors, review and read pilot records |
| NGO Admin | Read own NGO projects; assign eligible surveyors and review responses; cannot publish/create/close projects |
| Assigned collector | Collect during project dates; read own responses and linked persons/households; edit own drafts or corrections |
| Other staff / volunteers | No survey access unless separately authorized by membership or assignment |

A volunteer profile-sharing grant is required when creating an assignment. Revoking that grant does not revoke an existing survey assignment: revoke the assignment separately. Suspended accounts and NGOs lose access; closed projects retain authorized historical reading and review.

Approval of a survey never verifies a person's identity. All person identities remain provisional. The registry number identifies a record, not a deduplicated human across projects.

## First pilot and manual acceptance checklist

1. Confirm an active NGO, sourced geography, two distinct active accounts and a verified volunteer profile shared with the NGO. Use existing admin access; no bootstrap/reset needed.
2. As POEM Admin or Survey Manager, publish a template containing all five question types. Publish a second version and confirm the first remains unchanged.
3. Create a project with today's date inside its collection window, select the correct template and write a purpose and consent notice appropriate for the pilot.
4. Open the project, search eligible volunteers and assign one. As that volunteer, switch to the personal workspace and open Survey projects.
5. Start a survey with a new person and household. Record consent and representative details when required. Save a partially answered draft, reopen and submit complete answers. Confirm a false yes/no answer is retained.
6. As a different authorized reviewer, request correction with a note. Correct/resubmit as collector; approve as reviewer. Check revision history, notification, and provisional identity status.
7. Collect another response for an existing person, then a different person in the same accessible household. Confirm separate person IDs.
8. Sign in as another NGO and an unassigned volunteer: neither may read this project's records. Assign a second collector and check they cannot browse/reuse the first collector's people.
9. Revoke an assignment and confirm a new save is denied. Close the project and confirm collection stops while authorized historical review remains available.
10. Check narrow mobile layout, keyboard navigation, validation messages and refresh behavior in the actual browser.

These browser/HTTP checks have not been executed in the build environment.

## Pilot limits and operating rules

Template drafts are held in the editor until publishing. No saved draft builder, conditional questions, repeatable household questionnaire, photo/document/GPS survey fields, offline storage or sync yet. Existing volunteer document functionality remains separate.

Person/household identity details cannot be edited or merged in this increment. Review mistakes before submission; incorrect identity records need an operational correction decision and a new record where necessary. Do not treat this pilot as the final canonical registry. Needs assessments, assistance ledger, duplicate resolution, beneficiary data-sharing grants and exports are later increments.

Lists use 50-record pages. Template and assignment supporting selectors cap at 1,000 records; assignment search returns up to 50 candidates. Person selection uses the current filtered registry page. Existing account/organization selector limits still apply. Keep initial pilots within these limits.

New response creation has no offline/idempotent retry key: after a connection failure, refresh the response list and check for the saved record before submitting again. Closing a project requires returning to the project list to refresh the displayed status; the database enforces closure immediately.

Consent wording is snapshotted per response revision. This is a consent-recording mechanism, not a completed retention/deletion/withdrawal policy engine. Finalize your pilot's purpose, access policy and handling of corrections before using real sensitive records.
