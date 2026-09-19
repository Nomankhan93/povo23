# POEM 2.19.1 validation

## Required automated checks

```bash
cd /home/noman/projects/poem-phase1.1
nvm use
npm ci --include=dev

npm run types:generate &&
npx supabase start &&
npx supabase migration up --local &&
npm run test:distribution &&
npm run test:cases &&
npm run preflight &&
npm run test:payments &&
npm run test:local &&
npm run test:operations &&
npx supabase migration list
```

Expected phase-suite ending:

```text
15 POEM 2.19.1 assistance distribution planning scenarios passed.
```

## Automated scenarios

- Upgrade preserves approved assistance requests and historical delivered assistance; no plan is inferred.
- Draft/non-approved requests cannot enter distribution planning.
- Project Manager can plan only its assigned project; Area Focal and another NGO are denied.
- Plan creation is idempotent and one non-cancelled plan per request is enforced.
- Approved request version is snapshotted into the plan.
- Draft/scheduled edits use optimistic versions and revision history.
- Planning queue is project/organization scoped and reports approved requests awaiting plans.
- Invalid schedule windows are rejected.
- Scheduling records controlled schedule state without recording delivery.
- An on-hold case blocks readiness until reopened.
- Active plan blocks approved-request cancellation.
- Cancelling a plan preserves history and permits a replacement while the request remains approved.
- Request cancellation succeeds only after every active plan is cancelled.
- `assistance_entries` remains unchanged by planning lifecycle operations.
- Planning migration contains no worker payable, finance, wallet or withdrawal mutation path.
- Direct writes and anonymous planning access remain denied.

## Browser QA

- Approved request shows **Create distribution plan**; draft/submitted/rejected requests do not.
- Plan can be created, edited, scheduled, rescheduled, marked ready and cancelled.
- Queue filter shows Draft / Scheduled / Ready / Cancelled plans only within the authorized scope.
- Project Manager sees planning controls but still does not see assistance-request Approve/Reject controls.
- Area Focal does not gain the beneficiary-case/planning workspace.
- Copy consistently states that planning/readiness is not delivery.
- Cancelling an approved request with an active plan is blocked and the UI instructs the user to cancel the plan first.
- No `assistance_entries` row appears until a later explicit delivery workflow is implemented.
