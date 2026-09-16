# POEM 2.12.4 Recruitment Stabilization — Validation

## Automated coverage

`scripts/test-phase2124.mjs` exercises the high-risk boundaries on the fully migrated disposable schema:

1. valid Province → Division → District → Taluka fixture hierarchy;
2. valid survey consent notice length;
3. legacy opportunities default to invite-only + applications closed;
4. NGO creates area recruitment without permanent profile sharing;
5. District visibility includes descendant Taluka and excludes outside geography;
6. Draft/unpublished volunteer profile cannot browse recruitment;
7. explicit application-scoped consent and bounded snapshot;
8. address/references excluded and no `profile_shares` row created;
9. application alone gives no project or `survey_assignments` access;
10. duplicate active application and missing consent rejected;
11. closing recruitment preserves received applications;
12. closed recruitment rejects new applications;
13. stale opportunity/application versions conflict;
14. reopen allows new applications before deadline;
15. withdrawn application reuses the same database row on reapply;
16. POEM survey manager can create/review project recruitment;
17. `all` visibility permits an otherwise eligible out-of-area volunteer to apply;
18. independent NGO/volunteer verification blocks selection until satisfied;
19. formal application-to-offer transition uses existing `work_assignments`;
20. identical offer replay returns the same assignment;
21. application/offer creates no survey access before acceptance;
22. acceptance rechecks current governance after verification revocation;
23. acceptance retry cannot duplicate survey access;
24. direct `set_survey_assignment` remains available but obeys current verification policy;
25. work-date, area and NGO filters;
26. direct opportunity table RLS remains closed to ordinary volunteers;
27. UI source contains split volunteer navigation, hierarchy filter, pagination, failed-apply preservation and direct survey assignment rendering;
28. audit/notification events exist;
29. anonymous search/application denied.

Run:

```bash
npm run preflight
```

Focused:

```bash
node scripts/test-phase2124.mjs
```

## Manual browser acceptance

### Volunteer

1. Sign in with an Active/published volunteer profile.
2. Open **Available Opportunities**.
3. Test NGO, hierarchical area, paid/unpaid, skill, work-date and deadline filters.
4. Create enough fixtures to verify Previous/Next pagination if practical.
5. Confirm `all` opportunity can be viewed outside home district, while `area` opportunity cannot.
6. Apply and inspect the consent notice before submission.
7. Intentionally trigger a failed application (for example stale/closed recruitment) and confirm the form/entered data remains visible.
8. Submit successfully; confirm **My Applications** shows the status.
9. Confirm survey project/beneficiary access is unavailable before assignment acceptance.
10. Withdraw a Pending/Shortlisted application; reopen recruitment and confirm reapply does not create duplicate history rows.
11. Receive an offer in **My Assigned Surveys**, review terms, accept and open assigned survey work.
12. Confirm a legacy/direct `survey_assignment` also appears in My Assigned Surveys with clear “direct assignment” wording.

### NGO Admin

1. Open an Active survey project and choose **Open project recruitment**.
2. Publish `all`, `area`, and `invite_only` variants.
3. Use the hierarchical recruitment-area picker; server must reject an area outside the project hierarchy.
4. Review application snapshots and confirm full address/private references/documents are absent.
5. Shortlist and reject candidates.
6. Close applications; confirm existing applications remain reviewable and are not cancelled.
7. Reopen before deadline.
8. Open the same application in two sessions; after one review decision the stale session must receive a conflict.
9. Select a candidate only after any required independent verification is effective.
10. Send a formal paid/unpaid assignment and confirm existing contract/payable terms are used.

### POEM survey manager

1. Open Workforce oversight.
2. Create project recruitment for a partner NGO without joining that NGO as an Admin.
3. Review/shortlist/select applications using project-review authority.
4. Confirm tenant boundaries still prevent unrelated NGO users from reading those applications.

### Security/privacy

1. Application must not create `profile_shares`.
2. Application must not create `survey_assignments`.
3. Ordinary volunteer direct `work_opportunities` query must not expose open recruitment rows; only the safe search RPC returns them.
4. Unrelated NGO Admin must not read application snapshot.
5. Revoke required independent verification after an offer; acceptance must fail until a fresh verification becomes effective.
6. Confirm anonymous/public opportunity page does not exist in this release.
