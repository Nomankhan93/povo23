import { useEffect, useMemo, useState, type FormEvent } from "react";
import { db, rpc } from "../../lib/supabase/client";
import { validateFile } from "../../lib/files/validateFile";
import { AreaSelector } from "../geography/AreaSelector";
import {
  addOperatingArea,
  areaCaption,
  operatingKinds,
  selectableArea,
} from "../geography/areaSelection";
import type { Geo } from "../geography/model";
import { Badge, Field, human } from "../../shared/ui/FormFields";

type Application =
  import("../../lib/supabase/database.types").Database["public"]["Tables"]["partner_ngo_applications"]["Row"];
type Document =
  import("../../lib/supabase/database.types").Database["public"]["Tables"]["partner_ngo_application_documents"]["Row"];

type Draft = {
  organization_name: string;
  registration_number: string;
  legal_type: string;
  representative_name: string;
  representative_title: string;
  email: string;
  phone: string;
  address: string;
  website: string;
};

const emptyDraft: Draft = {
  organization_name: "",
  registration_number: "",
  legal_type: "",
  representative_name: "",
  representative_title: "",
  email: "",
  phone: "",
  address: "",
  website: "",
};

function draftFrom(a: Application): Draft {
  return {
    organization_name: a.organization_name,
    registration_number: a.registration_number,
    legal_type: a.legal_type,
    representative_name: a.representative_name,
    representative_title: a.representative_title,
    email: a.email,
    phone: a.phone,
    address: a.address,
    website: a.website,
  };
}

export function PartnerNgoDocuments({
  application,
  owner,
  reviewer,
  onChanged,
}: {
  application: Application;
  owner: boolean;
  reviewer: boolean;
  onChanged: () => Promise<void>;
}) {
  const [rows, setRows] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const editable = owner && ["draft", "changes_requested"].includes(application.status);

  async function load() {
    const r = await db!
      .from("partner_ngo_application_documents")
      .select("*")
      .eq("application_id", application.id)
      .neq("state", "deleted")
      .order("created_at", { ascending: false });
    if (r.error) throw r.error;
    setRows(r.data || []);
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    db!
      .from("partner_ngo_application_documents")
      .select("*")
      .eq("application_id", application.id)
      .neq("state", "deleted")
      .order("created_at", { ascending: false })
      .then((r) => {
        if (!alive) return;
        if (r.error) setError(r.error.message);
        else setRows(r.data || []);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [application.id, application.version]);

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
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const file = f.get("file") as File;
    await action(async () => {
      const mime = await validateFile(file);
      const d = await rpc("begin_partner_ngo_document_upload", {
        p_application: application.id,
        p_name: file.name,
        p_type: mime,
        p_bytes: file.size,
        p_kind: String(f.get("kind")),
      });
      if (
        !d ||
        typeof d !== "object" ||
        Array.isArray(d) ||
        typeof d.id !== "string" ||
        typeof d.object_path !== "string"
      )
        throw Error("Invalid NGO document reservation response");
      const uploaded = await db!.storage
        .from("poem-ngo-applications")
        .upload(d.object_path, file, {
          contentType: mime,
          cacheControl: "0",
          upsert: false,
        });
      if (uploaded.error) throw uploaded.error;
      await rpc("finish_partner_ngo_document_upload", { p_id: d.id });
      form.reset();
    }, "Application document uploaded.");
  }

  async function download(d: Document) {
    await action(async () => {
      const path = await rpc("partner_ngo_document_download_path", { p_id: d.id });
      const r = await db!.storage.from("poem-ngo-applications").download(path);
      if (r.error) throw r.error;
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = d.file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "Document download requested.");
  }

  async function remove(d: Document) {
    if (!window.confirm(`Remove ${d.file_name}? The stored bytes will be deleted.`)) return;
    await action(async () => {
      const path = await rpc("begin_partner_ngo_document_delete", { p_id: d.id });
      const r = await db!.storage.from("poem-ngo-applications").remove([path]);
      if (r.error) throw r.error;
      await rpc("finish_partner_ngo_document_delete", { p_id: d.id });
    }, "Application document removed.");
  }

  return (
    <section className="panel detail ngo-application-documents">
      <div className="panel-title">
        <div>
          <h3>Supporting documents</h3>
          <span>Private to the applicant and authorized POEM NGO reviewers.</span>
        </div>
      </div>
      <p>
        Registration/legal proof is required before submission. Authorization letters,
        tax documents and other evidence can be added when relevant. PDF, JPG or PNG;
        maximum 5 MiB each.
      </p>
      {error && <div className="notice error" role="alert">{error}</div>}
      {message && <div className="notice success" role="status">{message}</div>}
      {editable && (
        <form className="upload-form" onSubmit={upload}>
          <Field label="Document type">
            <select name="kind" defaultValue="registration_proof">
              <option value="registration_proof">Registration / legal proof</option>
              <option value="authorization_letter">Representative authorization letter</option>
              <option value="tax_document">Tax document</option>
              <option value="other">Other supporting evidence</option>
            </select>
          </Field>
          <Field label="Choose file">
            <input name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png" />
          </Field>
          <button className="primary" disabled={busy}>Upload document</button>
        </form>
      )}
      {loading && <p role="status">Loading application documents…</p>}
      {rows.map((d) => (
        <article className="document-row" key={d.id}>
          <div className="document-heading">
            <div>
              <strong>{d.file_name}</strong>
              <small>{human(d.kind)} · {(d.byte_size / 1024).toFixed(0)} KiB · {d.state}</small>
            </div>
            <Badge value={d.review_status} />
          </div>
          {d.review_note && <p>POEM review: {d.review_note}</p>}
          <div className="document-actions">
            {d.state === "ready" && <button className="secondary" disabled={busy} onClick={() => download(d)}>Download</button>}
            {editable && d.state === "uploading" && (
              <button className="secondary" disabled={busy} onClick={() => action(() => rpc("finish_partner_ngo_document_upload", { p_id: d.id }), "Upload finalized.")}>Finalize upload</button>
            )}
            {editable && <button className="secondary" disabled={busy} onClick={() => remove(d)}>{d.state === "deleting" ? "Retry removal" : "Remove"}</button>}
          </div>
          {reviewer && d.state === "ready" && (
            <form className="document-review" onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              action(() => rpc("review_partner_ngo_document", {
                p_id: d.id,
                p_status: String(f.get("status")),
                p_note: String(f.get("note")),
                p_version: d.version,
              }), "Document review saved.");
            }}>
              <Field label="Document decision">
                <select name="status" defaultValue={d.review_status === "rejected" ? "rejected" : "accepted"}>
                  <option value="accepted">Accept document</option>
                  <option value="rejected">Reject / replacement required</option>
                </select>
              </Field>
              <Field label="Review note"><input name="note" required minLength={3} maxLength={2000} defaultValue={d.review_note} /></Field>
              <button className="secondary" disabled={busy}>Save document review</button>
            </form>
          )}
        </article>
      ))}
      {!loading && !rows.length && <p className="empty-state">No supporting documents uploaded yet.</p>}
    </section>
  );
}

export function PartnerNgoApplication({
  userId,
  geographies,
  accountName,
  accountEmail,
  onChanged,
}: {
  userId: string;
  geographies: Geo[];
  accountName: string;
  accountEmail: string;
  onChanged: () => Promise<void>;
}) {
  const [application, setApplication] = useState<Application | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [areas, setAreas] = useState<string[]>([]);
  const [candidate, setCandidate] = useState<string | null>(null);
  const [programs, setPrograms] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const editable = application ? ["draft", "changes_requested"].includes(application.status) : false;
  const canAddArea = Boolean(
    candidate &&
      selectableArea(candidate, geographies) &&
      operatingKinds.includes(geographies.find((g) => g.id === candidate)?.kind || "") &&
      !areas.includes(candidate) &&
      areas.length < 100,
  );

  async function load() {
    const r = await db!
      .from("partner_ngo_applications")
      .select("*")
      .eq("applicant_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (r.error) throw r.error;
    const a = r.data?.[0] || null;
    setApplication(a);
    if (a) {
      setDraft(draftFrom(a));
      setAreas(a.operating_area_ids || []);
      setPrograms((a.program_names || []).join("\n"));
    } else {
      setDraft({ ...emptyDraft, representative_name: accountName, email: accountEmail });
      setAreas([]);
      setPrograms("");
    }
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    db!
      .from("partner_ngo_applications")
      .select("*")
      .eq("applicant_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .then((r) => {
        if (!alive) return;
        if (r.error) setError(r.error.message);
        else {
          const a = r.data?.[0] || null;
          setApplication(a);
          if (a) {
            setDraft(draftFrom(a));
            setAreas(a.operating_area_ids || []);
            setPrograms((a.program_names || []).join("\n"));
          } else {
            setDraft({ ...emptyDraft, representative_name: accountName, email: accountEmail });
          }
        }
        setLoading(false);
      });
    return () => { alive = false; };
  }, [userId, accountName, accountEmail]);

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

  const programList = useMemo(
    () => programs.split("\n").map((x) => x.trim()).filter(Boolean),
    [programs],
  );

  async function save(e?: FormEvent) {
    e?.preventDefault();
    await action(async () => {
      await rpc("save_partner_ngo_application", {
        p_id: application?.id || null,
        p_data: draft,
        p_areas: areas,
        p_programs: programList,
        p_version: application?.version || 0,
      });
    }, application ? "NGO application draft saved." : "Partner NGO application started.");
  }

  async function startNew() {
    setApplication(null);
    setDraft({ ...emptyDraft, representative_name: accountName, email: accountEmail });
    setAreas([]);
    setPrograms("");
    setCandidate(null);
    await action(async () => {
      await rpc("save_partner_ngo_application", {
        p_id: null,
        p_data: { ...emptyDraft, representative_name: accountName, email: accountEmail },
        p_areas: [],
        p_programs: [],
        p_version: 0,
      });
    }, "New Partner NGO application started.");
  }

  if (loading) return <p role="status">Loading Partner NGO application…</p>;

  if (!application) {
    return (
      <section className="panel detail ngo-application-intro">
        <span className="eyebrow">PARTNER WITH POEM</span>
        <h2>Apply as a Partner NGO</h2>
        <p>
          Your POEM login remains a personal account. Complete the organization application,
          add supporting documents and submit it for POEM review. Approval activates the NGO
          workspace and makes you its first Partner NGO Admin.
        </p>
        {error && <div className="notice error" role="alert">{error}</div>}
        <button className="primary" disabled={busy} onClick={startNew}>Start Partner NGO application</button>
      </section>
    );
  }

  return (
    <div className="ngo-application-workspace">
      <section className="panel detail">
        <div className="panel-title">
          <div>
            <span className="eyebrow">PARTNER NGO APPLICATION</span>
            <h2>{application.organization_name || "Organization application"}</h2>
          </div>
          <Badge value={application.status} />
        </div>
        <p>
          Account creation itself does not grant NGO access. POEM activates an organization
          only after this completed application and its evidence are reviewed.
        </p>
        {application.review_note && <div className={application.status === "approved" ? "notice success" : "notice warning"}><strong>POEM review:</strong> {application.review_note}</div>}
        {error && <div className="notice error" role="alert">{error}</div>}
        {message && <div className="notice success" role="status">{message}</div>}
        {application.status === "approved" && (
          <div className="notice success">
            Your organization is active. Use the workspace selector to open the NGO workspace.
            <button className="secondary" onClick={() => action(onChanged, "Workspace access refreshed.")}>Refresh workspace access</button>
          </div>
        )}
        {["rejected", "withdrawn"].includes(application.status) && (
          <button className="secondary" disabled={busy} onClick={startNew}>Start a new application</button>
        )}
        <form onSubmit={save}>
          <div className="form-grid">
            <Field label="Organization name"><input required={editable} disabled={!editable} value={draft.organization_name} maxLength={200} onChange={(e) => setDraft({ ...draft, organization_name: e.target.value })} /></Field>
            <Field label="Registration number"><input required={editable} disabled={!editable} value={draft.registration_number} maxLength={100} onChange={(e) => setDraft({ ...draft, registration_number: e.target.value })} /></Field>
            <Field label="Legal / registration type"><input disabled={!editable} value={draft.legal_type} maxLength={120} placeholder="Trust, society, Section 42, foundation…" onChange={(e) => setDraft({ ...draft, legal_type: e.target.value })} /></Field>
            <Field label="Representative name"><input required={editable} disabled={!editable} value={draft.representative_name} maxLength={200} onChange={(e) => setDraft({ ...draft, representative_name: e.target.value })} /></Field>
            <Field label="Representative title"><input required={editable} disabled={!editable} value={draft.representative_title} maxLength={120} placeholder="Executive Director, Program Manager…" onChange={(e) => setDraft({ ...draft, representative_title: e.target.value })} /></Field>
            <Field label="Organization email"><input required={editable} disabled={!editable} type="email" value={draft.email} maxLength={320} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></Field>
            <Field label="Phone"><input required={editable} disabled={!editable} value={draft.phone} maxLength={40} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field>
            <Field label="Website (optional)"><input disabled={!editable} value={draft.website} maxLength={500} placeholder="https://…" onChange={(e) => setDraft({ ...draft, website: e.target.value })} /></Field>
          </div>
          <Field label="Registered / main office address"><textarea required={editable} disabled={!editable} value={draft.address} maxLength={1000} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></Field>
          <section className="application-section">
            <h3>Operating areas</h3>
            {editable && <>
              <AreaSelector rows={geographies} value={candidate} onChange={setCandidate} title="Choose an operating area" disabled={busy} />
              <button type="button" className="secondary" disabled={!canAddArea || busy} onClick={() => setAreas((old) => addOperatingArea(old, candidate, geographies))}>Add area</button>
            </>}
            <ul className="selected-operating-areas">
              {areas.map((id) => <li key={id}><span>{areaCaption(id, geographies)}</span>{editable && <button type="button" className="secondary" onClick={() => setAreas((old) => old.filter((x) => x !== id))}>Remove</button>}</li>)}
            </ul>
            {!areas.length && <p className="empty-state">No operating areas selected.</p>}
          </section>
          <Field label="Programs (one per line)"><textarea disabled={!editable} value={programs} maxLength={5050} placeholder="Education\nHealth\nLivelihoods" onChange={(e) => setPrograms(e.target.value)} /></Field>
          {editable && <div className="actions"><button className="secondary" disabled={busy}>Save draft</button></div>}
        </form>
      </section>

      <PartnerNgoDocuments application={application} owner={true} reviewer={false} onChanged={async () => { await load(); await onChanged(); }} />

      {["draft", "changes_requested"].includes(application.status) && (
        <section className="panel detail">
          <h3>Submit for POEM approval</h3>
          <p>
            Submit only after the NGO profile is complete and registration/legal proof is uploaded.
            After submission, the application is locked while POEM reviews it.
          </p>
          <div className="actions">
            <button className="primary" disabled={busy} onClick={() => action(() => rpc("submit_partner_ngo_application", { p_id: application.id, p_version: application.version }), "Application submitted for POEM review.")}>Submit application</button>
            <button className="secondary" disabled={busy} onClick={() => window.confirm("Withdraw this application?") && action(() => rpc("withdraw_partner_ngo_application", { p_id: application.id, p_version: application.version }), "Application withdrawn.")}>Withdraw</button>
          </div>
        </section>
      )}
      {application.status === "submitted" && (
        <section className="panel detail">
          <h3>Under POEM review</h3>
          <p>Your profile and documents are locked while the review is in progress.</p>
          <button className="secondary" disabled={busy} onClick={() => window.confirm("Withdraw this submitted application?") && action(() => rpc("withdraw_partner_ngo_application", { p_id: application.id, p_version: application.version }), "Application withdrawn.")}>Withdraw application</button>
        </section>
      )}
    </div>
  );
}
