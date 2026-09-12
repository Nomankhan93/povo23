# POEM Phase 2.5 — Controlled NGO Data Sharing & Assistance Coordination

Phase 2.5 turns the canonical identity layer into a controlled coordination workflow. It does **not** give partner NGOs broad access to another NGO's survey, registry, documents, evidence or case notes.

## Authorization model

A cross-NGO summary requires all of the following:

1. The requesting NGO has its own project-scoped registry person.
2. That person is currently linked to the same canonical POEM identity as a source NGO record.
3. An active NGO Admin of the requesting NGO creates a purpose-bound request.
4. An active NGO Admin of the source NGO approves all or a subset of the requested fields.
5. POEM Survey Manager/Admin/Super Admin authorizes all or a subset of the source-approved fields and sets an expiry no later than the requested expiry.
6. The grant remains active, unexpired, both NGOs remain active, and the canonical identity/version remains unchanged.

Any canonical merge/reversal or other canonical version change invalidates the old grant until a fresh request is authorized.

## Shareable fields in 2.5

Only these field groups can be requested:

- `basic_identity_summary` — POEM beneficiary number, canonical display name and birth date.
- `assistance_categories` — category only.
- `assistance_dates` — delivered date only.
- `program_names` — source NGO program name only.
- `next_eligibility_date` — recorded next-eligibility date only.
- `needs_summary` — need category, priority, status and follow-up date.

The workflow does not share raw survey answers, phone/address, documents, medical files, funding source, assistance amount/quantity, evidence reference, internal notes or correction history.

## Tables

- `data_access_requests` — purpose, requested field scope, source decision, POEM decision and optimistic version.
- `data_access_grants` — immutable approved purpose/scope plus active/revoked state and expiry.
- `data_access_events` — request/review/view/revocation event trail.

Partner browser users have SELECT only. Business changes use security-definer RPCs with RLS-backed scope checks.

## RPCs

- `data_access_request_context(request)` — returns only the caller's own NGO beneficiary context; POEM sees both sides for review.
- `data_sharing_sources(person)` — for an NGO Admin's own registry person, lists other active organizations linked to the same canonical identity and only coordination availability signals.
- `create_data_access_request(...)` — creates a purpose-bound request for 1–90 days.
- `review_data_access_request(...)` — source NGO approve/reject; approval may only reduce the field set.
- `authorize_data_access_request(...)` — POEM final approve/reject; authorization may only reduce source-approved fields and validity.
- `get_shared_beneficiary_summary(grant)` — grantee NGO Admin only; returns only authorized fields and logs each view.
- `revoke_data_access_grant(...)` — source NGO or POEM may immediately revoke.

## UI

A new **Data sharing** workspace is available to NGO Admins and POEM survey-management roles. NGO Admins can create requests, review inbound requests, view approved summaries and inspect visible grants. POEM staff receive a final authorization queue and may revoke active grants.

## Explicit boundaries

- No direct cross-NGO table access is granted to `registry_persons`, `survey_responses`, `beneficiary_needs`, `assistance_entries`, canonical tables or files.
- Sharing is source-organization-specific even when multiple NGOs are linked to the same canonical person.
- Expiry is enforced at every summary request; no background job is required to flip a stored status.
- Revocation prevents future requests immediately but cannot recall information already viewed/copied/exported outside the platform.
- No bulk cross-NGO export is included.
- No automatic beneficiary eligibility or duplicate-aid decision is made. The summary is coordination context for human review.
