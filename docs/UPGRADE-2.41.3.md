# Upgrade to FieldLance 2.41.3

## Database

Apply the forward migration:

```bash
npx supabase migration up --local
```

Migration head:

```text
20261013000470_notification_routing_action_context.sql
```

The migration adds `notifications.event_type` and replaces selected current notification-producing functions so they write explicit source/action context. Historical migrations remain unchanged.

## Application

2.41.3 adds entity-aware notification routing and exact Task Center routing. No environment variable changes are required.

## Validation

```bash
npm run test:notification-center
npm run test:notification-routing-2413
npm run check
npm run build
npm run test:local
git diff --check
```

For the full release gate run `npm run preflight` after the local migration has been applied and generated database types match the migrated schema.
