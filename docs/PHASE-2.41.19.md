# FieldLance 2.41.19 — Error Handling & Production Observability

## Goal
Make production failures diagnosable and user-survivable without sending sensitive field data to third-party telemetry or weakening existing auth/offline boundaries.

## Changes

- Added a top-level React error boundary with a generic recovery screen and short diagnostic code instead of an uncontained blank/crashed application tree.
- Added global `error` and `unhandledrejection` listeners for failures that escape feature-level handlers.
- Added a bounded in-memory diagnostic recorder (`src/lib/observability.ts`) with:
  - maximum 80 recent events,
  - 10-second duplicate suppression,
  - maximum 240-character sanitized messages,
  - strict safe-context allowlist,
  - redaction for auth tokens, URL secrets/query values, UUIDs, email addresses, Pakistan mobile numbers, long numeric values and coordinate pairs.
- Diagnostics never pass the raw `Error` object or caller context to console/browser diagnostic events.
- Added production-safe user-facing error classification for session expiry, authorization changes, connectivity failures and duplicate-record conflicts.
- RPC failures now record the RPC function name and safe transport state only; RPC argument objects are never logged.
- Added Supabase transport diagnostics for network failures and server-side HTTP 5xx responses without recording request URLs, query strings, bodies or table-row data.
- Added safe diagnostics around:
  - auth/session restoration and auth redirect errors,
  - unknown/deep-link route parsing,
  - workspace bootstrap and foreground refresh,
  - workspace switching/onboarding/actions,
  - service-worker registration and failed install state,
  - offline device inventory and attendance sync,
  - MapLibre renderer/evidence loading,
  - notification action/deep-link target failures.
- Added `test:observability-24119` regression coverage.

## Privacy / security guarantees

- No survey answers, beneficiary payloads, notification body text, location coordinates, auth tokens, RPC argument objects, user/project/organization/assignment/response/case IDs are intentionally included in diagnostic context.
- Diagnostics are memory-only. They are not written to localStorage, sessionStorage, IndexedDB, Supabase or a third-party telemetry provider.
- No new external logging/observability dependency is added.
- Existing server-side audit/event records remain authoritative for persisted business/audit history.

## Deliberately unchanged

- No Supabase migration.
- No RLS, authorization, finance, recruitment or collection-policy change.
- No change to offline encryption/device ownership/sync retry semantics.
- No automatic remote telemetry upload.
- Feature-specific business-validation messages remain feature-owned; the new generic user-facing mapping is used only at broad production boundaries.

## Follow-up

2.41.20 should audit accessibility and UX consistency: keyboard/focus handling, dialogs, labels, contrast, touch targets, loading/empty/error states and mobile/RTL edge cases.
