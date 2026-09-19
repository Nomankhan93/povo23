# FieldLance 2.19.6 validation

Focused validation:

```bash
npm run metadata:check
npm run test:visual-system
npm run test:branding
npm run test:frontend-foundation
npm run check
```

Full local validation:

```bash
npm run preflight
npm run test:payments
npm run test:local
npm run test:operations
npx supabase migration list
```

Expected focused result:

```text
11 FieldLance 2.19.6 visual-system/navigation scenarios passed.
```

Database expectation: Local and Remote remain aligned at `20261009000500_fieldlance_brand_compatibility.sql`; 2.19.6 introduces no migration.

Manual browser smoke checks:

- Auth tabs read **Field Worker / Organization / FieldLance Staff** and still enter the same underlying authorized workspaces.
- Sidebar uses the FL icon + live FieldLance text, dark navy shell, blue selected item and emerald active indicator.
- Worker navigation exposes Work & earnings as a distinct section when existing role/scope logic allows those pages.
- Recruitment and Withdrawal operations remain discoverable only when existing AppShell authorization logic exposes them.
- Header notification shortcut opens Notifications and displays the unread count without changing notification security.
- Mobile drawer opens/closes, traps focus, closes with Escape and returns focus to the navigation toggle.
- Existing feature screens remain readable with the compatibility CSS aliases and unchanged database status values.
