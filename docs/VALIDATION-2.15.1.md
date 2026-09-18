# POEM 2.15.1 validation

## Automated gate

Run:

```bash
npm run preflight
npx supabase start
npx supabase migration up --local
npm run test:local
npm run test:operations
node scripts/test-phase215.mjs
node scripts/test-phase2151.mjs
```

`test-phase2151.mjs` covers:

- organization-owned incomplete project drafts without premature `survey_projects` creation;
- continuity across multiple active NGO Admins;
- cross-NGO and ordinary-member isolation;
- POEM-library / same-NGO approved-template allowlist and cross-NGO template denial;
- completeness validation and submitted-state locking;
- changes-request/edit/resubmit lifecycle;
- atomic creation of exactly one active operational project on approval;
- idempotent approval retry;
- direct POEM project-creation template-ownership hardening; and
- RLS/RPC-only workflow mutation.

## Browser acceptance

Test at desktop and narrow mobile widths:

1. NGO Admin opens Survey projects and saves an incomplete project draft.
2. A second Admin of the same NGO can continue the draft.
3. The NGO selects a POEM template or its own approved NGO template and submits.
4. POEM sees the submitted queue, requests changes, then later approves.
5. The NGO sees the review history and the resulting operational project.
6. Another NGO cannot discover the draft or its private template.
7. Existing POEM direct project creation still works with valid template ownership.

## Release boundary

2.15.1 does not implement compensation, funding, payment-provider transfers, performance scoring or production-scale reporting.
