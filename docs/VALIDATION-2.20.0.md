# FieldLance 2.20.0 validation

## Automated validation contract

Run:

```bash
npm run metadata:check
npm run check
npm run test:field-worker-workspace
npm run test:workforce-marketplace
npm run test:ngo-application
npm run test:visual-system
npm run test:branding
npm run test:frontend-foundation
npm run preflight
```

`test:field-worker-workspace` verifies:

- package/release wiring is 2.20.0;
- personal Overview uses the dedicated Field Worker dashboard while other workspaces retain the existing Overview;
- Discover → Apply → Selection → Assigned → Complete → Earn remains explicit;
- dashboard reads existing recruitment/assignment/withdrawal/work-history sources only;
- no dashboard write/mutation RPC is introduced;
- recommended daily metrics and next-action states exist;
- offer/acceptance activation wording remains explicit;
- personal navigation labels are presentation-only and stable internal page IDs remain present;
- profile/account/offline readiness actions exist;
- responsive Field Worker dashboard styling exists;
- migration head/count remain unchanged.

## Database boundary

2.20.0 adds no SQL migration. Expected ordered migration head:

`20261009000600_partner_ngo_application_experience.sql`

Local and remote histories should stay aligned through that migration.

## Manual browser validation

- Personal Home loads and refreshes.
- Empty/new Field Worker state gives a clear path to complete profile and find work.
- Application state links to My Applications.
- Offered assignment state prioritizes Review offers.
- Active assignment state prioritizes assigned work and offline field access.
- Current work card shows project/organization/date/compensation snapshot.
- Earnings summary links to existing earnings and wallet/withdrawal pages.
- Verified work preview is read-only and matches existing FieldLance history.
- Navigation labels are updated only in personal workspace.
- Organization/Project/FieldLance Staff workspaces do not receive the personal dashboard.
- Responsive layout has no horizontal scroll at common mobile widths.

## Known boundaries

- Dashboard summaries are bounded read models for UX; authoritative detail remains in the related feature workspaces.
- No new notification channel, live payment provider, reputation score, certificate generation or M&E system is included.
- Full production browser/mobile E2E, load testing, monitoring and disaster-recovery certification remain later roadmap work.
