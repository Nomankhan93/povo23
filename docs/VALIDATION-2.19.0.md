# POEM 2.19.0 validation

## Required automated checks

```bash
npm run types:generate
npx supabase start
npx supabase migration up --local
npm run test:cases
npm run preflight
npm run test:payments
npm run test:local
npm run test:operations
npx supabase migration list
```

Expected phase-suite ending:

```text
14 POEM 2.19.0 beneficiary cases / assistance requests scenarios passed.
```

## Scenarios

- Existing needs and delivered assistance survive upgrade unchanged; no inferred cases/requests.
- Project Manager can open/manage cases but Area Focal cannot enter the case-management boundary.
- Case creation is idempotent and captures source-survey / identity provenance.
- One assessed need cannot be active in multiple cases.
- Draft request creation does not create delivered assistance.
- Cash/goods/service request shapes and active-need links are validated server-side.
- Project Manager can submit but cannot self-approve; NGO Admin / POEM survey authority reviews.
- Approval moves an open need to in-progress planning without recording delivery.
- Queue/detail are organization/project scoped and expose approval capability explicitly.
- Other NGO and Area Focal isolation is preserved.
- Active requests / pending needs block unsafe unlink/closure.
- Direct writes and anonymous access remain denied.

- Draft request editing uses optimistic version checks and revision history.
- Forward stabilization serializes draft creation with case/need-link mutation; review UI requires explicit Approve/Reject submitter.

## Browser QA

- POEM survey workspace: all authorized cases, filters, review actions.
- NGO workspace: only own-organization projects/cases.
- Project Manager workspace: only assigned project, create/submit but no approve/reject controls.
- Case creation requires approved source survey.
- Assistance request copy clearly states approval is planning, not delivery.
- Closing a case with unresolved work shows a server error and does not mutate state.
