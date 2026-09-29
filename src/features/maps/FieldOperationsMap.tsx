import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, Layers3, ListChecks, LocateFixed, MapPinned, RefreshCw, ShieldCheck } from "lucide-react";
import { rpc } from "../../lib/supabase/client";
import type { FieldMapViewStore } from "./fieldMapViewState";
import type { Geo } from "../geography/model";
import { geographyPath } from "../geography/model";

type Quality = "within_assigned_area" | "outside_assigned_area" | "poor_accuracy" | "location_unavailable" | "unable_to_determine";
type Layer = "survey" | "attendance_check_in" | "attendance_check_out" | "case_follow_up";
type SourceKind = "response" | "attendance" | "case";
export type FieldMapEvidence = {
  id: string;
  layer: Layer;
  source_id: string;
  source_kind: SourceKind;
  source_context_id: string;
  source_openable: boolean;
  source_label: string;
  project_id: string;
  project_title: string;
  organization_id: string;
  worker_id: string;
  worker_name: string;
  geography_id: string | null;
  geography_name: string | null;
  status: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  captured_at: string;
  received_at: string;
  note: string | null;
  quality: Quality;
  warning_codes: string[];
  review_required: boolean;
};
type Boundary = { geography_id: string; name: string; kind: string; geometry: Record<string, unknown>; source_note: string; source_version: string; updated_at: string };
type Cursor = { captured_at: string; id: string };
type MapPayload = {
  scope: { project_id: string | null; role: string; from: string; to: string; personal: boolean };
  rows: FieldMapEvidence[];
  boundaries: Boundary[];
  summary: {
    matched_total: number;
    returned_count: number;
    plottable: number;
    within_assigned_area: number;
    outside_assigned_area: number;
    poor_accuracy: number;
    location_unavailable: number;
    unable_to_determine: number;
    needs_review: number;
  };
  pagination: { page_size: number; returned: number; has_more: boolean; next_cursor: Cursor | null };
  facets: {
    workers: { id: string; name: string }[];
    geographies: { id: string; name: string }[];
    statuses: string[];
  };
  generated_at: string;
};

type MapLibreGlobal = {
  Map: new (options: Record<string, unknown>) => any;
  NavigationControl: new (options?: Record<string, unknown>) => any;
  ScaleControl: new (options?: Record<string, unknown>) => any;
  Popup: new (options?: Record<string, unknown>) => any;
  LngLatBounds: new () => any;
};

const MAPLIBRE_VERSION = "6.11.2";
const MAPLIBRE_MODULE = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.mjs`;
const MAPLIBRE_CSS = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;
const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const PAGE_SIZE = 200;
const mapRpc = rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<unknown>;
const layerLabels: Record<Layer, string> = { survey: "Survey points", attendance_check_in: "Check-ins", attendance_check_out: "Check-outs", case_follow_up: "Case follow-ups" };
const qualityLabels: Record<Quality, string> = {
  within_assigned_area: "Within assigned area",
  outside_assigned_area: "Outside assigned area",
  poor_accuracy: "Poor GPS accuracy",
  location_unavailable: "Location unavailable",
  unable_to_determine: "Boundary unavailable",
};
const layerColors: Record<Layer, string> = { survey: "#2563eb", attendance_check_in: "#059669", attendance_check_out: "#7c3aed", case_follow_up: "#d97706" };

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function dateOffset(days: number) { const d = new Date(); d.setDate(d.getDate() + days); return isoDate(d); }
function human(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase()); }
function pathLabel(id: string, rows: Geo[]) { return geographyPath(id, rows).map(item => item.name).join(" / "); }
function sourceActionLabel(row: FieldMapEvidence) {
  if (row.source_kind === "response") return "Open survey response";
  if (row.source_kind === "attendance") return "Open attendance assignment";
  return "Open beneficiary case";
}

let mapLibrePromise: Promise<MapLibreGlobal> | null = null;
function ensureMapLibre() {
  if (mapLibrePromise) return mapLibrePromise;
  if (!document.querySelector(`link[data-fieldlance-maplibre="${MAPLIBRE_VERSION}"]`)) {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = MAPLIBRE_CSS;
    css.dataset.fieldlanceMaplibre = MAPLIBRE_VERSION;
    document.head.appendChild(css);
  }
  mapLibrePromise = import(/* @vite-ignore */ MAPLIBRE_MODULE)
    .then(module => module as unknown as MapLibreGlobal)
    .catch(error => { mapLibrePromise = null; throw error; });
  return mapLibrePromise;
}

function addCoordinatesToBounds(bounds: any, value: unknown) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") { bounds.extend([value[0], value[1]]); return; }
  for (const child of value) addCoordinatesToBounds(bounds, child);
}

function popupNode(row: FieldMapEvidence, onOpenSource?: (row: FieldMapEvidence) => void) {
  const root = document.createElement("div"); root.className = "field-map-popup";
  const title = document.createElement("strong"); title.textContent = row.source_label; root.appendChild(title);
  for (const value of [row.worker_name, row.project_title, row.geography_name || "No structured area", new Date(row.captured_at).toLocaleString(), qualityLabels[row.quality]]) {
    const p = document.createElement("p"); p.textContent = value; root.appendChild(p);
  }
  if (row.accuracy_m != null) { const p = document.createElement("p"); p.textContent = `GPS accuracy: ${Math.round(row.accuracy_m)} m`; root.appendChild(p); }
  if (row.warning_codes.length) { const p = document.createElement("p"); p.textContent = `Review: ${row.warning_codes.map(human).join(", ")}`; root.appendChild(p); }
  if (onOpenSource && row.source_openable) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "field-map-popup-action";
    button.textContent = sourceActionLabel(row);
    button.addEventListener("click", () => onOpenSource(row));
    root.appendChild(button);
  }
  return root;
}

function mergeBoundaries(current: Boundary[], incoming: Boundary[]) {
  const merged = new Map(current.map(item => [item.geography_id, item]));
  for (const item of incoming) merged.set(item.geography_id, item);
  return [...merged.values()];
}

export function FieldOperationsMap({
  projectId = null,
  geographies,
  onOpenSource,
  viewStateStore,
  viewStateKey = "map",
}: {
  projectId?: string | null;
  geographies: Geo[];
  viewStateStore?: FieldMapViewStore;
  viewStateKey?: string;
  onOpenSource?: (row: FieldMapEvidence) => void;
}) {
  const initialView = useRef(viewStateStore?.get(viewStateKey));
  const firstFilterKey = useRef<string | null>(null);
  const [loadedPages, setLoadedPages] = useState(initialView.current?.loadedPages || 1);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(initialView.current?.selectedEvidenceId || null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const libRef = useRef<MapLibreGlobal | null>(null);
  const rowsRef = useRef<FieldMapEvidence[]>([]);
  const openSourceRef = useRef(onOpenSource);
  const requestRef = useRef(0);
  const [mapReady, setMapReady] = useState(false);
  const [mapAttempt, setMapAttempt] = useState(0);
  const [rows, setRows] = useState<FieldMapEvidence[]>([]);
  const [boundaries, setBoundaries] = useState<Boundary[]>([]);
  const [data, setData] = useState<MapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [mapError, setMapError] = useState("");
  const [from, setFrom] = useState(initialView.current?.from ?? dateOffset(-30));
  const [to, setTo] = useState(initialView.current?.to ?? dateOffset(0));
  const [worker, setWorker] = useState(initialView.current?.worker ?? "");
  const [geo, setGeo] = useState(initialView.current?.geo ?? "");
  const [status, setStatus] = useState(initialView.current?.status ?? "");
  const [quality, setQuality] = useState(initialView.current?.quality ?? "");
  const [reviewOnly, setReviewOnly] = useState(initialView.current?.reviewOnly ?? false);
  const [revision, setRevision] = useState(0);
  const [layers, setLayers] = useState<Record<Layer, boolean>>(initialView.current?.layers || { survey: true, attendance_check_in: true, attendance_check_out: true, case_follow_up: true });

  function rememberView(selection = selectedEvidenceId) {
    viewStateStore?.set(viewStateKey, { from, to, worker, geo, status, quality, reviewOnly, layers: { ...layers }, loadedPages, selectedEvidenceId: selection });
  }
  function openSource(row: FieldMapEvidence) {
    rememberView(row.id);
    setSelectedEvidenceId(row.id);
    onOpenSource?.(row);
  }
  useEffect(() => { rememberView(); }, [from, to, worker, geo, status, quality, reviewOnly, layers, loadedPages, selectedEvidenceId, viewStateKey, viewStateStore]);
  useEffect(() => { openSourceRef.current = openSource; });

  const activeLayers = useMemo(() => (Object.keys(layerLabels) as Layer[]).filter(key => layers[key]), [layers]);
  const filterKey = `${projectId || "personal"}|${from}|${to}|${worker}|${geo}|${status}|${quality}|${reviewOnly}|${activeLayers.join(",")}|${revision}`;

  async function fetchPage(cursor: Cursor | null, append: boolean, token: number) {
    setError("");
    try {
      const result = await mapRpc("field_operations_map_page", {
        p_project: projectId,
        p_from: from,
        p_to: to,
        p_worker: worker || null,
        p_geography: geo || null,
        p_status: status || null,
        p_quality: quality || null,
        p_layers: activeLayers,
        p_review_only: reviewOnly,
        p_cursor_at: cursor?.captured_at || null,
        p_cursor_id: cursor?.id || null,
        p_page_size: PAGE_SIZE,
      }) as MapPayload;
      if (requestRef.current !== token) return null;
      setData(result);
      setRows(current => {
        if (!append) return result.rows;
        const merged = new Map(current.map(item => [item.id, item]));
        for (const item of result.rows) merged.set(item.id, item);
        return [...merged.values()].sort((a, b) => b.captured_at.localeCompare(a.captured_at) || b.id.localeCompare(a.id));
      });
      setBoundaries(current => append ? mergeBoundaries(current, result.boundaries) : result.boundaries);
      return result;
    } catch (cause) {
      if (requestRef.current === token) setError((cause as Error).message);
    }
    return null;
  }

  async function loadMore() {
    const cursor = data?.pagination.next_cursor;
    if (!cursor || loading || loadingMore) return;
    const token = requestRef.current;
    setLoadingMore(true);
    const result = await fetchPage(cursor, true, token);
    if (requestRef.current === token) {
      if (result) setLoadedPages(value => value + 1);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    const token = ++requestRef.current;
    if (firstFilterKey.current === null) firstFilterKey.current = filterKey;
    const restoring = firstFilterKey.current === filterKey;
    const pagesToRestore = restoring ? initialView.current?.loadedPages || 1 : 1;
    if (!restoring) { setSelectedEvidenceId(null); initialView.current = undefined; }
    setRows([]);
    setBoundaries([]);
    setData(null);
    setLoadedPages(1);
    setLoading(true);
    setLoadingMore(false);
    void (async () => {
      let cursor: Cursor | null = null;
      // Re-authorize every page on return; only filters/selection/page count survive navigation.
      for (let page = 0; page < pagesToRestore; page++) {
        const result = await fetchPage(cursor, page > 0, token);
        if (!result || requestRef.current !== token) break;
        setLoadedPages(page + 1);
        if (!result.pagination.has_more || !result.pagination.next_cursor) break;
        cursor = result.pagination.next_cursor;
      }
      if (requestRef.current === token) setLoading(false);
    })();
    return () => { if (requestRef.current === token) requestRef.current++; };
    // filterKey intentionally captures the complete server-side map filter contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => { rowsRef.current = rows; }, [rows]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let active = true;
    setMapReady(false);
    setMapError("");
    void ensureMapLibre().then(lib => {
      if (!active || !containerRef.current) return;
      libRef.current = lib;
      const map = new lib.Map({ container: containerRef.current, style: BASEMAP_STYLE, center: [69.3451, 30.3753], zoom: 4.2, attributionControl: true });
      mapRef.current = map;
      map.addControl(new lib.NavigationControl({ visualizePitch: true }), "top-right");
      map.addControl(new lib.ScaleControl({ unit: "metric" }), "bottom-left");
      map.on("error", (event: { error?: Error }) => { if (event.error) setMapError(event.error.message); });
      map.on("load", () => {
        if (!active) return;
        map.addSource("fieldlance-boundaries", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "fieldlance-boundary-fill", type: "fill", source: "fieldlance-boundaries", paint: { "fill-color": "#0f766e", "fill-opacity": 0.07 } });
        map.addLayer({ id: "fieldlance-boundary-line", type: "line", source: "fieldlance-boundaries", paint: { "line-color": "#0f766e", "line-width": 2, "line-dasharray": [2, 1] } });
        map.addSource("fieldlance-evidence", { type: "geojson", data: { type: "FeatureCollection", features: [] }, cluster: true, clusterRadius: 46, clusterMaxZoom: 13 });
        map.addLayer({ id: "fieldlance-clusters", type: "circle", source: "fieldlance-evidence", filter: ["has", "point_count"], paint: { "circle-color": "#173b57", "circle-radius": ["step", ["get", "point_count"], 17, 25, 22, 100, 28], "circle-opacity": 0.86 } });
        map.addLayer({ id: "fieldlance-cluster-count", type: "symbol", source: "fieldlance-evidence", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 11 }, paint: { "text-color": "#ffffff" } });
        map.addLayer({ id: "fieldlance-points", type: "circle", source: "fieldlance-evidence", filter: ["!", ["has", "point_count"]], paint: { "circle-radius": 7, "circle-stroke-width": 2, "circle-stroke-color": "#ffffff", "circle-color": ["match", ["get", "layer"], "survey", layerColors.survey, "attendance_check_in", layerColors.attendance_check_in, "attendance_check_out", layerColors.attendance_check_out, "case_follow_up", layerColors.case_follow_up, "#334155"] } });
        map.on("click", "fieldlance-points", (event: any) => {
          const feature = event.features?.[0]; if (!feature) return;
          const row = rowsRef.current.find(item => item.id === feature.properties?.evidence_id); if (!row) return;
          setSelectedEvidenceId(row.id);
          new lib.Popup({ closeButton: true, maxWidth: "320px" }).setLngLat(feature.geometry.coordinates).setDOMContent(popupNode(row, value => openSourceRef.current?.(value))).addTo(map);
        });
        map.on("click", "fieldlance-clusters", async (event: any) => {
          const feature = event.features?.[0];
          const clusterId = feature?.properties?.cluster_id;
          const source = map.getSource("fieldlance-evidence");
          if (clusterId == null || !source?.getClusterExpansionZoom) return;
          try {
            const zoom = await source.getClusterExpansionZoom(clusterId);
            map.easeTo({ center: feature.geometry.coordinates, zoom });
          } catch { /* evidence list remains authoritative when renderer interactions fail */ }
        });
        map.on("error", (event: any) => {
          const message = event?.error?.message || "Map tiles or style are currently unavailable.";
          setMapError(message);
        });
        map.on("mouseenter", "fieldlance-points", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "fieldlance-points", () => { map.getCanvas().style.cursor = ""; });
        setMapReady(true);
      });
    }).catch(cause => setMapError((cause as Error).message));
    return () => { active = false; const map = mapRef.current; mapRef.current = null; libRef.current = null; if (map) map.remove(); };
  }, [mapAttempt]);

  const plottedRows = useMemo(() => rows.filter(row => row.latitude != null && row.longitude != null), [rows]);
  useEffect(() => {
    const map = mapRef.current, lib = libRef.current; if (!map || !lib || !mapReady || !map.isStyleLoaded?.()) return;
    const evidence = { type: "FeatureCollection", features: plottedRows.map(row => ({ type: "Feature", geometry: { type: "Point", coordinates: [row.longitude, row.latitude] }, properties: { evidence_id: row.id, layer: row.layer, quality: row.quality } })) };
    const boundaryFeatures = { type: "FeatureCollection", features: boundaries.map(boundary => ({ type: "Feature", geometry: boundary.geometry, properties: { geography_id: boundary.geography_id, name: boundary.name, kind: boundary.kind } })) };
    map.getSource("fieldlance-evidence")?.setData(evidence);
    map.getSource("fieldlance-boundaries")?.setData(boundaryFeatures);
    const bounds = new lib.LngLatBounds(); let count = 0;
    for (const row of plottedRows) { bounds.extend([row.longitude, row.latitude]); count++; }
    for (const boundary of boundaries) { const geometry = boundary.geometry as { coordinates?: unknown }; if (geometry.coordinates) { addCoordinatesToBounds(bounds, geometry.coordinates); count++; } }
    if (count) map.fitBounds(bounds, { padding: 44, maxZoom: 14, duration: 350 });
  }, [boundaries, plottedRows, mapReady]);

  const matchedTotal = data?.summary.matched_total || 0;
  const hasMore = Boolean(data?.pagination.has_more && data.pagination.next_cursor);
  const partial = rows.length < matchedTotal;
  const facetGeographies = data?.facets.geographies || [];

  return <section className="field-operations-map" aria-label={projectId ? "Project field operations map" : "My field map"}>
    <header className="field-map-hero">
      <div><span className="eyebrow">{projectId ? "PROJECT FIELD OPERATIONS" : "MY FIELD EVIDENCE"}</span><h2><MapPinned size={22}/> {projectId ? "Field Operations Map" : "My Field Map"}</h2><p>Maps explicit survey, attendance and visit evidence only. FieldLance does not continuously track workers in the background.</p></div>
      <div className="field-map-privacy"><ShieldCheck size={18}/><span>Private, permission-scoped evidence</span></div>
    </header>

    <section className="field-map-filters" aria-label="Map filters">
      <label>From<input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}/></label>
      <label>To<input type="date" value={to} min={from} max={isoDate(new Date())} onChange={e => setTo(e.target.value)}/></label>
      {projectId && (data?.facets.workers.length || 0) > 1 && <label>Field Worker<select value={worker} onChange={e => setWorker(e.target.value)}><option value="">All authorized workers</option>{data?.facets.workers.map(item => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</select></label>}
      <label>Area<select value={geo} onChange={e => setGeo(e.target.value)}><option value="">All authorized areas</option>{facetGeographies.map(item => <option key={item.id} value={item.id}>{pathLabel(item.id, geographies) || item.name}</option>)}</select></label>
      <label>Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="">All states</option>{(data?.facets.statuses || []).map(item => <option key={item} value={item}>{human(item)}</option>)}</select></label>
      <label>Quality<select value={quality} onChange={e => setQuality(e.target.value)}><option value="">All quality states</option>{Object.entries(qualityLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
      <button className="secondary field-map-refresh" disabled={loading || loadingMore} onClick={() => setRevision(value => value + 1)}><RefreshCw size={15}/>{loading ? "Loading…" : "Refresh"}</button>
    </section>

    <section className="field-map-layers" aria-label="Map layers"><span><Layers3 size={15}/> Layers</span>{(Object.keys(layerLabels) as Layer[]).map(key => <label key={key}><input type="checkbox" checked={layers[key]} onChange={e => setLayers(current => ({ ...current, [key]: e.target.checked }))}/><i style={{ background: layerColors[key] }}/>{layerLabels[key]}</label>)}<label className="field-map-review-toggle"><input type="checkbox" checked={reviewOnly} onChange={e => setReviewOnly(e.target.checked)}/><ListChecks size={14}/> Needs review only</label></section>

    {error && <p className="notice error" role="alert">{error}</p>}
    {mapError && <div className="notice warning field-map-runtime-warning" role="status"><span><AlertTriangle size={16}/>{mapError} The evidence list remains available even when the basemap cannot load.</span><button type="button" className="link" onClick={() => setMapAttempt(value => value + 1)}>Retry map renderer</button></div>}

    <div className="field-map-completeness" role="status">
      <div><strong>{matchedTotal.toLocaleString()}</strong><span> matching evidence</span></div>
      <div><strong>{rows.length.toLocaleString()}</strong><span> currently loaded</span></div>
      {partial ? <p><AlertTriangle size={15}/> Partial map view: totals use the full authorized filtered dataset; markers/list currently show {rows.length.toLocaleString()} of {matchedTotal.toLocaleString()} records.</p> : <p><ShieldCheck size={15}/> All matching evidence is loaded for the current filters.</p>}
    </div>

    <div className="field-map-stats">
      <article><span>Matching evidence</span><strong>{matchedTotal.toLocaleString()}</strong></article><article><span>Plottable</span><strong>{(data?.summary.plottable || 0).toLocaleString()}</strong></article>
      <article><span>Within area</span><strong>{(data?.summary.within_assigned_area || 0).toLocaleString()}</strong></article><article><span>Outside area</span><strong>{(data?.summary.outside_assigned_area || 0).toLocaleString()}</strong></article>
      <article><span>Poor accuracy</span><strong>{(data?.summary.poor_accuracy || 0).toLocaleString()}</strong></article><article><span>Location unavailable</span><strong>{(data?.summary.location_unavailable || 0).toLocaleString()}</strong></article><article><span>Boundary unknown</span><strong>{(data?.summary.unable_to_determine || 0).toLocaleString()}</strong></article><article><span>Needs review</span><strong>{(data?.summary.needs_review || 0).toLocaleString()}</strong></article>
    </div>

    <div className={`field-map-canvas-wrap ${mapError && !mapReady ? "renderer-unavailable" : ""}`}><div ref={containerRef} className="field-map-canvas"/>{mapError && !mapReady && <div className="field-map-canvas-fallback"><MapPinned size={28}/><strong>Basemap unavailable</strong><span>Use the evidence review list below; FieldLance evidence and authorization do not depend on the map provider.</span></div>}<div className="field-map-provider">MapLibre · OpenFreeMap / OpenStreetMap</div></div>

    {boundaries.length === 0 && rows.some(row => row.latitude != null) && <p className="notice"><LocateFixed size={16}/> No authoritative GeoJSON boundary is loaded for the visible assigned areas. GPS points remain visible, but inside/outside classification stays <strong>unable to determine</strong> instead of guessing.</p>}

    <section className="field-map-review">
      <div className="panel-title"><div><span className="eyebrow">EVIDENCE REVIEW</span><h3>Authorized field evidence</h3><p>Totals above cover the full filtered result. This accessible list mirrors the evidence currently loaded on the map and supports source navigation without treating review signals as fraud findings.</p></div></div>
      {!rows.length && !loading && <p className="empty-state">No authorized evidence matches the current filters.</p>}
      <div className="field-map-evidence-list" role="list">
        {rows.map(row => <article key={row.id} className="field-map-review-row" data-selected={row.id === selectedEvidenceId ? "true" : undefined} role="listitem">
          <div><strong>{row.source_label}</strong><p>{row.worker_name} · {row.project_title} · {new Date(row.captured_at).toLocaleString()}</p><p>{row.geography_name || "No structured area"} · {human(row.status)}{row.accuracy_m == null ? "" : ` · ${Math.round(row.accuracy_m)} m GPS`}</p></div>
          <div><span className={`field-map-quality ${row.quality}`}>{qualityLabels[row.quality]}</span>{row.warning_codes.map(code => <span className="field-map-warning" key={code}>{human(code)}</span>)}</div>
          {row.note && <p>{row.note}</p>}
          {onOpenSource && row.source_openable && <button type="button" className="secondary field-map-source-action" onClick={() => openSource(row)}><ExternalLink size={14}/>{sourceActionLabel(row)}</button>}
        </article>)}
      </div>
      {hasMore && <div className="field-map-load-more"><button type="button" className="secondary" disabled={loading || loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading more…" : `Load more evidence (${rows.length.toLocaleString()} of ${matchedTotal.toLocaleString()})`}</button></div>}
      {!hasMore && rows.length > 0 && <p className="field-map-end">End of authorized matching evidence.</p>}
    </section>
  </section>;
}
