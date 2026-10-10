import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ExternalLink, Filter, Layers3, ListChecks, LocateFixed, MapPinned, RefreshCw, ShieldCheck } from "lucide-react";
import { rpc } from "../../lib/supabase/client";
import type { FieldMapViewStore } from "./fieldMapViewState";
import type { Geo } from "../geography/model";
import { geographyPath } from "../geography/model";
import { reportDiagnostic, userFacingError } from "../../lib/observability";
import { Alert, BottomSheet, Button, Card, Field, FilterBar, MetricCard, Select, StatusBadge } from "../../components/ui/FieldLanceUI";
import styles from "./FieldOperationsMap.module.css";

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
  unable_to_determine: "Boundary unable to determine",
};
const defaultLayers: Record<Layer, boolean> = { survey: true, attendance_check_in: true, attendance_check_out: true, case_follow_up: true };

function mapPalette() {
  const root = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => root.getPropertyValue(name).trim() || fallback;
  return {
    survey: token("--fl-primary", "#1d4ed8"),
    attendance_check_in: token("--fl-operational", "#0f766e"),
    attendance_check_out: token("--fl-neutral", "#475569"),
    case_follow_up: token("--fl-warning", "#b45309"),
    boundary: token("--fl-operational", "#0f766e"),
    cluster: token("--fl-text", "#132238"),
    surface: token("--fl-surface", "#ffffff"),
  } satisfies Record<Layer | "boundary" | "cluster" | "surface", string>;
}

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function dateOffset(days: number) { const d = new Date(); d.setDate(d.getDate() + days); return isoDate(d); }
function human(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase()); }
function pathLabel(id: string, rows: Geo[]) { return geographyPath(id, rows).map(item => item.name).join(" / "); }
function sourceActionLabel(row: FieldMapEvidence) {
  if (row.source_kind === "response") return "Open survey response";
  if (row.source_kind === "attendance") return "Open attendance assignment";
  return "Open beneficiary case";
}
function qualityTone(value: Quality): "success" | "warning" | "danger" | "neutral" {
  if (value === "within_assigned_area") return "success";
  if (value === "outside_assigned_area") return "danger";
  if (value === "poor_accuracy") return "warning";
  return "neutral";
}
function filterCount(values: { from: string; to: string; worker: string; geo: string; status: string; quality: string; reviewOnly: boolean; layers: Record<Layer, boolean> }) {
  const customDateRange = values.from !== dateOffset(-30) || values.to !== dateOffset(0);
  return [values.worker, values.geo, values.status, values.quality].filter(Boolean).length
    + (customDateRange ? 1 : 0)
    + (values.reviewOnly ? 1 : 0)
    + (Object.values(values.layers).every(Boolean) ? 0 : 1);
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
  const root = document.createElement("div"); root.className = styles.popup;
  const title = document.createElement("strong"); title.textContent = row.source_label; root.appendChild(title);
  for (const value of [row.worker_name, row.project_title, row.geography_name || "No structured area", new Date(row.captured_at).toLocaleString(), qualityLabels[row.quality]]) {
    const p = document.createElement("p"); p.textContent = value; root.appendChild(p);
  }
  if (row.accuracy_m != null) { const p = document.createElement("p"); p.textContent = `GPS accuracy: ${Math.round(row.accuracy_m)} m`; root.appendChild(p); }
  if (row.warning_codes.length) { const p = document.createElement("p"); p.textContent = `Review signals: ${row.warning_codes.map(human).join(", ")}`; root.appendChild(p); }
  if (onOpenSource && row.source_openable) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = styles.popupAction;
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

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className={styles.detailRow}><dt>{label}</dt><dd>{children}</dd></div>;
}

function EvidenceDetail({ row, onOpenSource }: { row: FieldMapEvidence | null; onOpenSource?: (row: FieldMapEvidence) => void }) {
  if (!row) return <div className={styles.detailEmpty}><MapPinned size={24} aria-hidden="true"/><strong>Select field evidence</strong><p>Choose a marker or record to inspect its authorized operational context.</p></div>;
  return <div className={styles.detailContent}>
    <div className={styles.detailHeading}>
      <div><span className="fl-eyebrow">SELECTED EVIDENCE</span><h3>{row.source_label}</h3><p>{layerLabels[row.layer]}</p></div>
      <StatusBadge tone={qualityTone(row.quality)}>{qualityLabels[row.quality]}</StatusBadge>
    </div>
    <dl className={styles.detailList}>
      <DetailRow label="Field worker">{row.worker_name || row.worker_id}</DetailRow>
      <DetailRow label="Project">{row.project_title}</DetailRow>
      <DetailRow label="Captured">{new Date(row.captured_at).toLocaleString()}</DetailRow>
      <DetailRow label="Area">{row.geography_name || "No structured area"}</DetailRow>
      <DetailRow label="Status">{human(row.status)}</DetailRow>
      <DetailRow label="GPS accuracy">{row.accuracy_m == null ? "Not available" : `${Math.round(row.accuracy_m)} m`}</DetailRow>
      {row.latitude != null && row.longitude != null && <DetailRow label="Coordinates">{row.latitude.toFixed(5)}, {row.longitude.toFixed(5)}</DetailRow>}
    </dl>
    <div className={styles.reviewSignals}>
      <strong>Review signals</strong>
      <div>{row.warning_codes.length ? row.warning_codes.map(code => <StatusBadge tone="warning" key={code}>{human(code)}</StatusBadge>) : <StatusBadge tone={row.review_required ? "warning" : "success"}>{row.review_required ? "Review recommended" : "No additional signal"}</StatusBadge>}</div>
      <p>Signals support operational review and are not fraud findings.</p>
    </div>
    {row.note && <div className={styles.note}><strong>Evidence note</strong><p>{row.note}</p></div>}
    {onOpenSource && <div className={styles.detailAction}>{row.source_openable ? <Button variant="primary" onClick={() => onOpenSource(row)}><ExternalLink size={16} aria-hidden="true"/>{sourceActionLabel(row)}</Button> : <StatusBadge tone="neutral">Source not currently openable</StatusBadge>}</div>}
  </div>;
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
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
  const [layers, setLayers] = useState<Record<Layer, boolean>>(initialView.current?.layers || defaultLayers);

  function rememberView(selection = selectedEvidenceId) {
    viewStateStore?.set(viewStateKey, { from, to, worker, geo, status, quality, reviewOnly, layers: { ...layers }, loadedPages, selectedEvidenceId: selection });
  }
  function openSource(row: FieldMapEvidence) {
    rememberView(row.id);
    setSelectedEvidenceId(row.id);
    onOpenSource?.(row);
  }
  function selectEvidence(row: FieldMapEvidence, revealMobile = true) {
    setSelectedEvidenceId(row.id);
    if (revealMobile && window.matchMedia("(max-width: 639px)").matches) setMobileDetailOpen(true);
    const map = mapRef.current;
    if (map && row.longitude != null && row.latitude != null) {
      try { map.easeTo({ center: [row.longitude, row.latitude], zoom: Math.max(map.getZoom?.() || 4, 14), duration: 300 }); } catch { /* list/detail remains authoritative */ }
    }
  }
  function clearFilters() {
    setFrom(dateOffset(-30)); setTo(dateOffset(0)); setWorker(""); setGeo(""); setStatus(""); setQuality(""); setReviewOnly(false); setLayers({ ...defaultLayers });
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
      reportDiagnostic("map", cause, { operation: "load_evidence", online: navigator.onLine });
      if (requestRef.current === token) setError(userFacingError(cause, "Field evidence could not be loaded. Refresh to try again."));
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
    setRows([]); setBoundaries([]); setData(null); setLoadedPages(1); setLoading(true); setLoadingMore(false);
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
    setMapReady(false); setMapError("");
    void ensureMapLibre().then(lib => {
      if (!active || !containerRef.current) return;
      libRef.current = lib;
      const palette = mapPalette();
      const map = new lib.Map({ container: containerRef.current, style: BASEMAP_STYLE, center: [69.3451, 30.3753], zoom: 4.2, attributionControl: true });
      mapRef.current = map;
      map.addControl(new lib.NavigationControl({ visualizePitch: true }), "top-right");
      map.addControl(new lib.ScaleControl({ unit: "metric" }), "bottom-left");
      map.on("error", (event: { error?: Error }) => { if (event.error) setMapError(event.error.message); });
      map.on("load", () => {
        if (!active) return;
        map.addSource("fieldlance-boundaries", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "fieldlance-boundary-fill", type: "fill", source: "fieldlance-boundaries", paint: { "fill-color": palette.boundary, "fill-opacity": 0.07 } });
        map.addLayer({ id: "fieldlance-boundary-line", type: "line", source: "fieldlance-boundaries", paint: { "line-color": palette.boundary, "line-width": 2, "line-dasharray": [2, 1] } });
        map.addSource("fieldlance-evidence", { type: "geojson", data: { type: "FeatureCollection", features: [] }, cluster: true, clusterRadius: 46, clusterMaxZoom: 13 });
        map.addLayer({ id: "fieldlance-clusters", type: "circle", source: "fieldlance-evidence", filter: ["has", "point_count"], paint: { "circle-color": palette.cluster, "circle-radius": ["step", ["get", "point_count"], 17, 25, 22, 100, 28], "circle-opacity": 0.86 } });
        map.addLayer({ id: "fieldlance-cluster-count", type: "symbol", source: "fieldlance-evidence", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 }, paint: { "text-color": palette.surface } });
        map.addLayer({ id: "fieldlance-points", type: "circle", source: "fieldlance-evidence", filter: ["!", ["has", "point_count"]], paint: { "circle-radius": ["case", ["==", ["get", "evidence_id"], selectedEvidenceId || ""], 10, 7], "circle-stroke-width": ["case", ["==", ["get", "evidence_id"], selectedEvidenceId || ""], 4, 2], "circle-stroke-color": palette.surface, "circle-color": ["match", ["get", "layer"], "survey", palette.survey, "attendance_check_in", palette.attendance_check_in, "attendance_check_out", palette.attendance_check_out, "case_follow_up", palette.case_follow_up, palette.cluster] } });
        map.on("click", "fieldlance-points", (event: any) => {
          const feature = event.features?.[0]; if (!feature) return;
          const row = rowsRef.current.find(item => item.id === feature.properties?.evidence_id); if (!row) return;
          selectEvidence(row);
          new lib.Popup({ closeButton: true, maxWidth: "320px" }).setLngLat(feature.geometry.coordinates).setDOMContent(popupNode(row, value => openSourceRef.current?.(value))).addTo(map);
        });
        map.on("click", "fieldlance-clusters", async (event: any) => {
          const feature = event.features?.[0]; const clusterId = feature?.properties?.cluster_id; const source = map.getSource("fieldlance-evidence");
          if (clusterId == null || !source?.getClusterExpansionZoom) return;
          try { const zoom = await source.getClusterExpansionZoom(clusterId); map.easeTo({ center: feature.geometry.coordinates, zoom }); } catch { /* evidence list remains authoritative */ }
        });
        map.on("error", (event: any) => setMapError(event?.error?.message || "Map tiles or style are currently unavailable."));
        map.on("mouseenter", "fieldlance-points", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "fieldlance-points", () => { map.getCanvas().style.cursor = ""; });
        setMapReady(true);
      });
    }).catch(cause => {
      reportDiagnostic("map", cause, { operation: "renderer_load", online: navigator.onLine });
      setMapError(userFacingError(cause, "The interactive map renderer could not load."));
    });
    return () => { active = false; const map = mapRef.current; mapRef.current = null; libRef.current = null; if (map) map.remove(); };
  }, [mapAttempt]);

  const plottedRows = useMemo(() => rows.filter(row => row.latitude != null && row.longitude != null), [rows]);
  useEffect(() => {
    const map = mapRef.current, lib = libRef.current; if (!map || !lib || !mapReady || !map.isStyleLoaded?.()) return;
    const evidence = { type: "FeatureCollection", features: plottedRows.map(row => ({ type: "Feature", geometry: { type: "Point", coordinates: [row.longitude, row.latitude] }, properties: { evidence_id: row.id, layer: row.layer, quality: row.quality } })) };
    const boundaryFeatures = { type: "FeatureCollection", features: boundaries.map(boundary => ({ type: "Feature", geometry: boundary.geometry, properties: { geography_id: boundary.geography_id, name: boundary.name, kind: boundary.kind } })) };
    map.getSource("fieldlance-evidence")?.setData(evidence); map.getSource("fieldlance-boundaries")?.setData(boundaryFeatures);
    const bounds = new lib.LngLatBounds(); let count = 0;
    for (const row of plottedRows) { bounds.extend([row.longitude, row.latitude]); count++; }
    for (const boundary of boundaries) { const geometry = boundary.geometry as { coordinates?: unknown }; if (geometry.coordinates) { addCoordinatesToBounds(bounds, geometry.coordinates); count++; } }
    if (count && !selectedEvidenceId) map.fitBounds(bounds, { padding: 44, maxZoom: 14, duration: 350 });
  }, [boundaries, plottedRows, mapReady, selectedEvidenceId]);

  useEffect(() => {
    const map = mapRef.current; if (!map || !mapReady || !map.getLayer?.("fieldlance-points")) return;
    try {
      map.setPaintProperty("fieldlance-points", "circle-radius", ["case", ["==", ["get", "evidence_id"], selectedEvidenceId || ""], 10, 7]);
      map.setPaintProperty("fieldlance-points", "circle-stroke-width", ["case", ["==", ["get", "evidence_id"], selectedEvidenceId || ""], 4, 2]);
    } catch { /* detail/list selected state remains authoritative */ }
  }, [selectedEvidenceId, mapReady]);

  const matchedTotal = data?.summary.matched_total || 0;
  const hasMore = Boolean(data?.pagination.has_more && data.pagination.next_cursor);
  const partial = rows.length < matchedTotal;
  const facetGeographies = data?.facets.geographies || [];
  const selectedEvidence = rows.find(row => row.id === selectedEvidenceId) || null;
  const activeFilterCount = filterCount({ from, to, worker, geo, status, quality, reviewOnly, layers });
  const plottableTotal = data?.summary.plottable || 0;
  const locationIssues = (data?.summary.poor_accuracy || 0) + (data?.summary.location_unavailable || 0) + (data?.summary.unable_to_determine || 0);

  const filters = <>
    <Field label="From"><input className="fl-control" type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}/></Field>
    <Field label="To"><input className="fl-control" type="date" value={to} min={from} max={isoDate(new Date())} onChange={e => setTo(e.target.value)}/></Field>
    {projectId && (data?.facets.workers.length || 0) > 1 && <Select label="Field Worker" value={worker} onChange={e => setWorker(e.target.value)}><option value="">All authorized workers</option>{data?.facets.workers.map(item => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</Select>}
    <Select label="Area" value={geo} onChange={e => setGeo(e.target.value)}><option value="">All authorized areas</option>{facetGeographies.map(item => <option key={item.id} value={item.id}>{pathLabel(item.id, geographies) || item.name}</option>)}</Select>
    <Select label="Status" value={status} onChange={e => setStatus(e.target.value)}><option value="">All states</option>{(data?.facets.statuses || []).map(item => <option key={item} value={item}>{human(item)}</option>)}</Select>
    <Select label="Quality" value={quality} onChange={e => setQuality(e.target.value)}><option value="">All quality states</option>{Object.entries(qualityLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</Select>
  </>;

  const layersControl = <fieldset className={styles.layerFieldset}><legend><Layers3 size={16} aria-hidden="true"/> Evidence layers</legend><div>{(Object.keys(layerLabels) as Layer[]).map(key => <label key={key}><input type="checkbox" checked={layers[key]} onChange={e => setLayers(current => ({ ...current, [key]: e.target.checked }))}/><span className={`${styles.layerMarker} ${styles[`layer_${key}`]}`} aria-hidden="true"/>{layerLabels[key]}</label>)}</div><label className={styles.reviewOnly}><input type="checkbox" checked={reviewOnly} onChange={e => setReviewOnly(e.target.checked)}/><ListChecks size={16} aria-hidden="true"/> Needs review only</label></fieldset>;

  return <section className={styles.workspace} aria-label={projectId ? "Project field operations map" : "My field map"}>
    <header className={styles.header}>
      <div><span className="fl-eyebrow">{projectId ? "PROJECT FIELD OPERATIONS" : "MY FIELD EVIDENCE"}</span><h2><MapPinned size={24} aria-hidden="true"/> {projectId ? "Field Operations Map" : "My Field Map"}</h2><p>Review permission-scoped survey, attendance and visit evidence. FieldLance maps explicit captured evidence only and does not continuously track workers in the background.</p></div>
      <StatusBadge tone="success"><ShieldCheck size={15} aria-hidden="true"/> Permission scoped</StatusBadge>
    </header>

    <section className={styles.summary} aria-label="Field map operational summary">
      <MetricCard label="Matching evidence" value={matchedTotal.toLocaleString()} detail="Full authorized filtered result"/>
      <MetricCard label="Needs review" value={(data?.summary.needs_review || 0).toLocaleString()} detail="Operational review signals"/>
      <MetricCard label="Outside area" value={(data?.summary.outside_assigned_area || 0).toLocaleString()} detail="Review signal, not a fraud finding"/>
      <MetricCard label="GPS / location issues" value={locationIssues.toLocaleString()} detail="Accuracy, unavailable or boundary unknown"/>
    </section>

    <div className={styles.desktopFilters}>
      <FilterBar actions={<div className={styles.filterActions}><Button variant="tertiary" onClick={clearFilters} disabled={!activeFilterCount}>Clear filters</Button><Button variant="secondary" disabled={loading || loadingMore} onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} aria-hidden="true"/>{loading ? "Loading…" : "Refresh"}</Button></div>}>{filters}</FilterBar>
      {layersControl}
    </div>
    <div className={styles.mobileFilterBar}>
      <Button variant="secondary" aria-haspopup="dialog" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(true)}><Filter size={17} aria-hidden="true"/> Filters {activeFilterCount > 0 && <span className={styles.filterCount}>{activeFilterCount}</span>}</Button>
      <Button variant="secondary" disabled={loading || loadingMore} onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} aria-hidden="true"/> Refresh</Button>
    </div>

    <BottomSheet open={filtersOpen} title="Field map filters" onClose={() => setFiltersOpen(false)} className={styles.filtersSheet}>
      <div className={styles.sheetFilters}>{filters}{layersControl}<div className={styles.sheetActions}><Button variant="tertiary" onClick={clearFilters} disabled={!activeFilterCount}>Clear filters</Button><Button variant="primary" onClick={() => setFiltersOpen(false)}>Show evidence</Button></div></div>
    </BottomSheet>

    {error && <Alert title="Field evidence could not be loaded" tone="danger">{error}</Alert>}
    {mapError && <Alert title="Map renderer unavailable" tone="warning" action={<Button variant="tertiary" onClick={() => setMapAttempt(value => value + 1)}>Retry renderer</Button>}>{mapError} The authorized evidence list remains available.</Alert>}

    <div className={styles.completeness} role="status">
      <div><strong>{rows.length.toLocaleString()}</strong><span> evidence records loaded</span></div>
      <div><strong>{plottedRows.length.toLocaleString()}</strong><span> loaded records plottable</span></div>
      <div><strong>{matchedTotal.toLocaleString()}</strong><span> matching evidence overall</span></div>
      {partial
        ? <p><AlertTriangle size={16} aria-hidden="true"/> Loaded {rows.length.toLocaleString()} of {matchedTotal.toLocaleString()} matching evidence records; {plottedRows.length.toLocaleString()} loaded records are plottable ({plottableTotal.toLocaleString()} plottable overall). Summary totals cover the full authorized filtered result.</p>
        : <p><ShieldCheck size={16} aria-hidden="true"/> All {matchedTotal.toLocaleString()} matching evidence records are loaded; {plottedRows.length.toLocaleString()} are plottable on the map.</p>}
    </div>

    <div className={styles.operationalGrid}>
      <div className={styles.mapColumn}>
        <div className={`${styles.mapWrap} ${mapError && !mapReady ? styles.rendererUnavailable : ""}`}>
          <div ref={containerRef} className={styles.mapCanvas} aria-label="Interactive field evidence map"/>
          {mapError && !mapReady && <div className={styles.mapFallback}><MapPinned size={30} aria-hidden="true"/><strong>Basemap unavailable</strong><span>Use the evidence records below. Evidence visibility and authorization do not depend on the map provider.</span></div>}
          <div className={styles.provider}>MapLibre · OpenFreeMap / OpenStreetMap</div>
        </div>
        <div className={styles.legend} aria-label="Evidence layer legend">{(Object.keys(layerLabels) as Layer[]).map(key => <span key={key}><i className={`${styles.layerMarker} ${styles[`layer_${key}`]}`} aria-hidden="true"/>{layerLabels[key]}</span>)}</div>
      </div>
      <Card className={styles.desktopDetail}><EvidenceDetail row={selectedEvidence} onOpenSource={onOpenSource ? openSource : undefined}/></Card>
    </div>

    {boundaries.length === 0 && rows.some(row => row.latitude != null) && <Alert title="Boundary unavailable" tone="info"><LocateFixed size={16} aria-hidden="true"/> No authoritative GeoJSON boundary is loaded for the visible assigned areas. GPS points remain visible; inside/outside status stays unable to determine instead of guessing.</Alert>}

    <section className={styles.records} aria-labelledby="field-map-records-title">
      <div className={styles.recordsHeader}><div><span className="fl-eyebrow">AUTHORIZED FIELD EVIDENCE</span><h3 id="field-map-records-title">Evidence records</h3><p>Select a record to synchronize the operational detail with the map. Review signals are prompts for review, not fraud findings.</p></div><StatusBadge tone="neutral">{rows.length.toLocaleString()} loaded</StatusBadge></div>
      {!rows.length && loading && <div className={styles.emptyState} role="status">Loading authorized field evidence…</div>}
      {!rows.length && !loading && <div className={styles.emptyState}>No authorized evidence matches the current filters.</div>}
      <div className={styles.evidenceList} role="list">
        {rows.map(row => <article key={row.id} className={styles.evidenceRow} data-selected={row.id === selectedEvidenceId ? "true" : undefined} role="listitem">
          <button type="button" className={styles.evidenceSelect} aria-pressed={row.id === selectedEvidenceId} onClick={() => selectEvidence(row)}>
            <span className={`${styles.layerMarker} ${styles[`layer_${row.layer}`]}`} aria-hidden="true"/>
            <span className={styles.evidenceIdentity}><strong>{row.source_label}</strong><span>{row.worker_name} · {new Date(row.captured_at).toLocaleString()}</span><span>{row.geography_name || "No structured area"} · {row.accuracy_m == null ? "GPS accuracy unavailable" : `${Math.round(row.accuracy_m)} m GPS`}</span></span>
            <span className={styles.evidenceStatus}><StatusBadge tone={qualityTone(row.quality)}>{qualityLabels[row.quality]}</StatusBadge>{row.warning_codes.length > 0 && <StatusBadge tone="warning">{row.warning_codes.length} review {row.warning_codes.length === 1 ? "signal" : "signals"}</StatusBadge>}</span>
          </button>
          {onOpenSource && row.source_openable && <Button variant="tertiary" className={styles.sourceAction} onClick={() => openSource(row)}><ExternalLink size={15} aria-hidden="true"/>{sourceActionLabel(row)}</Button>}
        </article>)}
      </div>
      {hasMore && <div className={styles.loadMore}><Button variant="secondary" disabled={loading || loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading more…" : `Load more evidence (${rows.length.toLocaleString()} of ${matchedTotal.toLocaleString()})`}</Button></div>}
      {!hasMore && rows.length > 0 && <p className={styles.endState}>End of authorized matching evidence.</p>}
    </section>

    <BottomSheet open={mobileDetailOpen && Boolean(selectedEvidence)} title="Selected field evidence" onClose={() => setMobileDetailOpen(false)} className={styles.detailSheet}>
      <EvidenceDetail row={selectedEvidence} onOpenSource={onOpenSource ? openSource : undefined}/>
    </BottomSheet>
  </section>;
}
