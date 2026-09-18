# Upgrade to POEM 2.18.1

Required baseline:

- POEM 2.18.0
- `20261008000910_ewallet_default_owner_fix.sql`

New forward migration:

`20261008000920_ewallet_withdrawal_stabilization.sql`

From `/home/noman/projects/poem-phase1.1` after applying the patch:

```bash
nvm use
npm ci --include=dev
npm run types:generate
npm run preflight
npx supabase start
npx supabase migration up --local
node scripts/test-phase217.mjs
node scripts/test-phase2171.mjs
node scripts/test-phase2172.mjs
node scripts/test-phase218.mjs
node scripts/test-phase2181.mjs
npm run test:local
npm run test:operations
```

### Existing data precondition

2.18.1 adds a unique active-wallet rule on `(provider, account_number)`. If development data already binds the same JazzCash number to multiple active POEM accounts, or the same Easypaisa number to multiple active POEM accounts, the migration intentionally stops. Resolve/unlink the duplicate test records rather than weakening the uniqueness rule.

### Transaction PIN behavior change

The browser UI now calls `configure_withdrawal_pin_secure`. Direct authenticated execution of the original `configure_withdrawal_pin` RPC is revoked. After five failed protected PIN checks the user is locked for 15 minutes.

### Mock activation hold

Newly verified mock wallets wait 24 hours before withdrawal. POEM Admin may use **Activate now (mock)** only to accelerate development tests. No live-provider credential or network call is introduced.
