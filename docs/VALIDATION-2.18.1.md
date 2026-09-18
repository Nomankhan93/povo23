# POEM 2.18.1 validation

## Automated gate

```bash
npm run types:generate
npm run preflight
node scripts/test-phase218.mjs
node scripts/test-phase2181.mjs
```

The 2.18.1 suite verifies:

1. An active JazzCash number cannot be linked to two POEM accounts; Easypaisa is independently unique.
2. Mock verification event keys are provider-scoped, wallet-specific and idempotent.
3. Verification starts a 24-hour withdrawal activation hold.
4. Only POEM Admin can use the audited development-only activation override.
5. The old PIN mutation RPC is no longer executable by authenticated users; the secure PIN flow persists failed attempts.
6. Five failed PIN checks create a 15-minute lock that a correct PIN cannot bypass until expiry.
7. Withdrawal request-id replay remains idempotent after account-level serialization.
8. The old `app.wallet_settlement` session value cannot bypass a pending payable reservation.
9. Exact server-generated allocation request IDs still allow provider settlement through existing payable events and the 2.17.2 finance bridge.
10. Verified wallet details stay immutable, verification-event tables remain private, one default wallet is preserved, and no bank/IBAN payout path is added.

## Manual browser acceptance

- Link JazzCash/Easypaisa and confirm only masked numbers return to the browser.
- Verify a wallet from the POEM Admin sandbox and confirm the personal workspace shows the 24-hour hold.
- Confirm the wallet cannot be selected for withdrawal during the hold.
- Use **Activate now (mock)** as POEM Admin and confirm the wallet becomes eligible.
- Configure a transaction PIN, intentionally fail it and confirm remaining attempts decrease.
- Confirm five failed attempts show a 15-minute temporary lock.
- Request a withdrawal after lock expiry/test reset; confirm exact payable reservation and available-balance reduction.
- Confirm NGO payable mutation against the reserved unit is blocked.
- Simulate provider success and verify payable payment + project `Committed → Spent` movement.
- Simulate failure/cancel/reversal regression flows and confirm worker/finance balances reconcile.

## Production limitation

This release hardens the internal payout contract but is still a mock provider sandbox. Live JazzCash/Easypaisa adapters require official onboarding, credentials, request signing, callback verification, network failure/retry testing, provider reconciliation and production operational controls.
