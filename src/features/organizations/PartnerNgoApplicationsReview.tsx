import { useEffect, useState } from "react";
import { db, rpc } from "../../lib/supabase/client";
import type { Geo } from "../geography/model";
import { areaCaption } from "../geography/areaSelection";
import { Badge, human } from "../../shared/ui/FormFields";
import { Alert, Button, ConfirmDialog, DataTable, FormActions, MobileRecordCard, Select, Textarea } from "../../components/ui/FieldLanceUI";
import { PartnerNgoDocuments } from "./PartnerNgoApplication";
import { OrganizationLogoImage } from "./OrganizationLogo";
import styles from "./PartnerNgoApplicationsReview.module.css";

type Application = import("../../lib/supabase/database.types").Database["public"]["Tables"]["partner_ngo_applications"]["Row"];
type PendingDecision = { id: string; decision: string; note: string; version: number; label: string; organization: string };

export function PartnerNgoApplicationsReview({ geographies, onChanged }: { geographies: Geo[]; onChanged: () => Promise<void> }) {
  const [rows, setRows] = useState<Application[]>([]), [selectedId, setSelectedId] = useState<string | null>(null), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(""), [message, setMessage] = useState(""), [pending, setPending] = useState<PendingDecision | null>(null);

  async function load() { const r = await db!.from("partner_ngo_applications").select("*").order("submitted_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }); if (r.error) throw r.error; setRows(r.data || []); if (!selectedId && r.data?.length) setSelectedId(r.data[0].id); }
  useEffect(() => { let alive = true; setLoading(true); db!.from("partner_ngo_applications").select("*").order("submitted_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).then(r => { if (!alive) return; if (r.error) setError(r.error.message); else { setRows(r.data || []); if (r.data?.length) setSelectedId(old => old || r.data![0].id); } setLoading(false); }); return () => { alive = false; }; }, []);
  async function action(fn: () => Promise<unknown>, success: string) { setBusy(true); setError(""); setMessage(""); try { await fn(); await load(); await onChanged(); setMessage(success); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  const selected = rows.find(a => a.id === selectedId) || null;

  return <div className={`ngo-review-workspace ${styles.root}`}>
    {error && <Alert tone="danger" title="Organization review failed">{error}</Alert>}
    {message && <Alert tone="success" title="Decision saved">{message}</Alert>}
    <section className="panel detail">
      <div className="panel-title"><div><h2>Organization applications</h2><span>Review organization identity, representative details and supporting evidence.</span></div></div>
      {loading && <p role="status">Loading applications…</p>}
      <div className={styles.desktopRecords}><DataTable caption="Organization applications"><thead><tr><th>Organization</th><th>Representative</th><th>Status</th><th>Submitted</th><th>Action</th></tr></thead><tbody>{rows.map(a => <tr key={a.id}><td><div className="ngo-review-organization-cell"><OrganizationLogoImage name={a.organization_name || "Organization"} path={a.logo_path} updatedAt={a.logo_updated_at} size="card" /><span>{a.organization_name || "Draft application"}</span></div></td><td>{a.representative_name || "—"}</td><td><Badge value={a.status} /></td><td>{a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : "—"}</td><td><Button onClick={() => setSelectedId(a.id)}>Review</Button></td></tr>)}</tbody></DataTable></div>
      <div className={styles.mobileRecords}>{rows.map(a => <MobileRecordCard key={a.id} title={a.organization_name || "Draft application"} status={<Badge value={a.status} />} meta={a.representative_name || "Representative not recorded"} rows={[{ label: "Submitted", value: a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : "—" }]} action={<Button onClick={() => setSelectedId(a.id)}>Review application</Button>} />)}</div>
      {!loading && !rows.length && <p className="empty-state">No Organization applications yet.</p>}
    </section>

    {selected && <>
      <section className="panel detail"><div className="panel-title"><div className="ngo-review-heading-with-logo"><OrganizationLogoImage name={selected.organization_name || "Organization"} path={selected.logo_path} updatedAt={selected.logo_updated_at} size="review" /><div><span className="eyebrow">APPLICATION REVIEW</span><h2>{selected.organization_name || "Incomplete application"}</h2></div></div><Badge value={selected.status} /></div><dl className="ngo-application-summary"><dt>Registration</dt><dd>{selected.registration_number || "—"}</dd><dt>Legal type</dt><dd>{selected.legal_type || "—"}</dd><dt>Representative</dt><dd>{selected.representative_name || "—"} {selected.representative_title ? `· ${selected.representative_title}` : ""}</dd><dt>Email</dt><dd>{selected.email || "—"}</dd><dt>Phone</dt><dd>{selected.phone || "—"}</dd><dt>Address</dt><dd>{selected.address || "—"}</dd><dt>Website</dt><dd>{selected.website || "—"}</dd><dt>Programs</dt><dd>{selected.program_names.length ? selected.program_names.join(", ") : "—"}</dd><dt>Operating areas</dt><dd>{selected.operating_area_ids.length ? selected.operating_area_ids.map(id => areaCaption(id, geographies)).join("; ") : "—"}</dd></dl>{selected.review_note && <p><strong>Previous review note:</strong> {selected.review_note}</p>}</section>
      <PartnerNgoDocuments application={selected} owner={false} reviewer={selected.status === "submitted"} onChanged={async () => { await load(); await onChanged(); }} />
      {selected.status === "submitted" && <section className="panel detail"><h3>FieldLance decision</h3><p>Approving creates an active Organization, copies the structured operating areas/programs, and activates the applicant as the first Organization Admin. Every current application document must be reviewed, including accepted registration/legal proof.</p><form className={styles.decisionForm} onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); const decision = String(f.get("decision")); setPending({ id: selected.id, decision, note: String(f.get("note")), version: selected.version, label: human(decision), organization: selected.organization_name || "this Organization" }); }}><Select label="Decision" name="decision" defaultValue="changes_requested" options={[{ value: "changes_requested", label: "Request changes" }, { value: "approved", label: "Approve Organization" }, { value: "rejected", label: "Reject application" }]} /><Textarea label="Review note" name="note" required minLength={3} maxLength={2000} /><FormActions><Button variant="primary" disabled={busy}>Review decision</Button></FormActions></form></section>}
    </>}
    <ConfirmDialog open={Boolean(pending)} title="Save FieldLance decision?" description={pending ? `${pending.organization}: ${pending.label}. The captured application version and review note will be submitted.` : undefined} confirmLabel={pending ? `Save ${pending.label}` : "Save decision"} danger={pending?.decision === "rejected"} busy={busy} onCancel={() => setPending(null)} onConfirm={async () => { if (!pending) return; const captured = pending; await action(() => rpc("review_partner_ngo_application", { p_id: captured.id, p_decision: captured.decision, p_note: captured.note, p_version: captured.version }), `Organization application decision saved: ${captured.label}.`); setPending(null); }} />
  </div>;
}
