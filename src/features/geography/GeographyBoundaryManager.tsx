import { useEffect, useState, type FormEvent } from "react";
import { MapPinned, Trash2 } from "lucide-react";
import { rpc } from "../../lib/supabase/client";
import type { Geo } from "./model";
import { geographyPath } from "./model";

type BoundaryRow = { geography_id: string; name: string; kind: string; code: string; geometry: unknown; source_note: string; source_version: string; updated_at: string };
type Call = (name: string, args?: Record<string, unknown>) => Promise<unknown>;
const call = rpc as unknown as Call;

export function GeographyBoundaryManager({ rows }: { rows: Geo[] }) {
  const [area, setArea] = useState(""), [geojson, setGeojson] = useState(""), [source, setSource] = useState(""), [version, setVersion] = useState("");
  const [existing, setExisting] = useState<BoundaryRow | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");

  useEffect(() => {
    let live = true; setError(""); setNotice(""); setExisting(null); setGeojson(""); setSource(""); setVersion("");
    if (!area) return () => { live = false; };
    void call("geography_boundary_catalog", { p_geography: area }).then(result => {
      if (!live) return; const row = ((result as BoundaryRow[]) || [])[0] || null; setExisting(row);
      if (row) { setGeojson(JSON.stringify(row.geometry, null, 2)); setSource(row.source_note); setVersion(row.source_version || ""); }
    }).catch(cause => { if (live) setError((cause as Error).message); });
    return () => { live = false; };
  }, [area]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const parsed = JSON.parse(geojson) as unknown;
      await call("save_geography_boundary", { p_geography: area, p_geojson: parsed, p_source: source, p_source_version: version });
      const list = await call("geography_boundary_catalog", { p_geography: area }) as BoundaryRow[]; const row = list[0] || null; setExisting(row);
      if (row) setGeojson(JSON.stringify(row.geometry, null, 2)); setNotice("Authoritative geography boundary saved.");
    } catch (cause) { setError(cause instanceof SyntaxError ? "GeoJSON is not valid JSON." : (cause as Error).message); }
    finally { setBusy(false); }
  }
  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(""); setNotice("");
    try { await call("remove_geography_boundary", { p_geography: area, p_reason: String(form.get("reason") || "") }); setExisting(null); setGeojson(""); setSource(""); setVersion(""); setNotice("Boundary removed; geographic quality will safely return unable to determine until a replacement is loaded."); event.currentTarget.reset(); }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  const eligible = rows.filter(item => item.active && ["province", "division", "district", "taluka", "uc", "village", "ward"].includes(item.kind));
  return <details className="geography-boundary-manager">
    <summary><MapPinned size={16}/> Geographic boundaries for field-quality checks</summary>
    <p>Optional authoritative Polygon/MultiPolygon GeoJSON enables true point-in-area classification. Without a boundary, FieldLance returns <strong>unable to determine</strong> rather than guessing. GeoJSON coordinates must use <code>[longitude, latitude]</code>.</p>
    {error && <p className="notice error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
    <label className="field">Administrative area<select value={area} onChange={event => setArea(event.target.value)}><option value="">Choose area</option>{eligible.map(item => <option key={item.id} value={item.id}>{geographyPath(item.id, rows).map(node => node.name).join(" / ")} · {item.kind}</option>)}</select></label>
    {area && <form onSubmit={save}>
      <div className="form-grid"><label className="field">Boundary source / authority<input required minLength={3} maxLength={1000} value={source} onChange={event => setSource(event.target.value)} placeholder="Official GIS/source reference"/></label><label className="field">Source version / date<input maxLength={120} value={version} onChange={event => setVersion(event.target.value)} placeholder="e.g. 2026-09 or dataset version"/></label></div>
      <label className="field">Polygon / MultiPolygon GeoJSON<textarea className="geography-boundary-json" required value={geojson} onChange={event => setGeojson(event.target.value)} placeholder='{"type":"Polygon","coordinates":[...]}'/></label>
      <button className="primary" disabled={busy || !geojson.trim() || !source.trim()}>{busy ? "Saving…" : existing ? "Update boundary" : "Save boundary"}</button>
      {existing && <p className="fine">Current boundary updated {new Date(existing.updated_at).toLocaleString()} · {existing.source_note}{existing.source_version ? ` · ${existing.source_version}` : ""}</p>}
    </form>}
    {area && existing && <form className="geography-boundary-remove" onSubmit={remove}><label className="field">Removal reason<input name="reason" required minLength={5} maxLength={1000}/></label><button className="secondary" disabled={busy}><Trash2 size={14}/> Remove boundary</button></form>}
  </details>;
}
