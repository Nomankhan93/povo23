# FieldLance 2.41.18 — Performance, Bundle & Query Efficiency

## Goal
Reduce initial/mobile transfer cost and repeated runtime work without weakening authorization, offline field collection, or release safety.

## Changes

- Added Vite build manifest generation so the offline shell can select critical dependency graphs instead of precaching every generated asset.
- Reworked `build-field-worker.mjs` to precache only:
  - the core `src/main.tsx` graph,
  - the offline `OfflineFieldWorkspace` graph,
  - install metadata and right-sized brand assets.
- Role/admin/reporting lazy chunks now remain on-demand instead of being downloaded during service-worker installation.
- Converted Field Worker, organization and FieldLance staff dashboards plus selected secondary workspaces to lazy boundaries.
- Removed global `organizations` (500 rows) and `organization_memberships` (1000 rows) directory fetches from every workspace bootstrap.
- Added demand-driven organization and membership directory policies for pages that actually render cross-organization data.
- Own organization context remains available at bootstrap; foreground refresh only reloads it if workspace organization IDs changed.
- Increased foreground focus/visibility deduplication from 1.5 seconds to 30 seconds to avoid repeated refresh storms during normal mobile app switching.
- Replaced runtime use of the ~1.84 MB source icon and ~650 KB source wordmark with the existing 192px PWA icon and a 768px optimized WebP wordmark (~35 KB). High-resolution approved masters remain in source control.
- Added `test:performance-24118` regression coverage.

## Deliberately unchanged

- No Supabase migration.
- No RLS/auth/capability changes.
- No automatic caching of API, Auth, Storage or user data.
- No change to offline survey encryption, device ownership or sync semantics.
- No blind manual vendor chunk configuration; chunk boundaries are driven by measured route ownership.

## Follow-up

2.41.19 should audit production error handling and observability, including React errors, RPC failures, offline sync failures, deep-link failures and sensitive-data-safe diagnostics.
