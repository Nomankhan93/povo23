import { useEffect, useRef, useState, type FormEvent } from "react";
import { rpc } from "../../lib/supabase/client";
import { type Database } from "../../lib/supabase/database.types";
import { geographyPath, type Geo } from "../geography/model";
import { InviteVolunteer } from "../workforce/InviteVolunteer";
import { Alert, Button, DataTable, Field, FieldGroup, FormActions, MobileRecordCard, Select, StatusBadge, Textarea, type SemanticTone } from "../../components/ui/FieldLanceUI";
import styles from "./Directory.module.css";
export type Profile = Database["public"]["Tables"]["volunteer_profiles"]["Row"];
export type DirectoryRow = Profile & {
  shortlist_status: string | null;
  shortlist_note: string | null;
  shortlist_version: number | null;
};
export type Result = {
  rows: DirectoryRow[];
  total: number;
  page: number;
  page_size: number;
};
export const human = (s: string) => s.replaceAll("_", " ");
export function Directory({
  organization,
  geographies,
  reviewQueue,
  onSelect,
  revision,
}: {
  organization: string | null;
  geographies: Geo[];
  reviewQueue: boolean;
  onSelect: (p: DirectoryRow | null) => void;
  revision: number;
}) {
  const [filters, setFilters] = useState({
    query: "",
    geography: "",
    skill: "",
    language: "",
    availability: "",
    status: reviewQueue ? "pending" : "",
    shortlist: "",
  });
  const [applied, setApplied] = useState(filters),
    [page, setPage] = useState(0),
    [data, setData] = useState<Result | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<DirectoryRow | null>(null),
    [saving, setSaving] = useState(false);
  const request = useRef(0);
  useEffect(() => {
    let alive = true;
    const id = ++request.current;
    setBusy(true);
    setError("");
    setData(null);
    setEditing(null);
    rpc("search_volunteers", {
      p_org: organization,
      p_query: applied.query,
      p_geography: applied.geography || null,
      p_skill: applied.skill,
      p_language: applied.language,
      p_availability: applied.availability,
      p_status: reviewQueue ? "pending" : applied.status,
      p_shortlist: applied.shortlist,
      p_page: page,
    })
      .then((result) => {
        if (alive && id === request.current)
          setData(result as unknown as Result);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [organization, applied, page, reviewQueue, revision, refresh]);
  function apply(e: FormEvent) {
    e.preventDefault();
    onSelect(null);
    setPage(0);
    setApplied({ ...filters });
  }
  async function shortlist(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing || !organization) return;
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError("");
    try {
      await rpc("save_shortlist", {
        p_org: organization,
        p_user: editing.user_id,
        p_status: String(f.get("status")),
        p_note: String(f.get("note")),
        p_version: editing.shortlist_version || 0,
      });
      setEditing(null);
      setRefresh((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const statusTone = (status: string): SemanticTone => status === "verified" ? "success" : status === "pending" || status === "correction_required" ? "warning" : status === "suspended" ? "danger" : "neutral";
  const location = (p: DirectoryRow) => geographyPath(p.geography_id, geographies).map(g => g.name).join(" / ") || (p.details as Record<string, string>).area || "—";
  const clearFilters = () => {
    const empty = { query: "", geography: "", skill: "", language: "", availability: "", status: reviewQueue ? "pending" : "", shortlist: "" };
    setFilters(empty); setApplied(empty); setPage(0); onSelect(null);
  };
  return (
    <section className={`panel detail ${styles.root}`}>
      <div className="panel-title">
        <h2>{reviewQueue ? "Pending profile reviews" : "Volunteer directory"}</h2>
        <Button disabled={busy} onClick={() => { onSelect(null); setRefresh(n => n + 1); }}>Refresh</Button>
      </div>
      <p>{organization ? "Only volunteers currently sharing with this NGO appear here. Selection does not create a contract or assignment." : "Search the authorized FieldLance volunteer network."}</p>
      <form onSubmit={apply} className={styles.filters}>
        <FieldGroup columns={2}>
          <Field label="Name"><input maxLength={100} value={filters.query} onChange={e => setFilters({ ...filters, query: e.target.value })} /></Field>
          <Field label="Skill contains"><input maxLength={100} value={filters.skill} onChange={e => setFilters({ ...filters, skill: e.target.value })} /></Field>
          <Field label="Language contains"><input maxLength={100} value={filters.language} onChange={e => setFilters({ ...filters, language: e.target.value })} /></Field>
          <Select label="Geography (includes descendants)" value={filters.geography} onChange={e => setFilters({ ...filters, geography: e.target.value })} options={[{ value: "", label: "All areas" }, ...geographies.map(g => ({ value: g.id, label: geographyPath(g.id, geographies).map(a => a.name).join(" / ") }))]} />
          <Select label="Availability" value={filters.availability} onChange={e => setFilters({ ...filters, availability: e.target.value })} options={["", "Part-time", "Full-time", "Weekends", "Unavailable"].map(value => ({ value, label: value || "Any availability" }))} />
          {!reviewQueue && <Select label="Verification" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })} options={["", "draft", "pending", "verified", "correction_required", "suspended"].map(value => ({ value, label: value === "verified" ? "Active profile" : human(value) || "All statuses" }))} />}
          {organization && <Select label="Shortlist" value={filters.shortlist} onChange={e => setFilters({ ...filters, shortlist: e.target.value })} options={["", "any", "shortlisted", "considering", "selected", "not_selected"].map(value => ({ value, label: value === "any" ? "Any shortlisted profile" : human(value) || "All shared profiles" }))} />}
        </FieldGroup>
        <FormActions><Button type="button" onClick={clearFilters}>Clear filters</Button><Button variant="primary" disabled={busy}>Apply filters</Button></FormActions>
      </form>
      {error && <Alert tone="danger" title="Volunteer directory unavailable">{error}</Alert>}
      {busy && <p role="status">Loading volunteers…</p>}
      {data && <>
        <p role="status">{data.total} matching profiles · page {page + 1} of {Math.max(1, Math.ceil(data.total / 50))}</p>
        <div className={styles.desktopRecords}><DataTable caption="Authorized volunteer profiles"><thead><tr><th>Volunteer</th><th>Location</th><th>Skills / languages</th><th>Status</th>{organization && <th>Selection</th>}<th>Actions</th></tr></thead><tbody>{data.rows.map(p => { const d = p.details as Record<string, string>; return <tr key={p.user_id}><td><strong>{d.full_name || "Unnamed volunteer"}</strong><p>{d.availability || "Not specified"}</p></td><td>{location(p)}</td><td>{d.skills || "—"}<p>{d.languages || "—"}</p></td><td><StatusBadge tone={statusTone(p.status)}>{p.status === "verified" ? "active" : human(p.status)}</StatusBadge></td>{organization && <td>{human(p.shortlist_status || "Not shortlisted")}</td>}<td><div className={styles.rowActions}><Button variant="tertiary" onClick={() => onSelect(p)}>View profile</Button>{organization && <Button variant="tertiary" onClick={() => setEditing(p)}>Manage shortlist</Button>}{organization && p.shortlist_status && p.shortlist_status !== "not_selected" && <InviteVolunteer organization={organization} userId={p.user_id} name={d.full_name || "Volunteer"} />}</div></td></tr>; })}</tbody></DataTable></div>
        <div className={styles.mobileRecords}>{data.rows.map(p => { const d = p.details as Record<string, string>; return <MobileRecordCard key={p.user_id} title={d.full_name || "Unnamed volunteer"} status={<StatusBadge tone={statusTone(p.status)}>{p.status === "verified" ? "active" : human(p.status)}</StatusBadge>} meta={d.availability || "Availability not specified"} rows={[{ label: "Location", value: location(p) }, { label: "Skills", value: d.skills || "—" }, { label: "Languages", value: d.languages || "—" }, ...(organization ? [{ label: "Selection", value: human(p.shortlist_status || "Not shortlisted") }] : [])]} action={<div className={styles.rowActions}><Button onClick={() => onSelect(p)}>View profile</Button>{organization && <Button onClick={() => setEditing(p)}>Manage shortlist</Button>}{organization && p.shortlist_status && p.shortlist_status !== "not_selected" && <InviteVolunteer organization={organization} userId={p.user_id} name={d.full_name || "Volunteer"} />}</div>} />; })}</div>
        {!data.rows.length && <p className="empty">No matching profiles. Change filters or return to the first page.</p>}
        <div className={styles.pagination}><Button disabled={page === 0 || busy} onClick={() => { onSelect(null); setPage(p => p - 1); }}>Previous 50</Button><Button disabled={(page + 1) * 50 >= data.total || busy} onClick={() => { onSelect(null); setPage(p => p + 1); }}>Next 50</Button></div>
      </>}
      {editing && <form className={`review ${styles.shortlistForm}`} key={editing.user_id + String(editing.shortlist_version)} onSubmit={shortlist}>
        <h3>NGO shortlist decision</h3><p>{(editing.details as Record<string, string>).full_name}. Notes are private to this NGO's authorized admins.</p>
        <Select label="Status" name="status" defaultValue={editing.shortlist_status || "shortlisted"} options={["shortlisted", "considering", "selected", "not_selected", "remove"].map(value => ({ value, label: human(value) }))} />
        <Textarea label="Internal selection note" name="note" defaultValue={editing.shortlist_note || ""} maxLength={2000} />
        <FormActions><Button type="button" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" disabled={saving}>{saving ? "Saving…" : "Save decision"}</Button></FormActions>
      </form>}
    </section>
  );
}
