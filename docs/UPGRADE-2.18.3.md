# Upgrade to POEM 2.18.3

2.18.3 is migration-free and requires an already-applied 2.18.2 database chain through `20261008000930_withdrawal_operations_manual_settlement.sql`.

```bash
nvm use
npm ci --include=dev
npm run types:generate
npm run test:payments
npm run preflight
npm run test:local
npm run test:operations
```

Do not add table grants to make historical tests pass. Sensitive e-wallet/payment tables are intentionally RPC-only. Do not push to cloud until all gates are green.
