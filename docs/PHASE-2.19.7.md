# FieldLance 2.19.7 — Partner NGO Application Experience

## Objective

Turn the existing Partner NGO self-onboarding workflow into a professional, guided FieldLance organization application without replacing its database, approval or authorization model.

## User experience

The application is split into five guided steps:

1. **Organization** — organization identity, optional logo, registration type, representative details and contact information.
2. **Operating Areas** — existing validated geography hierarchy with selected-area chips and multi-area support.
3. **Programs** — searchable structured program-area choices plus custom program tags.
4. **Documents** — modern drop zone/file chooser, structured document categories and current review status.
5. **Review** — organization/area/program summary, edit links, submission-readiness checklist and final submit.

Draft/change-requested applications use Back / Save draft / Save & continue actions. Submitted applications are read-only and show an Under review state. Successful submission opens a modal only after the server RPC succeeds, with **View application** and **Back to dashboard** actions.

## Structured fields

Registration type options include Trust, Society, Section 42 Company, Foundation, Non-profit Company, Charitable Organization, Community-Based Organization (CBO), Religious / Welfare Organization and International NGO, with an **Other / specify** path.

Representative designation options include Executive Director, CEO, Country Director, Program Director/Manager, Project Manager, Operations Manager, M&E / MEAL Manager, HR/Finance Manager, Field Coordinator, Authorized Representative, Board Member, Chairperson, President and Secretary General, with an **Other / specify** path.

Program areas use a searchable multi-select and optional custom values. The database contract remains the existing `program_names text[]` array.

## Organization logo v1

- Optional JPG/PNG/WebP, maximum 2 MiB.
- Dedicated private Storage bucket: `fieldlance-organization-logos`.
- Deterministic object path: `<application_id>/logo`.
- Applicant may upload/replace/remove only while the application is `draft` or `changes_requested`.
- FieldLance NGO reviewers may read the draft logo during review.
- Unrelated users cannot read the draft logo.
- Approval copies the logo path/timestamp to the new organization; active authenticated platform users may then read it for organization cards/workspaces.
- No crop editor, moderation queue or post-approval logo editor is introduced in this release.

## Documents

Existing private application-document storage remains authoritative. Document categories are extended with `organization_profile` and `financial_document`; registration/legal proof remains required. The browser accepts PDF/JPG/PNG up to the existing 5 MiB limit.

## Submission and approval

Final submission now requires an explicit registration type in addition to the established identity, representative, contact, address, operating-area, program and legal-proof requirements. Approval remains the existing guarded FieldLance review operation and creates exactly one active organization plus the applicant's first NGO Admin membership.

## Non-goals

- No new general organization registry.
- No replacement of RLS/RPC authorization.
- No logo crop editor or public anonymous organization profile.
- No new recruitment, beneficiary, finance, payable, wallet or payment semantics.
- No changes to historical `poem_*` compatibility identifiers.
