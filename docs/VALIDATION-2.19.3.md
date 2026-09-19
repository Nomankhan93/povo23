# POEM 2.19.3 validation

## Primary phase suite

```bash
npm run test:followup
```

Expected result:

```text
17 POEM 2.19.3 follow-up / outcomes / case-closure scenarios passed.
```

The suite covers:

- upgrade preservation with no inferred follow-up/lifecycle rows;
- Project Manager versus Area Focal / cross-NGO authorization;
- follow-up lineage to active case needs and recorded planned assistance;
- scoped due/overdue/upcoming queue behavior;
- optimistic completion and immutable revisions;
- human-recorded outcome plus explicit need-status transition;
- outcome/status consistency checks;
- next-follow-up child scheduling;
- closure blockers for outstanding follow-up, needs, requests and undelivered plans;
- delivered approved requests no longer blocking closure solely by request status;
- structured close/reopen lifecycle history;
- closed-case guard requiring explicit reopen before void/correction of linked planned assistance;
- existing assistance-void → need-review behavior after reopening;
- RPC-only follow-up/lifecycle tables;
- separation from assistance ledger ownership, worker payables, finance, wallets and withdrawals;
- frontend workflow markers.

## Regression order

```bash
npm run test:followup &&
npm run test:assistance &&
npm run test:distribution &&
npm run test:cases &&
npm run preflight &&
npm run test:payments &&
npm run test:local &&
npm run test:operations &&
npx supabase migration list
```

Do not weaken RLS or grant direct browser table access to make a test pass. Internal test inspection of RPC-only tables must use privileged fixture context.
