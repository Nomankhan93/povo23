# POEM Phase 2.7.3 — Structured Volunteer Profile UI

Phase 2.7.3 replaces unbounded volunteer CV text fields with structured, reusable controls without redesigning the underlying volunteer/profile security model.

## Scope

- Education: controlled single-select with `Other` custom text.
- Skills: searchable checkbox multi-select plus `Other`.
- Languages: searchable checkbox multi-select plus `Other`.
- Preferred work areas: up to 20 structured District or Taluka / Tehsil / Subdivision selections using the Pakistan reference geography hierarchy.
- References: up to three structured reference cards with name, organization, designation, relationship, phone, email and optional notes.
- Work experience: the existing `volunteer_experiences` workflow is embedded in My profile and remains the single structured/NGO-confirmable source of experience history. Role selection is now controlled with `Other`; work description remains free text.
- Authorized profile viewers render structured references and preferred areas instead of raw serialized values.

## Compatibility

No SQL migration is required. The established `save_my_profile` RPC still receives text values. Multi-value/structured profile fields use bounded serialized text inside the existing profile JSON contract, while readers support old free-text values.

Existing free-text skills/languages continue to parse as comma-separated selections. Existing non-standard education becomes `Other`. Legacy references are converted into a structured reference note on edit. Legacy work-experience text is preserved and not silently deleted; new experience should be entered through the structured Work experience workflow.

## Privacy

Structured references are part of the volunteer profile and are visible only under the same existing profile-sharing/RLS rules. Private uploaded reference documents remain separate and private to the volunteer and authorized POEM reviewers.
