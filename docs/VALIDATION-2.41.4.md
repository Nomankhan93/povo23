# FieldLance 2.41.4 validation

Required automated gates:

```bash
npm run preflight
npm run test:browser-241
npm run test:browser-network-2412
npm run test:browser-attendance-2414
npm run test:browser-map-2411
```

`test:correctness-2414` is included in `npm test`. It executes migration-backed authorization/lookup checks and rendered component behavior, rather than relying only on source-text assertions.

New acceptance scenarios:

- Online capture with no download, and online check-in availability with an expired download; offline expiry still blocks capture.
- Actual native offline state plus blocked uncached transport, encrypted checkout/reload, rejected sync and explicit retry, completed download refresh, lock/erase and static-only caches.
- Exact task outside a 500-item queue, wrong workspace/owner, missing and revoked task, anonymous denial.
- New review notification contains the exact session ID; historical workday lookup is independent of the recent list.
- Unavailable notification feedback survives refresh; task tabs stay on the user's selected filter; revoked linked details are removed.
- Legacy notification and assignment-attendance routes remain compatible.

After local migration, also run `npm run test:local` and exercise notification clicks with real accounts. Browser fixtures simulate Supabase transport; embedded PostgreSQL tests are not live Auth/Storage acceptance. Physical-device testing and deployment remain separate.

Build-side results and environment limitations are recorded in the patch's `VALIDATION_RESULTS.md`.
