# FieldLance 2.41.3 — Notification Routing & Action Context

## Objective

Make actionable notifications open the exact authorized FieldLance record instead of relying on notification wording or a page-only destination.

## Delivered

- Adds `notifications.event_type` as explicit event metadata.
- Current recruitment, assignment, attendance review, survey review, beneficiary-case ownership and operational-task notifications write explicit event/source/action context.
- Historical notifications keep the existing title/action-page compatibility fallback.
- Notification actions resolve to canonical application, assignment, attendance, response, case and task routes.
- Notification clicks re-check current source visibility through existing RLS/RPC boundaries before navigation.
- Workspace access is refreshed before a notification changes workspace scope.
- Deleted, revoked or no-longer-visible source records stay in notification history and show a controlled unavailable/access-changed message instead of opening stale content.
- Task Center routes can carry an exact task ID and visually focus the target task.

## Authorization boundary

A notification is not an authorization grant. The current user must still be able to read the source through the existing table RLS or guarded RPC. Workspace access is refreshed before cross-scope navigation.

## Compatibility

Rows without `source_kind`, `source_ref` or explicit `event_type` continue to use the existing `action_page` / legacy metadata behavior. Historical migrations are not rewritten.

## Out of scope

- External email, push, SMS or WhatsApp delivery.
- New notification provider infrastructure.
- Live payment-provider integration.
- Worker-capacity/concurrency serialization (planned for 2.42.0).
