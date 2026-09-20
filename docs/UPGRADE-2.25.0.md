# Upgrade to FieldLance 2.25.0

2.25.0 is a frontend/test/documentation release. It adds **no Supabase migration**.

## Apply

Use the supplied patch installer with `--check`, apply only if there is no conflict, then repeat `--check`.

## Validate

```bash
npm run metadata:check
npm run check
npm run test:earnings-wallet
npm run test:payments
npm run test:field-worker-workspace
npm run test:organization-workspace
npm run test:staff-operations
npm run test:task-center
npm run test:notification-center
npm run preflight
npm run test:local
npm run test:operations
```

Confirm local/remote migration head remains `20261009000800_notifications_communication_center.sql`. Do **not** run `db push` for 2.25.0 because there is no migration.
