import { useMemo, useState, type FormEvent } from "react";
import { rpc } from "../../lib/supabase/client";
import { activeNode, Geo, geographyPath, levels } from "./model";
import { GeographyBoundaryManager } from "./GeographyBoundaryManager";
import { Alert, Button, DataTable, Field, FieldGroup, FormActions, MobileRecordCard, Select, StatusBadge } from "../../components/ui/FieldLanceUI";
import styles from "./GeographyManager.module.css";

export function GeographyManager({ rows, refresh }: { rows: Geo[]; refresh: () => Promise<void> }) {
  const [editing, setEditing] = useState<Geo | null>(null), [kind, setKind] = useState("province"), [parent, setParent] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [filter, setFilter] = useState("");
  const rank = (k: string) => (k === "ward" ? 5 : levels.indexOf(k));
  const filtered = useMemo(() => rows.filter(g => (g.name + " " + g.code).toLowerCase().includes(filter.toLowerCase())), [rows, filter]);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError(""); const el = e.currentTarget, f = new FormData(el);
    try {
      await rpc("save_geography", { p_id: editing?.id || null, p_parent: parent || null, p_kind: kind, p_name: String(f.get("name")), p_code: String(f.get("code")), p_source: String(f.get("source")), p_active: f.get("active") === "on" });
      setEditing(null); el.reset(); setKind("province"); setParent(""); await refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const startEdit = (g: Geo) => { setEditing(g); setKind(g.kind); setParent(g.parent_id || ""); };
  const cancelEdit = () => { setEditing(null); setKind("province"); setParent(""); };
  const parentOptions = [{ value: "", label: kind === "province" ? "No parent" : "Select parent" }, ...rows.filter(g => rank(g.kind) === rank(kind) - 1).map(g => ({ value: g.id, label: geographyPath(g.id, rows).map(n => n.name).join(" / ") }))];

  return <section className={`panel detail ${styles.root}`}>
    <div><h2>Geography master data</h2><p>Use approved administrative names and unique codes. Record the source/reference. Existing nodes cannot be moved to another parent or level.</p></div>
    {error && <Alert tone="danger" title="Geography update failed">{error}</Alert>}
    <form key={editing?.id || "new"} onSubmit={save} className={styles.form}>
      <FieldGroup columns={2}>
        <Select label="Level" disabled={!!editing} value={kind} onChange={e => { setKind(e.target.value); setParent(""); }} options={[...levels, "ward"].map(k => ({ value: k, label: k }))} />
        <Select label="Parent" disabled={!!editing || kind === "province"} required={kind !== "province"} value={parent} onChange={e => setParent(e.target.value)} options={parentOptions} />
        <Field label="Area name" required><input name="name" defaultValue={editing?.name} required minLength={2} maxLength={120} /></Field>
        <Field label="Unique code" required><input name="code" defaultValue={editing?.code} required maxLength={80} /></Field>
        <Field label="Source / administrative reference"><input name="source" defaultValue={editing?.source_note} maxLength={1000} /></Field>
        <label className={styles.check}><input type="checkbox" name="active" defaultChecked={editing?.active ?? true} /><span>Active</span></label>
      </FieldGroup>
      <FormActions>{editing && <Button type="button" onClick={cancelEdit}>Cancel edit</Button>}<Button variant="primary" disabled={busy}>{busy ? "Saving…" : editing ? "Update area" : "Add area"}</Button></FormActions>
    </form>
    <GeographyBoundaryManager rows={rows} />
    <Field label="Search areas"><input aria-label="Search areas" placeholder="Search area or code…" value={filter} onChange={e => setFilter(e.target.value)} /></Field>
    <div className={styles.desktopRecords}><DataTable caption="Geography hierarchy"><thead><tr><th>Area / hierarchy</th><th>Level</th><th>Code</th><th>Status</th><th>Action</th></tr></thead><tbody>{filtered.map(g => <tr key={g.id}><td>{geographyPath(g.id, rows).map(n => n.name).join(" / ")}</td><td>{g.kind}</td><td>{g.code}</td><td><StatusBadge tone={activeNode(g, rows) ? "success" : "neutral"}>{activeNode(g, rows) ? "Active" : "Inactive hierarchy"}</StatusBadge></td><td><Button variant="tertiary" onClick={() => startEdit(g)}>Edit</Button></td></tr>)}</tbody></DataTable></div>
    <div className={styles.mobileRecords}>{filtered.map(g => <MobileRecordCard key={g.id} title={g.name} status={<StatusBadge tone={activeNode(g, rows) ? "success" : "neutral"}>{activeNode(g, rows) ? "Active" : "Inactive hierarchy"}</StatusBadge>} meta={geographyPath(g.id, rows).map(n => n.name).join(" / ")} rows={[{ label: "Level", value: g.kind }, { label: "Code", value: g.code }]} action={<Button onClick={() => startEdit(g)}>Edit area</Button>} />)}</div>
    {!filtered.length && <p>No areas match this search.</p>}
  </section>;
}
