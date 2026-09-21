import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  FileText,
  MapPin,
  Search,
  Send,
  Tags,
  UploadCloud,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
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
import { OrganizationLogoImage, PartnerNgoLogoEditor } from "./OrganizationLogo";

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

const registrationTypes = [
  "Charitable Organization",
  "Community-Based Organization (CBO)",
  "Foundation",
  "International Organization",
  "Non-profit Company",
  "Religious / Welfare Organization",
  "Section 42 Company",
  "Society",
  "Trust",
];

const representativeTitles = [
  "Authorized Representative",
  "Board Member",
  "CEO",
  "Chairperson",
  "Country Director",
  "Executive Director",
  "Field Coordinator",
  "Finance Manager",
  "HR Manager",
  "M&E / MEAL Manager",
  "Operations Manager",
  "President",
  "Program Director",
  "Program Manager",
  "Project Manager",
  "Secretary General",
];

const programOptions = [
  "Agriculture",
  "Child Protection",
  "Climate & Environment",
  "Disability Inclusion",
  "Education",
  "Emergency Response",
  "Food Security",
  "Gender Equality",
  "Governance",
  "Health",
  "Human Rights",
  "Livelihoods",
  "Research & Surveys",
  "Social Protection",
  "WASH",
  "Women Empowerment",
  "Youth Development",
];

const applicationSteps = [
  ["Organization", "Organization details"],
  ["Operating Areas", "Where your organization works"],
  ["Programs", "Program areas and sectors"],
  ["Documents", "Supporting evidence"],
  ["Review", "Review and submit"],
] as const;

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

function normalized(value: string) {
  return value.trim().toLocaleLowerCase();
}

function OrganizationReview({
  application,
  draft,
  areas,
  programs,
  documents,
  geographies,
}: {
  application: Application;
  draft: Draft;
  areas: string[];
  programs: string[];
  documents: Document[];
  geographies: Geo[];
}) {
  return (
    <div className="ngo-review-summary-grid">
      <section className="ngo-review-card ngo-review-card-identity">
        <OrganizationLogoImage
          name={draft.organization_name || "Organization"}
          path={application.logo_path}
          updatedAt={application.logo_updated_at}
          size="review"
        />
        <div>
          <span className="eyebrow">ORGANIZATION</span>
          <h3>{draft.organization_name || "Organization details incomplete"}</h3>
          <p>{draft.legal_type || "Registration type not specified"}</p>
        </div>
      </section>
      <section className="ngo-review-card">
        <span className="eyebrow">REGISTRATION</span>
        <dl>
          <dt>Registration number</dt><dd>{draft.registration_number || "—"}</dd>
          <dt>Representative</dt><dd>{draft.representative_name || "—"}</dd>
          <dt>Designation</dt><dd>{draft.representative_title || "—"}</dd>
          <dt>Official email</dt><dd>{draft.email || "—"}</dd>
          <dt>Phone</dt><dd>{draft.phone || "—"}</dd>
          <dt>Website</dt><dd>{draft.website || "—"}</dd>
        </dl>
      </section>
      <section className="ngo-review-card">
        <span className="eyebrow">OPERATING AREAS</span>
        <div className="ngo-review-tags">
          {areas.length ? areas.map((id) => <span key={id}>{areaCaption(id, geographies)}</span>) : <em>No operating areas added.</em>}
        </div>
      </section>
      <section className="ngo-review-card">
        <span className="eyebrow">PROGRAM AREAS</span>
        <div className="ngo-review-tags">
          {programs.length ? programs.map((program) => <span key={program}>{program}</span>) : <em>No program areas selected.</em>}
        </div>
      </section>
      <section className="ngo-review-card ngo-review-card-wide">
        <span className="eyebrow">SUPPORTING DOCUMENTS</span>
        <div className="ngo-review-documents">
          {documents.length ? documents.map((document) => (
            <article key={document.id}>
              <span className="ngo-review-document-icon"><FileCheck2 size={17}/></span>
              <div>
                <strong>{document.file_name}</strong>
                <small>{human(document.kind)} · {(document.byte_size / 1024).toFixed(0)} KiB</small>
              </div>
              <Badge value={document.state === "ready" ? document.review_status : document.state} />
            </article>
          )) : <em>No supporting documents uploaded.</em>}
        </div>
      </section>
      <section className="ngo-review-card ngo-review-card-wide">
        <span className="eyebrow">REGISTERED / MAIN OFFICE ADDRESS</span>
        <p>{draft.address || "—"}</p>
      </section>
    </div>
  );
}

export function PartnerNgoDocuments({
  application,
  owner,
  reviewer,
  onChanged,
  onRowsChanged,
}: {
  application: Application;
  owner: boolean;
  reviewer: boolean;
  onChanged: () => Promise<void>;
  onRowsChanged?: (rows: Document[]) => void;
}) {
  const [rows, setRows] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState("registration_proof");
  const [dragging, setDragging] = useState(false);
  const editable = owner && ["draft", "changes_requested"].includes(application.status);

  function publishRows(next: Document[]) {
    setRows(next);
    onRowsChanged?.(next);
  }

  async function load() {
    const r = await db!
      .from("partner_ngo_application_documents")
      .select("*")
      .eq("application_id", application.id)
      .neq("state", "deleted")
      .order("created_at", { ascending: false });
    if (r.error) throw r.error;
    publishRows(r.data || []);
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
        else publishRows(r.data || []);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [application.id, application.version]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 3200);
    return () => window.clearTimeout(timer);
  }, [message]);

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
    if (!file) {
      setError("Choose a supporting document before uploading.");
      return;
    }
    await action(async () => {
      const mime = await validateFile(file);
      const d = await rpc("begin_partner_ngo_document_upload", {
        p_application: application.id,
        p_name: file.name,
        p_type: mime,
        p_bytes: file.size,
        p_kind: kind,
      });
      if (
        !d ||
        typeof d !== "object" ||
        Array.isArray(d) ||
        typeof d.id !== "string" ||
        typeof d.object_path !== "string"
      )
        throw Error("Invalid Organization document reservation response");
      const uploaded = await db!.storage
        .from("poem-ngo-applications")
        .upload(d.object_path, file, {
          contentType: mime,
          cacheControl: "0",
          upsert: false,
        });
      if (uploaded.error) throw uploaded.error;
      await rpc("finish_partner_ngo_document_upload", { p_id: d.id });
      setFile(null);
    }, "Supporting document uploaded.");
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
    }, "Supporting document removed.");
  }

  async function replaceDocument(d: Document, replacement: File) {
    if (!window.confirm(`Replace ${d.file_name} with ${replacement.name}?`)) return;

    setBusy(true);
    setError("");
    setMessage("");
    let replacementReady = false;

    try {
      const mime = await validateFile(replacement);
      const next = await rpc("begin_partner_ngo_document_upload", {
        p_application: application.id,
        p_name: replacement.name,
        p_type: mime,
        p_bytes: replacement.size,
        p_kind: d.kind,
      });
      if (
        !next ||
        typeof next !== "object" ||
        Array.isArray(next) ||
        typeof next.id !== "string" ||
        typeof next.object_path !== "string"
      )
        throw Error("Invalid Organization document reservation response");

      const uploaded = await db!.storage
        .from("poem-ngo-applications")
        .upload(next.object_path, replacement, {
          contentType: mime,
          cacheControl: "0",
          upsert: false,
        });
      if (uploaded.error) throw uploaded.error;

      await rpc("finish_partner_ngo_document_upload", { p_id: next.id });
      replacementReady = true;

      const oldPath = await rpc("begin_partner_ngo_document_delete", { p_id: d.id });
      const removed = await db!.storage.from("poem-ngo-applications").remove([oldPath]);
      if (removed.error) throw removed.error;
      await rpc("finish_partner_ngo_document_delete", { p_id: d.id });

      await load();
      await onChanged();
      setMessage("Supporting document replaced.");
    } catch (e) {
      const detail = (e as Error).message;
      setError(
        replacementReady
          ? `Replacement uploaded, but the previous document still needs removal: ${detail}. Retry removal on the previous item.`
          : detail,
      );
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  function chooseDroppedFile(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (!editable || busy) return;
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) setFile(dropped);
  }

  return (
    <section className="ngo-step-card ngo-application-documents">
      <div className="ngo-step-heading">
        <div>
          <span className="eyebrow">STEP 4</span>
          <h2>Supporting documents</h2>
          <p>Upload the evidence FieldLance needs to verify your organization. Registration/legal proof is required.</p>
        </div>
        <FileText aria-hidden="true" />
      </div>
      {error && <div className="notice error" role="alert">{error}</div>}
      {message && <div className="ngo-toast" role="status"><Check size={17}/>{message}</div>}
      {editable && (
        <form className="ngo-document-upload" onSubmit={upload}>
          <Field label="Document type">
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="registration_proof">Registration / legal proof *</option>
              <option value="authorization_letter">Authorization letter</option>
              <option value="tax_document">Tax document</option>
              <option value="organization_profile">Organization profile</option>
              <option value="financial_document">Bank / financial document</option>
              <option value="other">Other supporting document</option>
            </select>
          </Field>
          <div
            className={`ngo-dropzone${dragging ? " dragging" : ""}`}
            onDragOver={(e) => { e.preventDefault(); if (editable && !busy) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={chooseDroppedFile}
          >
            <UploadCloud size={28} aria-hidden="true" />
            <strong>{file ? file.name : "Drag & drop a document here"}</strong>
            <span>{file ? `${Math.max(1, Math.round(file.size / 1024))} KiB selected` : "or choose a file from your device"}</span>
            <label className="secondary ngo-file-picker">
              {file ? "Choose another file" : "Choose file"}
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                disabled={busy}
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            <small>PDF, JPG or PNG · maximum 5 MiB</small>
          </div>
          <div className="ngo-upload-actions">
            {file && <button type="button" className="link" onClick={() => setFile(null)} disabled={busy}>Clear selection</button>}
            <button className="primary" disabled={busy || !file}>Upload document</button>
          </div>
        </form>
      )}
      {loading && <p role="status">Loading application documents…</p>}
      <div className="ngo-document-list">
        {rows.map((d) => (
          <article className="ngo-document-card" key={d.id}>
            <div className="ngo-document-icon"><FileCheck2 size={20}/></div>
            <div className="ngo-document-meta">
              <strong>{d.file_name}</strong>
              <small>{human(d.kind)} · {(d.byte_size / 1024).toFixed(0)} KiB</small>
              {d.review_note && <p>FieldLance review: {d.review_note}</p>}
            </div>
            <Badge value={d.review_status} />
            <div className="ngo-document-actions">
              {d.state === "ready" && <button className="secondary" type="button" disabled={busy} onClick={() => void download(d)}>Download</button>}
              {editable && d.state === "uploading" && (
                <button className="secondary" type="button" disabled={busy} onClick={() => void action(() => rpc("finish_partner_ngo_document_upload", { p_id: d.id }), "Upload finalized.")}>Finalize</button>
              )}
              {editable && d.state === "ready" && (
                <label className={`secondary ngo-document-replace${busy ? " disabled" : ""}`}>
                  Replace
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    disabled={busy}
                    onChange={(e) => {
                      const replacement = e.target.files?.[0] || null;
                      e.currentTarget.value = "";
                      if (replacement) void replaceDocument(d, replacement);
                    }}
                  />
                </label>
              )}
              {editable && <button className="link danger-link" type="button" disabled={busy} onClick={() => void remove(d)}>{d.state === "deleting" ? "Retry removal" : "Remove"}</button>}
            </div>
            {reviewer && d.state === "ready" && (
              <form className="document-review" onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void action(() => rpc("review_partner_ngo_document", {
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
      </div>
      {!loading && !rows.length && (
        <div className="ngo-empty-state">
          <FileText size={24}/>
          <strong>No supporting documents uploaded yet.</strong>
          <span>Start with your registration or legal proof.</span>
        </div>
      )}
    </section>
  );
}

export function PartnerNgoApplication({
  userId,
  geographies,
  accountName,
  accountEmail,
  onChanged,
  onOpenOrganization,
  onBackToDashboard,
}: {
  userId: string;
  geographies: Geo[];
  accountName: string;
  accountEmail: string;
  onChanged: () => Promise<void>;
  onOpenOrganization?: (organizationId: string) => void;
  onBackToDashboard?: () => void;
}) {
  const [application, setApplication] = useState<Application | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [areas, setAreas] = useState<string[]>([]);
  const [candidate, setCandidate] = useState<string | null>(null);
  const [programs, setPrograms] = useState<string[]>([]);
  const [programSearch, setProgramSearch] = useState("");
  const [customProgram, setCustomProgram] = useState("");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [step, setStep] = useState(0);
  const [attempted, setAttempted] = useState<Set<number>>(new Set());
  const [legalOther, setLegalOther] = useState(false);
  const [titleOther, setTitleOther] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const editable = application ? ["draft", "changes_requested"].includes(application.status) : false;
  const canAddArea = Boolean(
    candidate &&
      selectableArea(candidate, geographies) &&
      operatingKinds.includes(geographies.find((g) => g.id === candidate)?.kind || "") &&
      !areas.includes(candidate) &&
      areas.length < 100,
  );

  function applyApplication(a: Application | null, initial = false) {
    setApplication(a);
    if (a) {
      setDraft(draftFrom(a));
      setAreas(a.operating_area_ids || []);
      setPrograms(a.program_names || []);
      setLegalOther(Boolean(a.legal_type && !registrationTypes.includes(a.legal_type)));
      setTitleOther(Boolean(a.representative_title && !representativeTitles.includes(a.representative_title)));
      if (initial && !["draft", "changes_requested"].includes(a.status)) setStep(4);
    } else {
      setDraft({ ...emptyDraft, representative_name: accountName, email: accountEmail });
      setAreas([]);
      setPrograms([]);
      setLegalOther(false);
      setTitleOther(false);
    }
  }

  async function load(initial = false) {
    const r = await db!
      .from("partner_ngo_applications")
      .select("*")
      .eq("applicant_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (r.error) throw r.error;
    applyApplication(r.data?.[0] || null, initial);
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
        else applyApplication(r.data?.[0] || null, true);
        setLoading(false);
      });
    return () => { alive = false; };
  }, [userId, accountName, accountEmail]);

  useEffect(() => {
    if (!application) {
      setDocuments([]);
      return;
    }

    let alive = true;

    db!
      .from("partner_ngo_application_documents")
      .select("*")
      .eq("application_id", application.id)
      .neq("state", "deleted")
      .order("created_at", { ascending: false })
      .then((result) => {
        if (!alive) return;

        if (result.error) {
          setError((current) => current || result.error.message);
        } else {
          setDocuments(result.data || []);
        }
      });

    return () => {
      alive = false;
    };
  }, [application?.id, application?.version]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 3200);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!submitSuccess) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSubmitSuccess(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [submitSuccess]);

  async function runAction(fn: () => Promise<unknown>, success?: string, reload = true) {
    setBusy(true);
    setError("");
    if (success) setMessage("");
    try {
      await fn();
      if (reload) await load(false);
      await onChanged();
      if (success) setMessage(success);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const organizationErrors = useMemo(() => {
    const result: Record<string, string> = {};
    if (draft.organization_name.trim().length < 2) result.organization_name = "Enter the organization’s registered name.";
    if (draft.registration_number.trim().length < 2) result.registration_number = "Enter the registration number or official registration reference.";
    if (draft.legal_type.trim().length < 2) result.legal_type = "Select or specify the organization’s registration type.";
    if (draft.representative_name.trim().length < 2) result.representative_name = "Enter the authorized representative’s name.";
    if (draft.representative_title.trim().length < 2) result.representative_title = "Select or specify the representative’s designation.";
    if (!/^\S+@\S+\.\S+$/.test(draft.email.trim())) result.email = "Enter a valid official organization email address.";
    if (draft.phone.trim().length < 7) result.phone = "Enter a valid organization phone number.";
    if (draft.address.trim().length < 10) result.address = "Enter the registered or main office address.";
    if (draft.website.trim() && !/^https?:\/\//i.test(draft.website.trim())) result.website = "Website should start with http:// or https://.";
    return result;
  }, [draft]);

  const organizationComplete = Object.keys(organizationErrors).length === 0;
  const areasComplete = areas.length > 0;
  const programsComplete = programs.length > 0;
  const registrationProofReady = documents.some((d) => d.state === "ready" && d.kind === "registration_proof");
  const documentsComplete = registrationProofReady && !documents.some((d) => ["uploading", "deleting"].includes(d.state));
  const requiredGroups = [organizationComplete, areasComplete, programsComplete, documentsComplete];
  const completedGroups = requiredGroups.filter(Boolean).length;
  const completion = Math.round((completedGroups / requiredGroups.length) * 100);
  const remaining = requiredGroups.length - completedGroups;
  const readyToSubmit = requiredGroups.every(Boolean);
  const firstIncomplete = requiredGroups.findIndex((done) => !done);
  const highestReachable = editable ? (firstIncomplete === -1 ? 4 : firstIncomplete) : 4;

  async function saveDraft(success = "Draft saved.") {
    if (!application) return false;
    return runAction(
      () => rpc("save_partner_ngo_application", {
        p_id: application.id,
        p_data: draft,
        p_areas: areas,
        p_programs: programs,
        p_version: application.version,
      }),
      success,
    );
  }

  async function startNew() {
    setApplication(null);
    setDraft({ ...emptyDraft, representative_name: accountName, email: accountEmail });
    setAreas([]);
    setPrograms([]);
    setCandidate(null);
    setDocuments([]);
    setStep(0);
    setAttempted(new Set());
    await runAction(async () => {
      await rpc("save_partner_ngo_application", {
        p_id: null,
        p_data: { ...emptyDraft, representative_name: accountName, email: accountEmail },
        p_areas: [],
        p_programs: [],
        p_version: 0,
      });
    }, "Draft application created.");
  }

  function addCustomProgram() {
    const value = customProgram.trim();
    if (value.length < 2 || value.length > 100) {
      setError("Custom program names need 2 to 100 characters.");
      return;
    }
    const canonical = programOptions.find((option) => normalized(option) === normalized(value)) || value;
    if (programs.some((p) => normalized(p) === normalized(canonical))) {
      setCustomProgram("");
      return;
    }
    if (programs.length >= 50) {
      setError("Maximum 50 program areas can be selected.");
      return;
    }
    setPrograms((old) => [...old, canonical].sort((a, b) => a.localeCompare(b)));
    setCustomProgram("");
    setError("");
  }

  function toggleProgram(program: string) {
    setPrograms((old) => {
      const exists = old.some((item) => normalized(item) === normalized(program));
      return exists
        ? old.filter((item) => normalized(item) !== normalized(program))
        : [...old, program].sort((a, b) => a.localeCompare(b));
    });
  }

  async function continueStep() {
    setAttempted((old) => new Set(old).add(step));
    if (step === 0 && !organizationComplete) {
      setError("Complete the required organization details before continuing.");
      return;
    }
    if (step === 1 && !areasComplete) {
      setError("Add at least one operating area before continuing.");
      return;
    }
    if (step === 2 && !programsComplete) {
      setError("Select at least one program area before continuing.");
      return;
    }
    if (step === 3 && !documentsComplete) {
      setError("Upload registration/legal proof and finish any pending document action before continuing.");
      return;
    }
    if (step <= 2 && !(await saveDraft("Draft saved."))) return;
    setError("");
    setStep((old) => Math.min(4, old + 1));
  }

  async function submitApplication() {
    setAttempted(new Set([0, 1, 2, 3, 4]));
    if (!application || !readyToSubmit) {
      setError("Complete every required item in the submission checklist before submitting.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await rpc("submit_partner_ngo_application", { p_id: application.id, p_version: application.version });
      await load(false);
      await onChanged();
      setStep(4);
      setSubmitSuccess(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const filteredPrograms = programOptions.filter((program) => normalized(program).includes(normalized(programSearch)));
  const statusBadgeValue = application?.status === "submitted" ? "under_review" : application?.status || "draft";
  const statusLabel = application?.status === "submitted" ? "Under review" : application ? human(application.status) : "Draft";

  if (loading) return <p role="status">Loading Organization application…</p>;

  if (!application) {
    return (
      <section className="panel detail ngo-application-intro">
        <span className="eyebrow">ORGANIZATION ONBOARDING</span>
        <h2>Apply as a Organization</h2>
        <p>
          Create a verified organization presence on FieldLance, publish field opportunities and manage
          projects after approval. Your personal Field Worker account stays separate from the organization workspace.
          When approved, you become the first Organization Admin for that workspace.
        </p>
        {error && <div className="notice error" role="alert">{error}</div>}
        <button className="primary" disabled={busy} onClick={() => void startNew()}>Start Organization application</button>
      </section>
    );
  }

  return (
    <div className="ngo-application-workspace ngo-application-v2">
      <section className="ngo-application-statusbar" aria-label="Application progress">
        <div>
          <span className="eyebrow">PARTNER Organization APPLICATION</span>
          <strong>{application.organization_name || "Organization application"}</strong>
          <p>Your organization will be activated after FieldLance reviews this application and the required documents.</p>
        </div>
        <div className="ngo-application-status-meta">
          <Badge value={statusBadgeValue} />
          {editable && <span>{completion}% complete · {remaining ? `${remaining} required ${remaining === 1 ? "item" : "items"} remaining` : "ready to submit"}</span>}
          {!editable && application.status === "submitted" && <span>FieldLance review in progress</span>}
          {!editable && application.status !== "submitted" && <span>{statusLabel}</span>}
        </div>
      </section>

      {application.review_note && (
        <div className={application.status === "approved" ? "notice success" : "notice warning"}>
          <strong>FieldLance review:</strong> {application.review_note}
        </div>
      )}
      {error && <div className="notice error" role="alert">{error}</div>}
      {message && <div className="ngo-toast" role="status"><Check size={17}/>{message}</div>}

      <nav className="ngo-application-stepper" aria-label="Organization application steps">
        {applicationSteps.map(([label, description], index) => {
          const complete = index < 4 ? requiredGroups[index] : readyToSubmit;
          const active = step === index;
          return (
            <button
              key={label}
              type="button"
              className={`${active ? "active" : ""}${complete ? " complete" : ""}`}
              aria-current={active ? "step" : undefined}
              disabled={index > highestReachable}
              onClick={() => setStep(index)}
            >
              <span className="ngo-step-number">{complete ? <Check size={15}/> : index + 1}</span>
              <span><strong>{label}</strong><small>{description}</small></span>
            </button>
          );
        })}
      </nav>

      <div className="ngo-step-progress-mobile" aria-live="polite">
        <strong>Step {step + 1} of 5</strong><span>{applicationSteps[step][0]} · {completion}% complete</span>
      </div>

      {step === 0 && (
        <form className="ngo-step-card" onSubmit={(e) => { e.preventDefault(); void continueStep(); }}>
          <div className="ngo-step-heading">
            <div><span className="eyebrow">STEP 1</span><h2>Organization details</h2><p>Tell us how the organization is registered and who is authorized to represent it.</p></div>
            <FileCheck2 aria-hidden="true" />
          </div>

          <PartnerNgoLogoEditor
            applicationId={application.id}
            name={draft.organization_name || "Organization"}
            path={application.logo_path}
            updatedAt={application.logo_updated_at}
            editable={editable}
            onChanged={(path, updatedAt) => setApplication((old) => old ? { ...old, logo_path: path, logo_updated_at: updatedAt } : old)}
          />

          <p className="ngo-required-note"><span>*</span> Required fields</p>
          <div className="ngo-form-grid">
            <Field label="Organization name *">
              <input disabled={!editable} value={draft.organization_name} maxLength={200} autoComplete="organization" onChange={(e) => setDraft({ ...draft, organization_name: e.target.value })} />
              {attempted.has(0) && organizationErrors.organization_name && <small className="field-error">{organizationErrors.organization_name}</small>}
            </Field>
            <Field label="Registration number *">
              <input disabled={!editable} value={draft.registration_number} maxLength={100} onChange={(e) => setDraft({ ...draft, registration_number: e.target.value })} />
              {attempted.has(0) && organizationErrors.registration_number && <small className="field-error">{organizationErrors.registration_number}</small>}
            </Field>
            <Field label="Registration type *">
              <select
                disabled={!editable}
                value={legalOther ? "Other" : registrationTypes.includes(draft.legal_type) ? draft.legal_type : ""}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "Other") {
                    setLegalOther(true);
                    if (registrationTypes.includes(draft.legal_type)) setDraft({ ...draft, legal_type: "" });
                  } else {
                    setLegalOther(false);
                    setDraft({ ...draft, legal_type: value });
                  }
                }}
              >
                <option value="">Choose registration type</option>
                {registrationTypes.map((value) => <option key={value} value={value}>{value}</option>)}
                <option value="Other">Other / specify</option>
              </select>
              <small>Select the legal structure under which the organization is registered.</small>
              {legalOther && <input aria-label="Specify registration type" disabled={!editable} value={draft.legal_type} maxLength={120} placeholder="Specify registration type" onChange={(e) => setDraft({ ...draft, legal_type: e.target.value })} />}
              {attempted.has(0) && organizationErrors.legal_type && <small className="field-error">{organizationErrors.legal_type}</small>}
            </Field>
            <Field label="Representative name *">
              <input disabled={!editable} value={draft.representative_name} maxLength={200} autoComplete="name" onChange={(e) => setDraft({ ...draft, representative_name: e.target.value })} />
              {attempted.has(0) && organizationErrors.representative_name && <small className="field-error">{organizationErrors.representative_name}</small>}
            </Field>
            <Field label="Representative designation *">
              <select
                disabled={!editable}
                value={titleOther ? "Other" : representativeTitles.includes(draft.representative_title) ? draft.representative_title : ""}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "Other") {
                    setTitleOther(true);
                    if (representativeTitles.includes(draft.representative_title)) setDraft({ ...draft, representative_title: "" });
                  } else {
                    setTitleOther(false);
                    setDraft({ ...draft, representative_title: value });
                  }
                }}
              >
                <option value="">Choose designation</option>
                {representativeTitles.map((value) => <option key={value} value={value}>{value}</option>)}
                <option value="Other">Other / specify</option>
              </select>
              <small>Select the role of the person authorized to represent the organization.</small>
              {titleOther && <input aria-label="Specify representative designation" disabled={!editable} value={draft.representative_title} maxLength={120} placeholder="Specify designation" onChange={(e) => setDraft({ ...draft, representative_title: e.target.value })} />}
              {attempted.has(0) && organizationErrors.representative_title && <small className="field-error">{organizationErrors.representative_title}</small>}
            </Field>
            <Field label="Official organization email *">
              <input disabled={!editable} type="email" value={draft.email} maxLength={320} autoComplete="email" onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              {attempted.has(0) && organizationErrors.email && <small className="field-error">{organizationErrors.email}</small>}
            </Field>
            <Field label="Phone number *">
              <input disabled={!editable} type="tel" value={draft.phone} maxLength={40} autoComplete="tel" onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
              {attempted.has(0) && organizationErrors.phone && <small className="field-error">{organizationErrors.phone}</small>}
            </Field>
            <Field label="Website (optional)">
              <input disabled={!editable} type="url" value={draft.website} maxLength={500} placeholder="https://example.org" onChange={(e) => setDraft({ ...draft, website: e.target.value })} />
              {attempted.has(0) && organizationErrors.website && <small className="field-error">{organizationErrors.website}</small>}
            </Field>
          </div>
          <Field label="Registered / main office address *">
            <textarea disabled={!editable} value={draft.address} maxLength={1000} rows={4} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
            {attempted.has(0) && organizationErrors.address && <small className="field-error">{organizationErrors.address}</small>}
          </Field>
          {editable && <StepActions busy={busy} first onSave={() => void saveDraft()} onNext={() => void continueStep()} />}
        </form>
      )}

      {step === 1 && (
        <section className="ngo-step-card">
          <div className="ngo-step-heading">
            <div><span className="eyebrow">STEP 2</span><h2>Operating areas</h2><p>Add the geographic areas where your organization currently works or plans to deliver projects.</p></div>
            <MapPin aria-hidden="true" />
          </div>
          {editable && (
            <div className="ngo-area-builder">
              <AreaSelector rows={geographies} value={candidate} onChange={setCandidate} title="Choose an operating area" disabled={busy} />
              <button type="button" className="secondary" disabled={!canAddArea || busy} onClick={() => setAreas((old) => addOperatingArea(old, candidate, geographies))}>+ Add another area</button>
            </div>
          )}
          <div className="ngo-selected-areas">
            {areas.map((id) => (
              <div className="ngo-area-chip" key={id}>
                <MapPin size={15}/><span>{areaCaption(id, geographies)}</span>
                {editable && <button type="button" aria-label={`Remove ${areaCaption(id, geographies)}`} onClick={() => setAreas((old) => old.filter((x) => x !== id))}><X size={15}/></button>}
              </div>
            ))}
          </div>
          {!areas.length && <div className="ngo-empty-state"><MapPin size={24}/><strong>No operating areas added yet.</strong><span>Add at least one area to continue.</span></div>}
          {attempted.has(1) && !areasComplete && <small className="field-error">At least one operating area is required.</small>}
          {editable && <StepActions busy={busy} onBack={() => setStep(0)} onSave={() => void saveDraft()} onNext={() => void continueStep()} />}
        </section>
      )}

      {step === 2 && (
        <section className="ngo-step-card">
          <div className="ngo-step-heading">
            <div><span className="eyebrow">STEP 3</span><h2>Program areas</h2><p>Select all program areas your organization currently works in. You can also add a custom program area.</p></div>
            <Tags aria-hidden="true" />
          </div>
          <div className="ngo-program-selected" aria-label="Selected program areas">
            {programs.map((program) => (
              <span className="ngo-program-chip" key={program}>{program}{editable && <button type="button" aria-label={`Remove ${program}`} onClick={() => toggleProgram(program)}><X size={14}/></button>}</span>
            ))}
            {!programs.length && <span className="ngo-program-placeholder">No program areas selected yet.</span>}
          </div>
          {editable && (
            <>
              <label className="ngo-program-search">
                <Search size={17}/>
                <input type="search" value={programSearch} placeholder="Search program areas" onChange={(e) => setProgramSearch(e.target.value)} />
              </label>
              <div className="ngo-program-options">
                {filteredPrograms.map((program) => (
                  <label key={program} className={programs.includes(program) ? "selected" : ""}>
                    <input type="checkbox" checked={programs.includes(program)} onChange={() => toggleProgram(program)} />
                    <span>{program}</span>
                  </label>
                ))}
                {!filteredPrograms.length && <p>No standard program area matches your search. Add it as a custom program below.</p>}
              </div>
              <div className="ngo-custom-program">
                <Field label="Other / custom program area">
                  <input value={customProgram} maxLength={100} placeholder="e.g. Legal Aid" onChange={(e) => setCustomProgram(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomProgram(); } }} />
                </Field>
                <button type="button" className="secondary" disabled={customProgram.trim().length < 2} onClick={addCustomProgram}>Add custom program</button>
              </div>
            </>
          )}
          {attempted.has(2) && !programsComplete && <small className="field-error">Select at least one program area.</small>}
          {editable && <StepActions busy={busy} onBack={() => setStep(1)} onSave={() => void saveDraft()} onNext={() => void continueStep()} />}
        </section>
      )}

      {step === 3 && (
        <>
          <PartnerNgoDocuments
            application={application}
            owner={true}
            reviewer={false}
            onChanged={async () => { await onChanged(); }}
            onRowsChanged={setDocuments}
          />
          {attempted.has(3) && !documentsComplete && <small className="field-error">Registration/legal proof is required before review.</small>}
          {editable && <StepActions busy={busy} onBack={() => setStep(2)} onNext={() => void continueStep()} nextLabel="Review application" />}
        </>
      )}

      {step === 4 && (
        <section className="ngo-step-card ngo-review-submit-step">
          <div className="ngo-step-heading">
            <div><span className="eyebrow">STEP 5</span><h2>Review & submit</h2><p>Check the application before sending it to FieldLance. Use Edit to return to any section.</p></div>
            <Send aria-hidden="true" />
          </div>

          <OrganizationReview application={application} draft={draft} areas={areas} programs={programs} documents={documents} geographies={geographies} />

          <div className="ngo-review-edit-links">
            <button type="button" className="link" onClick={() => setStep(0)}>Edit organization details</button>
            <button type="button" className="link" onClick={() => setStep(1)}>Edit operating areas</button>
            <button type="button" className="link" onClick={() => setStep(2)}>Edit programs</button>
            <button type="button" className="link" onClick={() => setStep(3)}>Edit documents</button>
          </div>

          <section className="ngo-readiness-card">
            <div><span className="eyebrow">SUBMISSION READINESS</span><h3>{readyToSubmit ? "Application is ready to submit" : "Complete the remaining required items"}</h3></div>
            <ul>
              <ReadinessItem done={organizationComplete}>Organization details complete</ReadinessItem>
              <ReadinessItem done={areasComplete}>At least one operating area selected</ReadinessItem>
              <ReadinessItem done={programsComplete}>Program areas selected</ReadinessItem>
              <ReadinessItem done={documentsComplete}>Registration/legal proof uploaded</ReadinessItem>
            </ul>
          </section>

          {application.status === "approved" && (
            <div className="notice success ngo-application-approved">
              <div><strong>Your Organization is active.</strong><p>Open the organization workspace to manage projects, recruitment and operations.</p></div>
              {application.organization_id && <button className="primary" type="button" onClick={() => onOpenOrganization?.(application.organization_id!)}>Open Organization workspace</button>}
            </div>
          )}
          {application.status === "submitted" && (
            <div className="ngo-under-review-card"><Check size={20}/><div><strong>Application submitted</strong><p>FieldLance is reviewing your organization details and supporting documents. We’ll notify you if changes are requested or when the application is approved.</p></div></div>
          )}

          {editable && (
            <div className="ngo-submit-actions">
              <button type="button" className="secondary" disabled={busy} onClick={() => setStep(3)}><ChevronLeft size={16}/> Back</button>
              <button type="button" className="secondary" disabled={busy} onClick={() => void saveDraft()}>Save draft</button>
              <button type="button" className="primary" disabled={busy || !readyToSubmit} onClick={() => void submitApplication()}><Send size={16}/> Submit application</button>
              <button type="button" className="link danger-link" disabled={busy} onClick={() => window.confirm("Withdraw this application?") && void runAction(() => rpc("withdraw_partner_ngo_application", { p_id: application.id, p_version: application.version }), "Application withdrawn.")}>Withdraw</button>
            </div>
          )}
          {application.status === "submitted" && (
            <div className="ngo-submit-actions">
              <button type="button" className="secondary" disabled={busy} onClick={() => window.confirm("Withdraw this submitted application?") && void runAction(() => rpc("withdraw_partner_ngo_application", { p_id: application.id, p_version: application.version }), "Application withdrawn.")}>Withdraw application</button>
            </div>
          )}
          {["rejected", "withdrawn"].includes(application.status) && (
            <div className="ngo-submit-actions"><button type="button" className="secondary" disabled={busy} onClick={() => void startNew()}>Start a new application</button></div>
          )}
        </section>
      )}

      {submitSuccess && (
        <div className="ngo-success-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setSubmitSuccess(false); }}>
          <section className="ngo-success-modal" role="dialog" aria-modal="true" aria-labelledby="ngo-submit-success-title">
            <div className="ngo-success-icon"><Check size={28}/></div>
            <span className="eyebrow">SUBMITTED TO FieldLance</span>
            <h2 id="ngo-submit-success-title">Application submitted successfully</h2>
            <p>Your Organization application has been submitted to FieldLance for review. We’ll notify you when it is reviewed or if changes are requested.</p>
            <div className="ngo-modal-status"><span>Status</span><strong>Under review</strong></div>
            <div className="ngo-success-actions">
              <button className="secondary" type="button" onClick={() => setSubmitSuccess(false)}>View application</button>
              <button className="primary" type="button" onClick={() => { setSubmitSuccess(false); onBackToDashboard?.(); }}>Back to dashboard</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function ReadinessItem({ done, children }: { done: boolean; children: string }) {
  return <li className={done ? "ready" : "missing"}><span>{done ? <Check size={14}/> : <X size={14}/>}</span>{children}</li>;
}

function StepActions({
  busy,
  first = false,
  onBack,
  onSave,
  onNext,
  nextLabel = "Save & continue",
}: {
  busy: boolean;
  first?: boolean;
  onBack?: () => void;
  onSave?: () => void;
  onNext: () => void;
  nextLabel?: string;
}) {
  return (
    <div className="ngo-step-actions">
      {!first && <button type="button" className="secondary" disabled={busy} onClick={onBack}><ChevronLeft size={16}/> Back</button>}
      <span className="ngo-step-actions-spacer" />
      {onSave && <button type="button" className="secondary" disabled={busy} onClick={onSave}>Save draft</button>}
      <button type="button" className="primary" disabled={busy} onClick={onNext}>{nextLabel}<ChevronRight size={16}/></button>
    </div>
  );
}
