# FieldLance 2.40.0 — Field Operations Map & Geographic Quality

FieldLance 2.40.0 adds a permission-scoped operational map over existing explicit field evidence. It does not introduce continuous or background worker tracking and it does not create a second location system.

## Delivered

- Project **Map** tab in the existing Project Workspace.
- Field Worker **My Field Map** at `/app/field/map`.
- MapLibre GL browser rendering with OpenFreeMap/OpenStreetMap basemap and no Google API key.
- Survey GPS answers, attendance check-in/check-out, and explicitly captured case follow-up visit locations on one map.
- Worker, date, administrative area, evidence status, layer and geographic-quality filters.
- Optional authoritative Polygon/MultiPolygon GeoJSON boundaries attached to existing `geographies` rows, with immutable superseded/removed boundary revisions.
- Provider-independent point-in-polygon evaluation in PostgreSQL.
- Geographic quality states: `within_assigned_area`, `outside_assigned_area`, `poor_accuracy`, `location_unavailable`, `unable_to_determine`.
- Review-only consistency signals such as survey evidence outside an attendance window and attendance with no GPS survey activity for that day.
- Explicit field/office follow-up visit location capture with `location_recorded_by` attribution. No background watcher is registered.
- Strict project, organization, Area Focal geography and Field Worker self-only authorization in the guarded map RPC.

## Important behavior

A missing geography boundary never becomes an `outside_assigned_area` finding. It returns `unable_to_determine`. Quality results and warnings are supervisor review signals only; they do not automatically identify fraud, reject work, change reputation or alter payable eligibility.

The basemap is presentation only. Survey/attendance/follow-up coordinates and geographic quality remain FieldLance/Supabase data and are not made public project data.

## Basemap/provider

The UI loads pinned MapLibre GL JS `6.11.2` in the browser and uses the OpenFreeMap Liberty style. This keeps the app free of a Google Maps API key and keeps the database/provider boundary clean. A future self-hosted MapLibre tile source can replace the basemap URL without changing the operational evidence schema.

## Database

Migration:

```text
20261013000440_field_operations_map_geographic_quality.sql
```

New table:

```text
geography_boundaries
```

Existing `beneficiary_case_followups` receives optional explicit visit-location fields. Existing `survey_responses.answers` GPS objects and `assignment_session_locations` remain the authoritative source for survey and attendance evidence.
