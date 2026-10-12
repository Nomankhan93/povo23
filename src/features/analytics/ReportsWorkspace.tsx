import { useEffect, useState, type FormEvent } from "react";
import { rpc, db } from "../../lib/supabase/client";
import { human } from "../../shared/ui/FormFields";
import { geographyPath, type Geo } from "../geography/model";
import { reportCSV, reportLabels, type OperationalReport, type ReportSelection } from "./model";
import { Alert, Button, DataTable, Field, FieldGroup, FormActions, MobileRecordCard, SectionHeader, Select, StatusBadge } from "../../components/ui/FieldLanceUI";
import styles from "./ReportsWorkspace.module.css";

type Props = { organization: string | null; projectId?: string | null; geographies: Geo[]; initial?: ReportSelection | null };
type Filters = { organization: string; project: string; geo: string; from: string; to: string; kind: string; status: string };
const specialStatus: Record<string, string> = { __active: "Active cases", __progress: "Applications in progress", __review: "Responses needing review", __due: "Follow-up due" };

export function ReportsWorkspace({ organization, projectId = null, geographies, initial = null }: Props) {
  const defaults: Filters = { organization: organization || "", project: projectId || "", geo: "", from: "", to: "", kind: initial?.kind || "responses", status: initial?.status || "" };
  const [draft, setDraft] = useState(defaults), [filters, setFilters] = useState(defaults), [offset, setOffset] = useState(0), [revision, setRevision] = useState(0);
  const [data, setData] = useState<OperationalReport | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(true), [exporting, setExporting] = useState(false), [notice, setNotice] = useState("");
  const [allowed, setAllowed] = useState<string[]>([]), [projects, setProjects] = useState<{ id: string; title: string; organization_id: string }[]>([]), [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [choiceQuery, setChoiceQuery] = useState("");
  const args = { p_org: organization || filters.organization || null, p_project: projectId || filters.project || null, p_geo: filters.geo || null, p_from: filters.from || null, p_to: filters.to || null, p_kind: filters.kind || null, p_status: filters.status || null };

  useEffect(() => { let live = true; setAllowed([]); setData(null); setBusy(true); setError("");
    rpc("operational_report", { p_org: organization || filters.organization || null, p_project: projectId || filters.project || null }).then(value => { if (!live) return; const kinds = (value as unknown as OperationalReport).allowed_kinds; setAllowed(kinds); if (!kinds.includes(filters.kind)) { const kind = kinds[0] || ""; setDraft(d => ({ ...d, kind, status: "" })); setFilters(d => ({ ...d, kind, status: "" })); } }).catch(e => { if (live) { setError(e.message); setAllowed([]); setData(null); setBusy(false); } });
    return () => { live = false; };
  }, [organization, projectId, filters.organization, filters.project]);

  useEffect(() => { let live = true; const timer = setTimeout(() => {
    let query = db!.from("survey_projects").select("id,title,organization_id").order("title").limit(100);
    if (organization || draft.organization) query = query.eq("organization_id", organization || draft.organization);
    if (projectId) query = query.eq("id", projectId); else if (choiceQuery) query = query.ilike("title", `%${choiceQuery}%`);
    void query.then(r => { if (live) { if (r.error) setError(r.error.message); else setProjects(r.data || []); } });
    if (!organization && !projectId) void db!.from("organizations").select("id,name").order("name").limit(100).ilike("name", `%${choiceQuery}%`).then(r => { if (live) { if (r.error) setError(r.error.message); else setOrgs(r.data || []); } });
  }, 250); return () => { live = false; clearTimeout(timer); }; }, [organization, projectId, draft.organization, choiceQuery]);

  useEffect(() => { let live = true; if (!allowed.length) return; setBusy(true); setError(""); setData(null); setNotice("");
    rpc("operational_report", { ...args, p_offset: offset }).then(value => { if (live) setData(value as unknown as OperationalReport); }).catch(e => live && setError(e.message)).finally(() => live && setBusy(false));
    return () => { live = false; };
  }, [organization, projectId, filters, offset, revision, allowed]);

  function apply(e: FormEvent) { e.preventDefault(); setOffset(0); setFilters({ ...draft }); setRevision(n => n + 1); }
  async function exportRows() { setExporting(true); setError(""); try { const result = await rpc("operational_report", { ...args, p_export: true }) as unknown as OperationalReport; const url = URL.createObjectURL(new Blob([reportCSV(result.rows)], { type: "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = `fieldlance-${filters.kind}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice(`${result.total} records exported. Export request recorded in audit history.`); } catch (e) { setError((e as Error).message); } finally { setExporting(false); } }

  const statuses = data ? Object.keys(data.counts).filter(key => key.startsWith(filters.kind + ".")).map(key => key.slice(filters.kind.length + 1)) : [];
  const maxTrend = Math.max(1, ...(data?.trend || []).map(t => t.n));
  const statusOptions = [
    { value: "", label: "All statuses" },
    ...(draft.status && !statuses.includes(draft.status) ? [{ value: draft.status, label: specialStatus[draft.status] || human(draft.status) }] : []),
    ...((draft.kind === filters.kind ? statuses : []).map(s => ({ value: s, label: human(s) }))),
    ...(draft.kind === "cases" && draft.status !== "__due" ? [{ value: "__due", label: "Follow-up due" }] : []),
  ];

  return <section className={`panel detail analytics-workspace ${styles.root}`}>
    <SectionHeader eyebrow="OPERATIONS & IMPACT" title="Reports & Analytics" description="Authorized records, accurate totals and monthly activity across your current workspace." />
    <form onSubmit={apply} className={styles.filters}>
      <FieldGroup columns={2}>
        {!projectId && <Field label="Find project / organization"><input value={choiceQuery} onChange={e => setChoiceQuery(e.target.value)} placeholder="Search names to refine the first 100 choices" /></Field>}
        {!organization && !projectId && <Select label="Organization" value={draft.organization} onChange={e => setDraft({ ...draft, organization: e.target.value, project: "" })} options={[{ value: "", label: "All authorized organizations" }, ...orgs.map(o => ({ value: o.id, label: o.name }))]} />}
        {!projectId && <Select label="Project" value={draft.project} onChange={e => setDraft({ ...draft, project: e.target.value })} options={[{ value: "", label: "All authorized projects" }, ...projects.map(p => ({ value: p.id, label: p.title }))]} />}
        <Select label="Report" value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value, status: "" })} options={allowed.map(k => ({ value: k, label: reportLabels[k] || human(k) }))} />
        <Select label="Geography" value={draft.geo} onChange={e => setDraft({ ...draft, geo: e.target.value })} options={[{ value: "", label: "All authorized areas" }, ...geographies.map(g => ({ value: g.id, label: geographyPath(g.id, geographies).map(x => x.name).join(" / ") }))]} />
        <Field label="From (UTC)"><input type="date" min="1900-01-01" max="2200-01-01" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} /></Field>
        <Field label="Through (UTC)"><input type="date" min={draft.from || "1900-01-01"} max="2200-01-01" value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} /></Field>
        <Select label="Status" value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })} options={statusOptions} />
      </FieldGroup>
      <FormActions><Button variant="primary" disabled={exporting}>Apply filters</Button></FormActions>
    </form>
    <p className="fine">Dates include the whole UTC day and select records created in that period (profiles use last update). Statuses show their current state, not historical transitions. Response geography uses collection area; recruitment, assistance and finance use project area. Project filters stay fixed when opened inside a project.</p>
    {error && <Alert tone="danger" title="Report unavailable">{error}</Alert>}
    {notice && <Alert tone="success" title="Export ready">{notice}</Alert>}
    {busy && <p role="status">Loading report…</p>}
    {data && <>
      <div className={styles.summary}><div><strong>{data.total.toLocaleString()} matching records</strong><span>Updated {new Date(data.as_of).toLocaleString()}</span></div><Button disabled={busy || exporting || data.total > 5000} onClick={() => void exportRows()}>{exporting ? "Preparing CSV…" : "Export filtered CSV"}</Button></div>
      {data.total > 5000 && <Alert tone="warning" title="Export limit">Narrow your filters to 5,000 records or fewer to export.</Alert>}
      <nav className={styles.statuses} aria-label="Report status totals">{statuses.map(s => <Button key={s} aria-pressed={filters.status === s} onClick={() => { setOffset(0); setFilters({ ...filters, status: s }); setDraft({ ...filters, status: s }); }}>{human(s)} <strong>{data.counts[`${filters.kind}.${s}`]}</strong></Button>)}</nav>
      {filters.kind === "applications" && <p>Recruitment states: pending → shortlisted → selected. Offers and accepted work are reported separately under Assignments; these are current-state counts, not a historical conversion rate.</p>}
      {!!data.money.length && <section><h2>Amounts by currency and event</h2>{data.money.map(m => <p key={m.currency + m.state}><strong>{m.currency} {m.amount}</strong> · {human(m.state)}</p>)}<p className="fine">Payable journal movements; these totals are not wallet balances or available project funding.</p></section>}
      <details className={styles.trends} open><summary>Monthly records by current status</summary>{data.trend.map(t => <div key={t.month + t.state}><span>{t.month} · {human(t.state)}</span><meter min={0} max={maxTrend} value={t.n} /><strong>{t.n}</strong></div>)}{!data.trend.length && <p>No activity matches these filters.</p>}</details>
      <div className={styles.desktopRecords}><DataTable caption={`${reportLabels[filters.kind] || human(filters.kind)} report`}><thead><tr><th>Record</th><th>Organization / Project</th><th>Area</th><th>Status</th><th>Created (UTC)</th>{filters.kind === "finance" && <th>Amount</th>}</tr></thead><tbody>{data.rows.map(row => <tr key={row.id}><td><strong>{row.label}</strong><details><summary>Reference</summary><code>{row.id}</code>{row.due_on && <p>Follow-up due {row.due_on}</p>}</details></td><td>{row.organization_name || "—"}<br />{row.project_name || "—"}</td><td>{row.geography_name || "—"}</td><td><StatusBadge tone="neutral">{human(row.status)}</StatusBadge></td><td>{new Date(row.created_at).toISOString().slice(0, 10)}</td>{filters.kind === "finance" && <td>{row.amount === null || row.amount === undefined ? "—" : `${row.currency || ""} ${row.amount}`.trim()}</td>}</tr>)}</tbody></DataTable></div>
      <div className={styles.mobileRecords}>{data.rows.map(row => <MobileRecordCard key={row.id} title={row.label} status={<StatusBadge tone="neutral">{human(row.status)}</StatusBadge>} meta={`${row.organization_name || "—"} · ${row.project_name || "—"}`} rows={[{ label: "Area", value: row.geography_name || "—" }, { label: "Created (UTC)", value: new Date(row.created_at).toISOString().slice(0, 10) }, ...(filters.kind === "finance" ? [{ label: "Amount", value: row.amount === null || row.amount === undefined ? "—" : `${row.currency || ""} ${row.amount}`.trim() }] : []), ...(row.due_on ? [{ label: "Follow-up due", value: row.due_on }] : [])]} action={<details><summary>Reference</summary><code>{row.id}</code></details>} />)}</div>
      {!data.rows.length && <p>No records match these filters.</p>}
      <div className={styles.pagination}><Button disabled={busy || offset === 0} onClick={() => setOffset(n => Math.max(0, n - 50))}>Previous</Button><span>{data.total ? `${offset + 1}–${Math.min(offset + 50, data.total)} of ${data.total}` : "0 records"}</span><Button disabled={busy || offset + 50 >= data.total} onClick={() => setOffset(n => n + 50)}>Next</Button></div>
      <p className="fine">Exports contain operational references and labels, not survey answers, beneficiary identity fields or private files.</p>
    </>}
  </section>;
}
