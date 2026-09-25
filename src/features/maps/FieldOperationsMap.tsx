import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Layers3, LocateFixed, MapPinned, RefreshCw, ShieldCheck } from "lucide-react";
import { rpc } from "../../lib/supabase/client";
import type { Geo } from "../geography/model";
import { geographyPath } from "../geography/model";

type Quality = "within_assigned_area" | "outside_assigned_area" | "poor_accuracy" | "location_unavailable" | "unable_to_determine";
type Layer = "survey" | "attendance_check_in" | "attendance_check_out" | "case_follow_up";
type Evidence = {
  id: string; layer: Layer; source_id: string; source_label: string; project_id: string; project_title: string; organization_id: string;
  worker_id: string; worker_name: string; geography_id: string | null; geography_name: string | null; status: string;
  latitude: number | null; longitude: number | null; accuracy_m: number | null; captured_at: string; received_at: string; note: string | null;
  quality: Quality; warning_codes: string[];
};
type Boundary = { geography_id: string; name: string; kind: string; geometry: Record<string, unknown>; source_note: string; source_version: string; updated_at: string };
type MapPayload = {
  scope: { project_id: string | null; role: string; from: string; to: string; personal: boolean };
  rows: Evidence[]; boundaries: Boundary[];
  summary: Record<string, number>;
  workers: { id: string; name: string }[];
  geographies: { id: string; name: string }[];
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
const mapRpc = rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<unknown>;
const layerLabels: Record<Layer, string> = { survey: "Survey points", attendance_check_in: "Check-ins", attendance_check_out: "Check-outs", case_follow_up: "Case follow-ups" };
const qualityLabels: Record<Quality, string> = {
  within_assigned_area: "Within assigned area", outside_assigned_area: "Outside assigned area", poor_accuracy: "Poor GPS accuracy",
  location_unavailable: "Location unavailable", unable_to_determine: "Boundary unavailable",
};
const layerColors: Record<Layer, string> = { survey: "#2563eb", attendance_check_in: "#059669", attendance_check_out: "#7c3aed", case_follow_up: "#d97706" };

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function dateOffset(days: number) { const d = new Date(); d.setDate(d.getDate() + days); return isoDate(d); }
function human(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase()); }
function pathLabel(id: string, rows: Geo[]) { return geographyPath(id, rows).map(item => item.name).join(" / "); }

let mapLibrePromise: Promise<MapLibreGlobal> | null = null;
function ensureMapLibre() {
  if (mapLibrePromise) return mapLibrePromise;
  if (!document.querySelector(`link[data-fieldlance-maplibre="${MAPLIBRE_VERSION}"]`)) {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = MAPLIBRE_CSS; css.dataset.fieldlanceMaplibre = MAPLIBRE_VERSION; document.head.appendChild(css);
  }
  mapLibrePromise = import(/* @vite-ignore */ MAPLIBRE_MODULE).then(module => module as unknown as MapLibreGlobal);
  return mapLibrePromise;
}

function addCoordinatesToBounds(bounds: any, value: unknown) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") { bounds.extend([value[0], value[1]]); return; }
  for (const child of value) addCoordinatesToBounds(bounds, child);
}

function popupNode(row: Evidence) {
  const root = document.createElement("div"); root.className = "field-map-popup";
  const title = document.createElement("strong"); title.textContent = row.source_label; root.appendChild(title);
  for (const value of [row.worker_name, row.project_title, row.geography_name || "No structured area", new Date(row.captured_at).toLocaleString(), qualityLabels[row.quality]]) {
    const p = document.createElement("p"); p.textContent = value; root.appendChild(p);
  }
  if (row.accuracy_m != null) { const p = document.createElement("p"); p.textContent = `GPS accuracy: ${Math.round(row.accuracy_m)} m`; root.appendChild(p); }
  if (row.warning_codes.length) { const p = document.createElement("p"); p.textContent = `Review: ${row.warning_codes.map(human).join(", ")}`; root.appendChild(p); }
  return root;
}

export function FieldOperationsMap({ projectId = null, geographies }: { projectId?: string | null; geographies: Geo[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null), mapRef = useRef<any>(null), libRef = useRef<MapLibreGlobal | null>(null), rowsRef = useRef<Evidence[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [data, setData] = useState<MapPayload | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(""), [mapError, setMapError] = useState("");
  const [from, setFrom] = useState(dateOffset(-30)), [to, setTo] = useState(dateOffset(0)), [worker, setWorker] = useState(""), [geo, setGeo] = useState("");
  const [status, setStatus] = useState(""), [quality, setQuality] = useState(""), [revision, setRevision] = useState(0);
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ survey: true, attendance_check_in: true, attendance_check_out: true, case_follow_up: true });

  useEffect(() => {
    let live = true; setLoading(true); setError("");
    void mapRpc("field_operations_map", { p_project: projectId, p_from: from, p_to: to, p_worker: worker || null, p_geography: geo || null, p_limit: 2500 })
      .then(result => { if (live) setData(result as MapPayload); })
      .catch(cause => { if (live) setError((cause as Error).message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [projectId, from, to, worker, geo, revision]);

  const statuses = useMemo(() => [...new Set((data?.rows || []).map(row => row.status))].sort(), [data]);
  const visibleRows = useMemo(() => (data?.rows || []).filter(row => layers[row.layer] && (!status || row.status === status) && (!quality || row.quality === quality)), [data, layers, status, quality]);
  const plottedRows = useMemo(() => visibleRows.filter(row => row.latitude != null && row.longitude != null), [visibleRows]);
  useEffect(() => { rowsRef.current = visibleRows; }, [visibleRows]);
  const summary = useMemo(() => {
    const result: Record<string, number> = { total: visibleRows.length, plottable: plottedRows.length, warnings: 0 };
    for (const row of visibleRows) { result[row.quality] = (result[row.quality] || 0) + 1; if (row.quality !== "within_assigned_area" || row.warning_codes.length) result.warnings++; }
    return result;
  }, [visibleRows, plottedRows]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let active = true;
    void ensureMapLibre().then(lib => {
      if (!active || !containerRef.current) return;
      libRef.current = lib;
      const map = new lib.Map({ container: containerRef.current, style: BASEMAP_STYLE, center: [69.3451, 30.3753], zoom: 4.2, attributionControl: true });
      mapRef.current = map;
      map.addControl(new lib.NavigationControl({ visualizePitch: true }), "top-right");
      map.addControl(new lib.ScaleControl({ unit: "metric" }), "bottom-left");
      map.on("error", (event: { error?: Error }) => { if (event.error) setMapError(event.error.message); });
      map.on("load", () => {
        map.addSource("fieldlance-boundaries", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "fieldlance-boundary-fill", type: "fill", source: "fieldlance-boundaries", paint: { "fill-color": "#0f766e", "fill-opacity": 0.07 } });
        map.addLayer({ id: "fieldlance-boundary-line", type: "line", source: "fieldlance-boundaries", paint: { "line-color": "#0f766e", "line-width": 2, "line-dasharray": [2, 1] } });
        map.addSource("fieldlance-evidence", { type: "geojson", data: { type: "FeatureCollection", features: [] }, cluster: true, clusterRadius: 42, clusterMaxZoom: 13 });
        map.addLayer({ id: "fieldlance-clusters", type: "circle", source: "fieldlance-evidence", filter: ["has", "point_count"], paint: { "circle-color": "#173b57", "circle-radius": ["step", ["get", "point_count"], 17, 25, 22, 100, 28], "circle-opacity": 0.86 } });
        map.addLayer({ id: "fieldlance-cluster-count", type: "symbol", source: "fieldlance-evidence", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 11 }, paint: { "text-color": "#ffffff" } });
        map.addLayer({ id: "fieldlance-points", type: "circle", source: "fieldlance-evidence", filter: ["!", ["has", "point_count"]], paint: { "circle-radius": 7, "circle-stroke-width": 2, "circle-stroke-color": "#ffffff", "circle-color": ["match", ["get", "layer"], "survey", layerColors.survey, "attendance_check_in", layerColors.attendance_check_in, "attendance_check_out", layerColors.attendance_check_out, "case_follow_up", layerColors.case_follow_up, "#334155"] } });
        map.on("click", "fieldlance-points", (event: any) => {
          const feature = event.features?.[0]; if (!feature) return;
          const row = rowsRef.current.find(item => item.id === feature.properties?.evidence_id); if (!row) return;
          new lib.Popup({ closeButton: true, maxWidth: "320px" }).setLngLat(feature.geometry.coordinates).setDOMContent(popupNode(row)).addTo(map);
        });
        map.on("mouseenter", "fieldlance-points", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "fieldlance-points", () => { map.getCanvas().style.cursor = ""; });
        setMapReady(true);
      });
    }).catch(cause => setMapError((cause as Error).message));
    return () => { active = false; const map = mapRef.current; mapRef.current = null; if (map) map.remove(); };
  }, []);

  useEffect(() => {
    const map = mapRef.current, lib = libRef.current; if (!map || !lib || !map.isStyleLoaded?.()) return;
    const evidence = { type: "FeatureCollection", features: plottedRows.map(row => ({ type: "Feature", geometry: { type: "Point", coordinates: [row.longitude, row.latitude] }, properties: { evidence_id: row.id, layer: row.layer, quality: row.quality } })) };
    const boundaries = { type: "FeatureCollection", features: (data?.boundaries || []).map(boundary => ({ type: "Feature", geometry: boundary.geometry, properties: { geography_id: boundary.geography_id, name: boundary.name, kind: boundary.kind } })) };
    map.getSource("fieldlance-evidence")?.setData(evidence);
    map.getSource("fieldlance-boundaries")?.setData(boundaries);
    const bounds = new lib.LngLatBounds(); let count = 0;
    for (const row of plottedRows) { bounds.extend([row.longitude, row.latitude]); count++; }
    for (const boundary of data?.boundaries || []) { const geometry = boundary.geometry as { coordinates?: unknown }; if (geometry.coordinates) { addCoordinatesToBounds(bounds, geometry.coordinates); count++; } }
    if (count) map.fitBounds(bounds, { padding: 44, maxZoom: 14, duration: 500 });
  }, [data, plottedRows, mapReady]);

  const selectableGeographies = geographies.filter(item => ["province", "division", "district", "taluka"].includes(item.kind) && item.active);
  const reviewRows = visibleRows.filter(row => row.quality !== "within_assigned_area" || row.warning_codes.length).slice(0, 12);

  return <section className="field-operations-map" aria-label={projectId ? "Project field operations map" : "My field map"}>
    <header className="field-map-hero">
      <div><span className="eyebrow">{projectId ? "PROJECT FIELD OPERATIONS" : "MY FIELD EVIDENCE"}</span><h2><MapPinned size={22}/> {projectId ? "Field Operations Map" : "My Field Map"}</h2><p>Maps explicit survey, attendance and visit evidence only. FieldLance does not continuously track workers in the background.</p></div>
      <div className="field-map-privacy"><ShieldCheck size={18}/><span>Private, permission-scoped evidence</span></div>
    </header>

    <section className="field-map-filters" aria-label="Map filters">
      <label>From<input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}/></label>
      <label>To<input type="date" value={to} min={from} max={isoDate(new Date())} onChange={e => setTo(e.target.value)}/></label>
      {projectId && (data?.workers.length || 0) > 1 && <label>Field Worker<select value={worker} onChange={e => setWorker(e.target.value)}><option value="">All authorized workers</option>{data?.workers.map(item => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</select></label>}
      <label>Area<select value={geo} onChange={e => setGeo(e.target.value)}><option value="">All authorized areas</option>{selectableGeographies.map(item => <option key={item.id} value={item.id}>{pathLabel(item.id, geographies)}</option>)}</select></label>
      <label>Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="">All states</option>{statuses.map(item => <option key={item} value={item}>{human(item)}</option>)}</select></label>
      <label>Quality<select value={quality} onChange={e => setQuality(e.target.value)}><option value="">All quality states</option>{Object.entries(qualityLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
      <button className="secondary field-map-refresh" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={15}/>{loading ? "Loading…" : "Refresh"}</button>
    </section>

    <section className="field-map-layers" aria-label="Map layers"><span><Layers3 size={15}/> Layers</span>{(Object.keys(layerLabels) as Layer[]).map(key => <label key={key}><input type="checkbox" checked={layers[key]} onChange={e => setLayers(current => ({ ...current, [key]: e.target.checked }))}/><i style={{ background: layerColors[key] }}/>{layerLabels[key]}</label>)}</section>

    {error && <p className="notice error" role="alert">{error}</p>}
    {mapError && <p className="notice warning" role="status"><AlertTriangle size={16}/>{mapError} Evidence lists and quality review remain available.</p>}

    <div className="field-map-stats">
      <article><span>Evidence</span><strong>{summary.total || 0}</strong></article><article><span>Plottable</span><strong>{summary.plottable || 0}</strong></article>
      <article><span>Within area</span><strong>{summary.within_assigned_area || 0}</strong></article><article><span>Outside area</span><strong>{summary.outside_assigned_area || 0}</strong></article>
      <article><span>Poor accuracy</span><strong>{summary.poor_accuracy || 0}</strong></article><article><span>Location unavailable</span><strong>{summary.location_unavailable || 0}</strong></article><article><span>Boundary unknown</span><strong>{summary.unable_to_determine || 0}</strong></article><article><span>Needs review</span><strong>{summary.warnings || 0}</strong></article>
    </div>

    <div className="field-map-canvas-wrap"><div ref={containerRef} className="field-map-canvas"/><div className="field-map-provider">MapLibre · OpenFreeMap / OpenStreetMap</div></div>

    {(data?.boundaries.length || 0) === 0 && visibleRows.some(row => row.latitude != null) && <p className="notice"><LocateFixed size={16}/> No authoritative GeoJSON boundary is loaded for the visible assigned areas. GPS points remain visible, but inside/outside classification stays <strong>unable to determine</strong> instead of guessing.</p>}

    <section className="field-map-review"><div className="panel-title"><div><span className="eyebrow">REVIEW SIGNALS</span><h3>Geographic & attendance consistency</h3><p>Signals support supervisor review; they are not automatic fraud findings or worker penalties.</p></div></div>
      {!reviewRows.length && !loading && <p className="empty-state">No visible evidence currently requires geographic/consistency review.</p>}
      {reviewRows.map(row => <article key={row.id} className="field-map-review-row"><div><strong>{row.source_label}</strong><p>{row.worker_name} · {row.project_title} · {new Date(row.captured_at).toLocaleString()}</p></div><div><span className={`field-map-quality ${row.quality}`}>{qualityLabels[row.quality]}</span>{row.warning_codes.map(code => <span className="field-map-warning" key={code}>{human(code)}</span>)}</div>{row.note && <p>{row.note}</p>}</article>)}
    </section>
  </section>;
}
