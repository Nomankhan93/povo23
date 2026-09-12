# POEM 2.6 validation

## Automated gates

```bash
npm run types:check
npm run check
npm test
npm run build
```

`npm test` now includes `scripts/test-phase26.mjs`, which guards the field-reliability architecture: IndexedDB-only persistence, AES-GCM encryption, write-ahead queue ordering, stable request IDs, conflict hold behavior, draft restore and global sync status wiring.

With local Supabase running:

```bash
npm run test:local
npm run test:operations
```

## Manual acceptance

- Open a survey, enter identity/answers/consent and wait briefly; close/reopen the form and confirm the encrypted device draft restores.
- While offline, Save draft. Confirm the form closes and the header reports one saved/pending survey.
- While offline, Submit a second survey. Reload the browser; after connectivity/session workspace access is available again, confirm both queued saves are still present. Cold offline boot is not part of this release.
- Reconnect. Confirm automatic sync uses the server's existing idempotent save path and the queue reaches zero.
- Interrupt a request after enqueue and retry/reload. Confirm no duplicate server response is created.
- Create a stale response-version conflict. Confirm it becomes `needs_attention` and is not retried as an overwrite.
- Sign in as another user on the same browser profile. Confirm the previous user's queue is neither synced nor surfaced in that user's counts.
- Confirm device-storage errors do not claim an offline save succeeded.

## Remaining production work

Phase 2.6 does not provide cold-start offline project navigation, offline registry search, offline documents/photos, remote device wipe, browser database retention policy, centralized device inventory or service-worker application shell caching.
