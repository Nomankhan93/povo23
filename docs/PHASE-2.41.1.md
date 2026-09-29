# FieldLance 2.41.1 — Map Completeness & Evidence Review

## Objective

Make Field Operations Map results operationally trustworthy at large evidence volumes without changing the existing survey, attendance, case, geography or authorization systems.

## Delivered

- New backward-compatible `field_operations_map_page(...)` RPC with server-side filters and stable keyset pagination.
- True `matched_total` and quality/review counters computed over the full authorized filtered dataset, not the currently loaded page.
- Separate currently-loaded count and explicit partial-results indicator.
- Server-side filters for worker, geography, source status, quality, evidence layers and review-only state.
- Authorized worker/geography/status facets generated from the permission-scoped evidence set.
- Accessible evidence review list with incremental loading; the old 12-row visual slice is removed.
- Source-context navigation for survey responses, attendance assignments and beneficiary cases. Source actions are emitted only when the current actor may read the source; target surfaces still re-check authorization.
- MapLibre clustering remains enabled; cluster click expands the cluster. Renderer/style failures leave the evidence list usable.
- Boundary payloads are derived only from authorized page/project scope; an arbitrary geography filter cannot disclose unrelated boundary geometry.
- Existing `field_operations_map(...)` remains available for older clients.

## Security boundaries

- Personal map remains own-evidence only.
- Field Worker project map remains own-evidence only.
- Area Focal evidence remains project + assigned-geography scoped.
- Project/organization isolation is unchanged.
- Boundary tables remain non-readable directly by authenticated clients.
- Source navigation does not grant new access; destination data is still protected by existing RLS/RPC checks.
- Geographic quality is a review signal, never an automatic fraud judgment.
- No continuous/background tracking was added.

## Database

Forward migration:

`20261013000460_map_completeness_evidence_review.sql`

Historical migrations are unchanged.

## Acceptance

- More than 2,500 authorized evidence rows report the true matched total.
- Keyset pagination reaches every matching row once without duplicates or omissions.
- Server filters and summary counters describe the same authorized filtered dataset.
- Area Focal, personal worker and unrelated-organization denial rules remain intact.
- Map renderer/basemap failure does not remove access to the evidence review list.
- Source actions open only records the current actor is allowed to read.

## Corrected replacement package (baseline 2.41.0)

- Pagination fixtures restore the project moderation state before inserting the large dataset.
- Generated types match the migration-derived generator output exactly.
- Survey source actions require current project-read permission as well as owner/reviewer scope; historical map evidence may remain visible after source access is revoked.
- Session-memory map preferences are separated by user, workspace and project. Returning restores filters, selected evidence and page depth using fresh authorized requests, without caching evidence payloads. Reload/sign-out resets these transient preferences.
- Delegated case navigation carries the exact case ID through the canonical route.
- Rendered component and Chromium checks cover case routing, basemap failure, state restoration, fresh authorization and owner separation.

This replacement is for users who have not applied the superseded 2.41.1 package or migration. No historical migration through 2.41.0 is changed.
