import { useEffect, useState } from "react";
import { db, rpc } from "../../lib/supabase/client";
import type { Geo } from "../geography/model";
import { areaCaption } from "../geography/areaSelection";
import { Badge, Field, human } from "../../shared/ui/FormFields";
import { PartnerNgoDocuments } from "./PartnerNgoApplication";
import { OrganizationLogoImage } from "./OrganizationLogo";

type Application =
  import("../../lib/supabase/database.types").Database["public"]["Tables"]["partner_ngo_applications"]["Row"];

export function PartnerNgoApplicationsReview({
  geographies,
  onChanged,
}: {
  geographies: Geo[];
  onChanged: () => Promise<void>;
}) {
  const [rows, setRows] = useState<Application[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const r = await db!
      .from("partner_ngo_applications")
      .select("*")
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (r.error) throw r.error;
    setRows(r.data || []);
    if (!selectedId && r.data?.length) setSelectedId(r.data[0].id);
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    db!
      .from("partner_ngo_applications")
      .select("*")
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .then((r) => {
        if (!alive) return;
        if (r.error) setError(r.error.message);
        else {
          setRows(r.data || []);
          if (r.data?.length) setSelectedId((old) => old || r.data![0].id);
        }
        setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  async function action(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      await load();
      await onChanged();
      setMessage(success);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const selected = rows.find((a) => a.id === selectedId) || null;

  return (
    <div className="ngo-review-workspace">
      {error && <div className="notice error" role="alert">{error}</div>}
      {message && <div className="notice success" role="status">{message}</div>}
      <section className="panel detail">
        <div className="panel-title">
          <div><h2>Organization applications</h2><span>Review organization identity, representative details and supporting evidence.</span></div>
        </div>
        {loading && <p role="status">Loading applications…</p>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Organization</th><th>Representative</th><th>Status</th><th>Submitted</th><th /></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td><div className="ngo-review-organization-cell"><OrganizationLogoImage name={a.organization_name || "Organization"} path={a.logo_path} updatedAt={a.logo_updated_at} size="card"/><span>{a.organization_name || "Draft application"}</span></div></td>
                  <td>{a.representative_name || "—"}</td>
                  <td><Badge value={a.status} /></td>
                  <td>{a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : "—"}</td>
                  <td><button className="secondary" onClick={() => setSelectedId(a.id)}>Review</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !rows.length && <p className="empty-state">No Organization applications yet.</p>}
      </section>

      {selected && <>
        <section className="panel detail">
          <div className="panel-title"><div className="ngo-review-heading-with-logo"><OrganizationLogoImage name={selected.organization_name || "Organization"} path={selected.logo_path} updatedAt={selected.logo_updated_at} size="review"/><div><span className="eyebrow">APPLICATION REVIEW</span><h2>{selected.organization_name || "Incomplete application"}</h2></div></div><Badge value={selected.status} /></div>
          <dl className="ngo-application-summary">
            <dt>Registration</dt><dd>{selected.registration_number || "—"}</dd>
            <dt>Legal type</dt><dd>{selected.legal_type || "—"}</dd>
            <dt>Representative</dt><dd>{selected.representative_name || "—"} {selected.representative_title ? `· ${selected.representative_title}` : ""}</dd>
            <dt>Email</dt><dd>{selected.email || "—"}</dd>
            <dt>Phone</dt><dd>{selected.phone || "—"}</dd>
            <dt>Address</dt><dd>{selected.address || "—"}</dd>
            <dt>Website</dt><dd>{selected.website || "—"}</dd>
            <dt>Programs</dt><dd>{selected.program_names.length ? selected.program_names.join(", ") : "—"}</dd>
            <dt>Operating areas</dt><dd>{selected.operating_area_ids.length ? selected.operating_area_ids.map((id) => areaCaption(id, geographies)).join("; ") : "—"}</dd>
          </dl>
          {selected.review_note && <p><strong>Previous review note:</strong> {selected.review_note}</p>}
        </section>

        <PartnerNgoDocuments application={selected} owner={false} reviewer={selected.status === "submitted"} onChanged={async () => { await load(); await onChanged(); }} />

        {selected.status === "submitted" && (
          <section className="panel detail">
            <h3>FieldLance decision</h3>
            <p>
              Approving creates an active Organization, copies the structured operating areas/programs,
              and activates the applicant as the first Organization Admin. Every current application document
              must be reviewed, including accepted registration/legal proof.
            </p>
            <form onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const decision = String(f.get("decision"));
              const label = human(decision);
              if (!window.confirm(`Save decision: ${label}?`)) return;
              action(() => rpc("review_partner_ngo_application", {
                p_id: selected.id,
                p_decision: decision,
                p_note: String(f.get("note")),
                p_version: selected.version,
              }), `Organization application decision saved: ${label}.`);
            }}>
              <Field label="Decision">
                <select name="decision" defaultValue="changes_requested">
                  <option value="changes_requested">Request changes</option>
                  <option value="approved">Approve Organization</option>
                  <option value="rejected">Reject application</option>
                </select>
              </Field>
              <Field label="Review note"><textarea name="note" required minLength={3} maxLength={2000} /></Field>
              <button className="primary" disabled={busy}>Save FieldLance decision</button>
            </form>
          </section>
        )}
      </>}
    </div>
  );
}
