# FieldLance 2.41.0 — Offline Routing & Device Recovery

Built on the delivered 2.40.1 source. No SQL migration, table grant or server authorization rule changes. The current database migration remains `20261013000450_field_evidence_attendance_stabilization.sql`.

## Offline navigation

The service worker serves its cached static shell for same-origin GET navigations to `/` and `/app` routes. Reset/Auth callback and credential-bearing query navigations, API/Storage paths, foreign origins and non-GET requests bypass it. Only built static assets are cached. Static file contents determine the cache version. No skipWaiting is used: close old tabs to activate an update. Invalid URI encoding returns an unknown route instead of throwing.

Offline application startup opens the downloaded field workspace for the remembered, unlocked owner. Attendance deep links select its attendance view/assignment. Other field data must have been explicitly downloaded. This does not provide offline finance, case operations, live maps, public certificates or general dashboards. A locked device requires online sign-in; retained copies are not deleted by locking.

## Device lifecycle

Survey and attendance remain separate encrypted IndexedDB databases with their existing nonextractable keys. A shared inventory shows survey drafts/queue/receipts, attachments, and attendance pending/syncing/failed/acknowledged records. The header logout warning now counts both stores. Lock, sign-out and explicit erase are separate operations.

Attendance DB version 2 adds only a receipts store; existing keys and queue records are retained. New connections close on versionchange and report a blocked upgrade. Pending request IDs and captured timestamps are unchanged on retry. Failed evidence remains in the queue; automatic reconnect skips records requiring attention until explicit retry. Within a tab, sync calls coalesce; Web Locks serialize attendance sync across supported tabs. Server idempotency remains the final duplicate guard.

Owner erase shows fresh unsynced counts and requires typing ERASE. It clears the owner's survey records/downloads, attendance download, queue and receipts in both stores. Other owners and shared encryption keys remain. A generation marker prevents started writes/uploads/syncs from repopulating erased data. The databases cannot share a transaction: a partial cleanup reports an error and permits retry. A cleanup marker blocks new operations for up to two minutes if a tab crashes. Close other field tabs before explicit erase. An already-sent request may still commit on the server; erase is never a server reversal.

## Freshness

Survey download validity continues to use its server-issued lease, capped by the existing server workflow at seven days. Invalid/missing timestamps, expired leases and known access denial stop new offline survey collection. Existing drafts/failed copies remain available for recovery.

Attendance uses an explicit Download / refresh action. It retains up to 100 active assignments, their project policies and the bounded open-session snapshot for up to 24 hours. A download with truncated open sessions is refused. Expiry blocks new offline check-in/out, retaining pending evidence. Successful online mutations/reconnect update an existing download; refresh failure invalidates it. Downloads do not authorize server actions: sync always uses the current server assignment, role, policy and concurrency rules. Clock changes, revoked access, uncertain responses and storage availability require user-visible recovery.

No map pagination, notification delivery, background tracking, new finance ledger or provider integration is introduced.
