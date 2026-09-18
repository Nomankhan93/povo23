# POEM 2.17.2 validation

The 2.17.2 gate validates:

1. finance-only immutable bridge metadata and unchanged role boundaries;
2. atomic rejection of unfunded payable approval;
3. Reserved → Committed posting on funded approval;
4. idempotent one-event/one-bridge linkage;
5. unused commitment release on negative entitlement adjustment;
6. Committed → Spent payment movement and payment reversal;
7. paid-but-later-withdrawn entitlement keeps prior payment without fabricating reserve;
8. project reconciliation detects and replays historical unbridged events idempotently;
9. existing worker payable tables remain authoritative and provider flows remain deferred;
10. funding UI exposes reconciliation without granting finance access to project operational roles.

Run:

```bash
npm run types:generate
npm run preflight
npx supabase start
npx supabase migration up --local
node scripts/test-phase217.mjs
node scripts/test-phase2171.mjs
node scripts/test-phase2172.mjs
npm run test:local
npm run test:operations
```
