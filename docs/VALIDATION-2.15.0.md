# POEM 2.15.0 validation

## Automated gates

Run:

```bash
npm run preflight
npx supabase start
npx supabase migration up --local
npm run test:local
npm run test:operations
node scripts/test-phase215.mjs
```

`test-phase215.mjs` verifies:

1. Organization-owned draft continuity across multiple active NGO Admins.
2. Other-NGO and ordinary-member isolation.
3. Submission validation, review-history creation and edit locking.
4. POEM changes-request -> NGO edit -> resubmit lifecycle.
5. Atomic approval and immutable NGO-owned publication with `source_draft_id`.
6. NGO visibility of own approved and POEM-owned templates without cross-NGO leakage.
7. Existing POEM private-draft direct publication compatibility.
8. POEM-only review authority and denied direct workflow-table writes.

## Manual browser acceptance

- NGO Admin opens NGO Workspace -> Survey templates.
- Create from a starter template, edit questions, save and submit.
- A second active Admin of the same NGO can continue an editable draft.
- Submitted draft is read-only.
- POEM Survey Templates -> NGO review queue shows the submission.
- Request changes with a note; NGO sees the note/history and can edit/resubmit.
- Approve; NGO sees the immutable approved template.
- Another NGO cannot see that NGO-owned approved template.
- Project Manager/Area Focal project workspace has no template-management navigation.

## Boundary

2.15.0 does not create NGO project drafts or activate projects. That is the 2.15.1 boundary.
