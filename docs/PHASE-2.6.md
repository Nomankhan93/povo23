# POEM Phase 2.6 — Field Reliability / Offline Survey Foundation

Phase 2.6 makes field collection resilient to intermittent connectivity without changing the server-side survey, registry, consent or authorization model.

## What is included

- Encrypted IndexedDB device drafts for the survey currently being edited.
- A write-ahead survey-save queue created **before** the network RPC begins.
- Stable `p_request_id` reuse after timeout, reconnect, page reload or browser restart.
- Automatic sync on reconnect, workspace load and a 30-second online retry cycle.
- Exponential retry backoff for transient failures.
- Server validation, authorization and optimistic-version conflicts move to `needs_attention`; they are never auto-overwritten.
- User-scoped device queue. Sync verifies the currently authenticated Supabase user before sending a queued item.
- Compact workspace sync status with pending/attention counts and manual sync.
- Project detail refresh when a queued response is later confirmed by the server.

## Device protection model

Survey payloads are not written to `localStorage`. Draft and queue payloads are JSON-encrypted with AES-GCM before IndexedDB persistence. The browser generates a non-extractable device key and stores that `CryptoKey` in IndexedDB.

This protects persisted records from casual disk inspection. It is **not** a substitute for endpoint security: script execution in the same authenticated browser origin can use the key, and unlocked/shared devices remain a risk. Field devices should use OS login/PIN, disk encryption, short screen lock and controlled browser profiles.

Unencrypted queue metadata is deliberately limited to operational identifiers/status (`ownerId`, project ID, response ID, timestamps, retry state and bounded error text). Person names, survey answers and consent payloads remain inside the encrypted envelope.

## Reliability semantics

1. Collector presses Save draft or Submit.
2. Client creates one request UUID.
3. The exact server RPC payload is encrypted into the device queue.
4. If online, the same payload is sent immediately.
5. On confirmed success, the queue copy is deleted.
6. On transient/unknown failure, the same request remains queued and retries later.
7. On SQL validation, permission, serialization/version conflict or other definitive server rejection, the queue copy becomes `needs_attention`.
8. A human reopens the live record, reconciles the issue, and only then discards the failed device copy.

The existing server receipt table remains the source of idempotency truth, so retries with the same request ID cannot silently create a second response.

## Deliberate boundary

Phase 2.6.0 is **not** a complete offline-first PWA. It supports connectivity loss after the project/form has been loaded and preserves drafts/queued saves across reloads. A cold browser start with no network still does not have a complete cached account/project/template/registry dataset. Service-worker shell caching, assigned-project snapshots and offline lookup indexes should be added only after their privacy/refresh rules are designed.

No photo/document offline queue is included. Existing volunteer document storage remains online-only.
