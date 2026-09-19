# FieldLance 2.21.0 validation

## Automated

Run:

```bash
npm run metadata:check
npm run check
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

1. Sign in as an active NGO/Organization Admin.
2. Open the Organization workspace and confirm Home renders the organization logo/name/status.
3. Confirm personal-only profile/work-history/wallet pages are not present in the Organization sidebar.
4. Confirm Home metrics reflect organization-visible projects/recruitment/assignments/cases.
5. Open Recruitment from Home and verify the 2.19.8 four-view marketplace remains intact.
6. Review a pending application and confirm selection/offer actions still occur in Workforce Marketplace, not on Home.
7. Confirm accepted assignment behavior is unchanged.
8. Open Projects, Team & access, Cases, Assistance, Payables and Project finance from Home/navigation.
9. Switch back to Field Worker workspace and confirm 2.20 Home remains unchanged.
10. Switch to FieldLance Staff/Project workspaces where authorized and confirm their existing Overview behavior remains unchanged.
11. Test desktop, tablet and narrow mobile widths for horizontal overflow.

## Security expectations

- Organization Home performs no direct write operation.
- Navigation does not widen RLS/RPC authorization.
- Private Partner NGO application documents are not exposed.
- Recruitment profile sharing remains application-scoped unless another existing explicit authorization grants more access.
