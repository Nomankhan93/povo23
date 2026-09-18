# POEM 2.18.0 validation

## Automated gate

```bash
npm run types:generate
npm run preflight
node scripts/test-phase218.mjs
```

The 2.18.0 suite verifies:

1. Only JazzCash/Easypaisa payout methods exist and sensitive wallet tables are RPC-only.
2. Pakistan mobile normalization/masking, account-title mock ownership consistency, and POEM-Admin-only mock verification.
3. Server-hashed six-digit transaction PIN workflow.
4. Exact payable allocation reservation and idempotent withdrawal request IDs.
5. Pending allocations block competing payable monetary mutation.
6. End-user provider simulation denial plus POEM-Admin mock processing/success idempotency and existing payable→finance settlement.
7. Mock failure/cancel releases reservations without payment events.
8. Mock reversal restores payable and finance state.
9. Personal masking/isolation from another account.
10. UI clearly labels the mock sandbox and contains no bank-account payout path.

## Manual browser acceptance

In a personal workspace with approved unpaid PKR earnings:

- Open **E-Wallets & withdrawals**.
- Link JazzCash and Easypaisa; confirm the browser never displays the full normalized wallet number after save.
- As the wallet owner, confirm mock verification is denied. As POEM Admin, open **E-Wallet sandbox** and verify that a mismatched payee name cannot receive a mock `verified` result.
- Configure/change the 6-digit transaction PIN.
- Request a withdrawal and verify Available decreases while Pending increases.
- As POEM Admin in **E-Wallet sandbox**, simulate processing/success and confirm Pending clears, paid entitlement increases and project finance moves committed→spent.
- As POEM Admin, simulate failure on another request and confirm availability returns with no payment event.
- As POEM Admin, simulate reversal on a successful mock withdrawal and confirm payable/finance state is restored.
- Confirm the page prominently states **Development sandbox** and no real money moves.

## Production limitation

Passing this suite does not certify live JazzCash/Easypaisa integration. Production adapters still require official provider onboarding, credentials, signed callback verification, network/error testing, rate limits and provider reconciliation.
