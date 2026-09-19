# POEM 2.19.2 validation

## Required automated checks

```bash
cd /home/noman/projects/poem-phase1.1
nvm use
npm ci --include=dev

npm run types:generate &&
npx supabase start &&
npx supabase migration up --local &&
npm run test:assistance &&
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
15 POEM 2.19.2 assistance ledger / duplicate-support scenarios passed.
```

## Automated scenarios

- Upgrade preserves historical `assistance_entries` and ready distribution plans without inferring delivery links.
- Duplicate preview is available only for ready approved plans.
- Ready planned support cannot bypass plan linkage through legacy direct recording.
- Project Manager may record a no-conflict ready delivery into the existing authoritative ledger.
- Approved request values, not browser-supplied amount/quantity/category terms, drive the planned ledger entry.
- Planned delivery is retry-safe and one plan/request cannot hold two active recorded deliveries.
- A delivered plan cannot be cancelled while its active ledger row remains recorded.
- Same-project next-eligibility conflict is visible; Project Manager cannot override; NGO Admin can override a fully visible blocker with reason.
- Protected cross-NGO blocker exposes no source details to Project Manager/NGO Admin and requires POEM review.
- Assistance ledger is organization/project scoped and identifies planned versus historical/unplanned entries.
- Voiding a planned assistance entry preserves historical provenance and allows one corrected replacement.
- Legacy unplanned assistance rejects exact canonical replay and unexpired same-category eligibility overlap instead of bypassing the controlled duplicate-review workflow.
- Case detail exposes sanitized delivery history without internal duplicate snapshots.
- New delivery provenance table is RPC-only and anonymous access is denied.
- 2.19.2 migration does not mutate worker payables, project finance, e-wallet or withdrawal systems.
- Frontend exposes duplicate review, controlled delivery and Assistance ledger navigation.

## Browser QA

- Ready plan shows **Record delivered assistance**; draft/scheduled/cancelled plans do not.
- User must run **Check duplicate support** before the Record button becomes enabled.
- No-blocker delivery creates a ledger row and case detail shows Delivered.
- Project Manager sees visible duplicate history but receives no override field for a blocker.
- NGO Admin sees an override field only for blockers fully within existing authority.
- Protected cross-NGO blocker shows a POEM-review-required message without source organization/project details.
- POEM survey authority can review visible canonical conflicts and document an override.
- Voiding a delivered ledger entry keeps it in history and allows a corrected replacement.
- Assistance ledger filters by status/category/date and never shows records outside the authorized project/organization scope.
- Existing unplanned/historical recording UI clearly distinguishes itself from controlled planned delivery.
