# FieldLance 2.41.13 — Workspace Bootstrap & Refresh Efficiency

Baseline: FieldLance 2.41.12. This is a frontend data-loading patch; no database migration, RLS change, RPC grant change or hosted configuration change is included.

| Surface | 2.41.12 | 2.41.13 |
| --- | --- | --- |
| Browser focus / tab return | re-ran the complete workspace `load()` path | revalidates only account status, workspace access, notifications, active project assignments and recent authorized activity |
| Duplicate foreground events | `focus` and `visibilitychange` could trigger adjacent full reloads | foreground refreshes are visibility-aware and deduplicated within a short window |
| Geography reference | every full workspace reload paged the complete geography table | loaded only when a geography-dependent page is opened and cached in memory until explicitly invalidated |
| Account directory | loaded on every full workspace reload | loaded only for Memberships, Accounts and Activity surfaces |
| Audit activity | latest 100 rows loaded on every full reload | Overview/bootstrap uses 4 rows; Activity promotes to 100 on demand |
| Own volunteer profile | queried twice during bootstrap | one `maybeSingle()` query |
| Notification/profile callbacks | could invoke the full workspace load | notification refresh and profile-photo refresh use narrow data refreshes |
| Geography management mutation | depended on generic full reload | explicitly invalidates and reloads geography reference data |

## Correctness boundary

Efficiency does not replace authorization freshness. Foreground refresh still re-reads the signed-in account, calls `my_workspace_access()`, refreshes active project assignments, refreshes notifications, and reapplies workspace resolution. Suspended accounts or revoked workspace/project access therefore continue to fail closed without requiring a full global-data reload.

## Non-goals

No query/RPC schema change, no offline-storage change, no navigation-capability redesign, no project workflow redesign, and no production-domain/DNS change are included. Additional page-level data ownership can be considered in later patches after this lower-risk shell refresh split is validated.
