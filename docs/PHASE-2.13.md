# POEM 2.13 — Partner NGO Self-Onboarding & Approval

## Objective

Let an NGO representative use one personal POEM account to apply for a Partner NGO workspace without creating a shared organization login or granting themselves NGO access.

## Workflow

1. Representative creates/signs in to a normal POEM account.
2. Personal workspace → **Partner NGO application**.
3. Draft organization identity/contact details, structured operating areas and programs.
4. Upload private registration/legal evidence and optional authorization/tax/supporting files.
5. Submit the completed application. Editing and document replacement are locked while submitted.
6. Authorized POEM NGO managers review the application and each current document.
7. POEM may request changes, reject, or approve.
8. Approval atomically creates an active `organizations` row, copies structured operations, and creates the applicant's active `ngo_admin` membership.
9. The applicant can then switch to the new NGO workspace.

## Security and data model

New tables:

- `partner_ngo_applications`
- `partner_ngo_application_documents`

Both use RLS. Applicants can read only their own applications/evidence; POEM NGO managers can read the review queue. Mutations are RPC-only.

Private evidence uses the non-public `poem-ngo-applications` Storage bucket. Upload paths are reserved server-side and scoped to the application owner. POEM reviewers receive read/download access but not arbitrary storage mutation rights.

## Review invariants

- Account creation never grants NGO Admin access.
- An application must contain organization/registration/representative/contact/address data, at least one structured operating area, at least one program and ready registration/legal proof before submission.
- Applicant cannot edit while the application is submitted.
- POEM cannot approve until accepted registration/legal proof exists and every current ready document has a review decision of `accepted`.
- Applicant cannot review their own application/document even if they later hold a POEM management role.
- Approval creates the first NGO Admin membership in the same transaction as organization activation.
- Requested changes reopen the application for owner edits and resubmission.

## Compatibility

The release is additive and preserves existing manually-created Partner NGOs and memberships. It does not replace `save_organization()` or `set_membership()` for POEM operational administration.

A small forward migration also replaces the 2.12.6 `work_experience_history()` local variable `target` with `v_target_user_id`, avoiding ambiguity with the existing survey-project `target` column.

## Explicit exclusions

- JazzCash or any other money movement;
- NGO self-publishing of survey templates;
- NGO self-launch of projects;
- Area Focal Person/project-scoped staff roles (planned next);
- legal/KYC certification beyond POEM's internal application/document review;
- malware scanning/quarantine of uploaded evidence.
