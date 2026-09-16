# POEM 2.12.5 — Current State Stabilization

This release stabilizes the existing 2.12.x platform before the next product-expansion plan.

## Scope

- Restore the volunteer Workforce Marketplace personal views: Available Opportunities, My Applications and My Assigned Surveys.
- Remove the accidental duplicate NGO/POEM rendering block and merge placeholder residue from `WorkforceMarketplace.tsx`.
- Make published public recruitment discoverable independently of permanent NGO profile-sharing grants.
- Treat `area` recruitment as a work-area description/match signal rather than a home-location visibility gate. Invite-only recruitment remains private.
- Keep application-scoped recruitment profile consent. Applying does not create a permanent `profile_shares` grant.
- Allow volunteers with unpublished profiles to browse public recruitment while keeping application submission gated on an active/published profile.
- Narrow independent volunteer identity verification to identity-relevant name data so skills, languages, availability and preferred-work-area edits do not invalidate identity verification.
- Reject canonical identity reconciliation while unresolved or stale canonical match decisions remain.
- Refresh current-release docs and repository file manifests; remove accidental development residue.

## Explicitly unchanged

- Permanent NGO full-profile sharing remains an optional volunteer-controlled feature.
- Skill and language requirements can still block application submission; they do not hide a public opportunity.
- Invite-only opportunities remain visible only to invited volunteers.
- Project governance and independent verification gates are still rechecked before formal assignment activation.
- No automatic verified-work-experience generation is included; that is planned separately.
- No NGO self-onboarding, wallet, JazzCash or new payment-transfer behavior is included.
