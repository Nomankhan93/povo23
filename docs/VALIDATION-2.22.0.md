# FieldLance 2.22.0 validation

## Automated

```bash
npm run metadata:check
npm run check
npm run test:staff-operations
npm run test:organization-workspace
npm run test:field-worker-workspace
npm run test:workforce-marketplace
npm run test:ngo-application
npm run test:visual-system
npm run test:branding
npm run test:frontend-foundation
npm run preflight
```

Confirm migration parity separately with `npx supabase migration list`; latest Local/Remote row should remain `20261009000600`.

## Browser QA

1. Sign in as each available FieldLance Staff role and open FieldLance Staff → Operations home.
2. Confirm the Home only shows queues/quick actions appropriate to the role.
3. Confirm Organization applications and Field Worker review cards navigate to existing review workspaces.
4. Confirm survey/recruitment/case queues appear only for survey-management authority.
5. Confirm finance attention appears only for FieldLance Admin/Super Admin and opens existing Withdrawals/Project finance workspaces.
6. Confirm Home never directly approves/rejects/settles anything.
7. Confirm Field Worker and Organization workspace Home screens remain unchanged.
8. Confirm Staff sidebar excludes personal profile/work-history/wallet pages.
9. Confirm header/sidebar labels use FieldLance Staff terminology while internal routes remain functional.
10. Test desktop, tablet and narrow mobile widths for horizontal overflow.

## Security expectations

- Staff Home adds no write operation or new mutation RPC.
- Existing RLS/RPC execution grants remain authoritative.
- Finance summary uses guarded admin RPCs rather than direct sensitive table reads.
- Curated navigation does not grant access that the backend would otherwise deny.
