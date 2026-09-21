import { useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { rpc } from "../../lib/supabase/client";
import { human } from "../../shared/ui/FormFields";

type ActivityRow = { id: number; action: string; detail: Record<string, unknown>; created_at: string; actor_id: string | null; actor_name: string | null };

export function ProjectActivity({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [before, setBefore] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load(reset = false) {
    setBusy(true); setError("");
    try {
      const cursor = reset ? null : before;
      const result = await rpc("project_activity_feed", { p_project: projectId, p_before: cursor, p_limit: 40 }) as unknown as ActivityRow[];
      const next = result || [];
      setRows((current) => reset ? next : [...current, ...next]);
      setBefore(next.length ? next[next.length - 1].id : cursor);
      setMore(next.length === 40);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  useEffect(() => { setRows([]); setBefore(null); setMore(false); void load(true); }, [projectId]);

  return <section className="project-activity">
    <section className="project-section-header"><div><span className="eyebrow">ACCOUNTABLE HISTORY</span><h2>Project activity</h2><p>Project-tagged audit events only. Organization-wide events from other projects are intentionally excluded.</p></div><button type="button" className="secondary" disabled={busy} onClick={() => void load(true)}><RefreshCw size={15}/>Refresh</button></section>
    {error && <p className="notice error" role="alert">{error}</p>}
    <div className="project-activity-list">
      {rows.map((row) => <article key={row.id} className="project-activity-row"><span className="project-activity-icon"><Activity size={17}/></span><div><div className="project-activity-heading"><strong>{human(row.action)}</strong><time>{new Date(row.created_at).toLocaleString()}</time></div><p>{Object.entries(row.detail || {}).filter(([key]) => !["project","previous_version"].includes(key)).slice(0, 6).map(([key, value]) => `${human(key)}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join(" · ") || "Project event recorded."}</p><small>Actor: {row.actor_name || (row.actor_id ? "Authorized account" : "System")}</small></div></article>)}
    </div>
    {!busy && !rows.length && <div className="empty"><Activity/><h3>No project activity yet</h3><p>Project-tagged changes will appear here as work progresses.</p></div>}
    {more && <button type="button" className="secondary project-load-more" disabled={busy} onClick={() => void load(false)}>{busy ? "Loading…" : "Load older activity"}</button>}
  </section>;
}
