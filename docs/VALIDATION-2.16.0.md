# POEM 2.16.0 Validation

## Automated gates

```bash
npm run types:generate
npm run preflight
npx supabase start
npx supabase migration up --local
npm run test:local
npm run test:operations
node scripts/test-phase214.mjs
node scripts/test-phase2141.mjs
node scripts/test-phase2142.mjs
node scripts/test-phase215.mjs
node scripts/test-phase2151.mjs
node scripts/test-phase216.mjs
```

`test-phase216.mjs` verifies:

1. Survey target and volunteer capacity are separate controls; Area Focal cannot read the global recruitment plan.
2. Distinct committed-volunteer capacity blocks a third direct assignment.
3. Approved responses consume the soft target and close new recruitment without closing the project.
4. An already-assigned volunteer can still synchronize after target reach; over-target approvals remain recorded.
5. Project Manager can increase target/capacity to reopen recruitment but cannot lower the target in this release.
6. Manual close permits draft preparation but blocks publication until reopened.
7. Project Manager receives project-wide recruitment read access while Area Focal does not.
8. Volunteer discovery closes dynamically at target without mutating published opportunity history.
9. UI/source checks preserve the offline-safe boundary and do not replace `save_survey_response()`.

## Manual browser acceptance

- NGO Admin and Project Manager see the project **Soft target & recruitment capacity** card.
- Area Focal sees scoped operational metrics but not the global plan editor or Recruitment navigation.
- Target/capacity values update after refresh and stale concurrent plan edits are rejected.
- When target/capacity/manual gate closes, Project Recruitment no longer permits new published recruitment/offers.
- An already-assigned field volunteer can synchronize a legitimate queued response after target reach.
- Over-target count is visible if additional assigned work is subsequently approved.
- At narrow mobile widths the recruitment-plan controls remain usable without page-level horizontal overflow.

## Important boundary

This release is a soft operational gate, not a financial or strict quota reservation system. 2.16.1 adds compensation defaults/assignment contract integration; 2.17 adds project funding/accounting.
