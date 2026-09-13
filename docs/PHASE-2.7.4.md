# POEM 2.7.4 — Volunteer Profile Independence & Photo

## Scope

- My profile contains profile fields, profile photo and NGO profile-sharing controls only.
- Work experience and Private documents remain separate sidebar destinations.
- Volunteers can upload/change/remove a private JPG/PNG profile photo up to 2 MiB.
- Profile publishing is self-service: current validation still applies, but admin approval is not required.
- Published profile edits go live immediately.
- Private-document review no longer unpublishes a volunteer profile.

## Compatibility

The database keeps the historical `verified` status as the ready/active profile state because survey/workforce authorization already depends on it. The normal UI labels this state **Active**, not POEM-verified. Existing review RPCs remain for backward compatibility but are not part of the normal profile publishing flow.
