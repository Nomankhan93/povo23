# FieldLance 2.42.6 — Field Operations Map UX

FieldLance 2.42.6 modernizes the existing permission-scoped Field Operations Map without changing location collection, map authorization, the `field_operations_map_page` RPC contract, keyset pagination, source authorization or database state.

## Operational map workspace

- Reframes the feature from “map followed by a long list” into an operational map + selected-evidence review workspace.
- Prioritizes full-result Matching evidence, Needs review, Outside area and GPS/location issue totals returned by the existing server contract.
- Keeps loaded-row completeness explicitly separate from full authorized filtered totals.
- Synchronizes marker/list selection with a selected-evidence review surface.
- Keeps the evidence records usable if MapLibre/OpenFreeMap cannot initialize.

## Selected evidence review

The selected-evidence surface uses only fields already returned by the authorized map RPC: evidence type, worker, project, captured time, geography, status, authorized coordinates, GPS accuracy, quality, review signals, note and `source_openable` state. Review signals remain operational prompts and are explicitly not presented as fraud findings.

Desktop uses a map + selected-evidence detail layout. Mobile opens selected evidence in the shared focus-managed BottomSheet and keeps the evidence records available below the map.

## Filters, layers and completeness

- Existing date, worker, geography, status, quality, layer and needs-review filters remain server-backed.
- Mobile filters move into the shared BottomSheet rather than compressing the desktop FilterBar.
- Clear filters restores the default 30-day window and all evidence layers.
- Keyset pagination and Load more remain unchanged; no unbounded history fetch or client-only replacement filtering is introduced.
- `fieldMapViewState.ts` remains unchanged and continues to persist only transient filter/layer/page/selection state; evidence payloads are reloaded through fresh server authorization.

## Privacy and authorization

No new location collection is introduced. The Map remains a renderer of existing explicit survey GPS, attendance check-in/check-out and case follow-up evidence. There is no `watchPosition`, continuous tracking, background GPS or movement-history feature.

Personal own-only scope, Area Focal geography scope, project/organization management scope and `source_openable` current-authorization checks remain server-authoritative.

## Presentation architecture

- Adds `src/features/maps/FieldOperationsMap.module.css`.
- Retires the legacy Field Operations Map selectors from `src/styles/design-system.css` after proving the production component no longer consumes them.
- Uses shared 2.42 UI primitives and `--fl-*` design tokens.
- New Map CSS contains no hard-coded color literals, `!important`, or operational typography below 12px.
- Feature responsive boundaries are limited to 1023px and 639px.
- MapLibre runtime paint colors are derived from the shared design tokens, with approved design-system values only as runtime fallbacks.

## Backend boundary

No migration, schema, RLS, RPC implementation/signature, grant or Supabase deployment change is included. Migration inventory remains 87 files with head `20261013000580_project_lifecycle_e2e_integrity.sql`.
