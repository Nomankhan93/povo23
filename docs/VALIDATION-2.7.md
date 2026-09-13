# POEM 2.7 validation

## Automated acceptance

`node scripts/test-phase27.mjs` covers:

1. NGO creates an opportunity bound to its active survey project and local area.
2. Only verified, explicitly shared, geographically eligible volunteers discover the opportunity.
3. Volunteer application is private from unrelated NGOs.
4. NGO shortlist/select review uses optimistic versions.
5. Candidate finder exposes aggregate experience indicators without a numeric ranking.
6. Formal paid assignment terms do not activate survey access before acceptance.
7. Volunteer acceptance activates `survey_assignments` while preserving immutable assignment terms.
8. Completion stores structured feedback and removes field access.
9. Accepted invitations can become formal assignments without duplicate volunteer accounts.
10. Survey-project closure cancels active workforce access.
11. Anonymous operations remain denied.

## Manual browser checks

- Personal workspace → Workforce marketplace shows only matching open local opportunities.
- Apply, withdraw and NGO review states remain clear on mobile width.
- NGO workspace can create a project-linked opportunity and find local verified volunteers.
- Candidate row shows `Insufficient data` instead of a misleading percentage for small samples.
- NGO cannot send a formal assignment when the candidate has no accepted application/invitation or selected shortlist.
- Paid assignment requires a compensation basis/rate; volunteer assignment stores no rate.
- Volunteer must accept before the Survey projects screen permits collection.
- Completing/cancelling an assignment removes collection access on the next request.
- Closing a project cancels an active workforce assignment and preserves its history.
- POEM workforce oversight is read-only in the UI.

## Not validated by this phase

Payment calculation/settlement, wage disputes, automated levels/scores, attendance, payroll/tax treatment and employment-law compliance are not implemented by Phase 2.7.
