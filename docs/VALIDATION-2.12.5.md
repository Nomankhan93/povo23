# POEM 2.12.5 validation

## Automated acceptance

- Public `all` and `area` recruitment is visible to active logged-in volunteers without a permanent NGO profile share.
- A volunteer outside the work area still sees the opportunity and receives an area-match notice.
- An unpublished volunteer can browse but cannot apply until the volunteer profile is active/published.
- Application-scoped consent does not create a permanent `profile_shares` record.
- Personal Workforce pages render Available Opportunities, My Applications and My Assigned Surveys.
- Duplicate NGO/POEM marketplace blocks and placeholder residue are absent.
- Non-identity CV edits do not stale independent volunteer identity verification; changing the verified identity name does.
- Canonical reconciliation refuses unresolved or stale match decisions.
- Existing RLS remains enabled on every public application table.

## Manual browser acceptance

1. Login as an active volunteer who has not shared their full profile with the recruiting NGO.
2. Open Available Opportunities and confirm published public opportunities are visible.
3. Confirm an opportunity outside the volunteer's profile area remains visible with a travel/work-area notice.
4. Apply and confirm the application consent text explains the bounded recruitment snapshot.
5. Login as the NGO and confirm the application is reviewable but no permanent profile-sharing grant was created.
6. Confirm My Applications and My Assigned Surveys render normally.
7. Confirm invite-only recruitment remains absent unless that volunteer has an invitation.
