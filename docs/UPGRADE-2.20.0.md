# Upgrade to FieldLance 2.20.0

2.20.0 is a frontend-only Field Worker workspace release. It adds **no Supabase migration**.

## Before applying

```bash
cd /home/noman/projects/poem-phase1.1

git status
nvm use
```

Make sure local changes are understood before applying a patch.

## After applying

```bash
npm ci --include=dev

npm run metadata:check && \
npm run check && \
npm run test:field-worker-workspace && \
npm run test:workforce-marketplace && \
npm run test:ngo-application && \
npm run test:visual-system && \
npm run test:branding && \
npm run test:frontend-foundation && \
npm run preflight
```

Optional migration parity check:

```bash
npx supabase migration list
```

Expected Local/Remote head remains:

```text
20261009000600 | 20261009000600
```

Do **not** run `npx supabase db push` specifically for 2.20.0 because the release contains no migration.

## Browser smoke checks

1. Open the personal Field Worker workspace.
2. Confirm sidebar/header shows Home and the new personal labels.
3. Confirm Home loads even when one optional summary source is unavailable; related workspaces remain directly accessible.
4. Check opportunity/application/offer/assignment counts against the existing marketplace pages.
5. Confirm an offered assignment links to My Assigned Surveys and does not imply survey activation before acceptance.
6. Confirm earnings cards match the existing Wallet & withdrawals summary.
7. Confirm verified work preview matches Verified work history.
8. Check profile readiness and profile/document/offline-field actions.
9. Test desktop, tablet and mobile widths for horizontal overflow.
10. Switch to Organization/FieldLance Staff/Project workspace and confirm their Overview remains on the existing workflow UI.
