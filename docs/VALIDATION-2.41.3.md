# FieldLance 2.41.3 validation

## Automated regression

Run:

```bash
npm run test:notification-center
npm run test:notification-routing-2413
npm run check
npm run build
```

The 2.41.3 regression checks verify:

- explicit `event_type`, source and action metadata in the forward migration;
- exact application, assignment, attendance, survey-response, case and task route resolution;
- current RLS/RPC visibility checks before entity navigation;
- workspace-access refresh before cross-scope routing;
- controlled unavailable/access-changed handling;
- legacy `action_page` fallback;
- entity-aware Task Center routes and focused task UI.

## Local Supabase acceptance

After applying the migration locally:

```bash
npm run types:generate
npm run types:check
npm run test:local
```

Exercise at least one real notification for each available workflow: application, assignment offer/response, attendance review, survey review, beneficiary-case assignment and operational task. Revoke one target permission after notification creation and confirm the notification remains visible but does not disclose/open the now-inaccessible source.

## Release boundary

2.41.3 improves navigation context only. Existing RLS/RPC authorization remains authoritative and no notification grants access by itself.
