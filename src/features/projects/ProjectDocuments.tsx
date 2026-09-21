import { useEffect, useState, type FormEvent } from "react";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { db, rpc } from "../../lib/supabase/client";
import { ActionDialog } from "../../components/ui/ActionDialog";
import { human } from "../../shared/ui/FormFields";

type ProjectDocument = {
  id: string;
  project_id: string;
  organization_id: string;
  uploaded_by: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  object_path: string;
  category: string;
  note: string;
  state: string;
  version: number;
  created_at: string;
};

const allowed = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
]);

export function ProjectDocuments({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const [rows, setRows] = useState<ProjectDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ProjectDocument | null>(null);

  async function load() {
    const result = await db!.from("project_documents").select("*").eq("project_id", projectId).neq("state", "deleted").order("created_at", { ascending: false }).limit(100);
    if (result.error) throw result.error;
    setRows((result.data || []) as ProjectDocument[]);
  }

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    db!.from("project_documents").select("*").eq("project_id", projectId).neq("state", "deleted").order("created_at", { ascending: false }).limit(100).then((result) => {
      if (!live) return;
      if (result.error) setError(result.error.message);
      else setRows((result.data || []) as ProjectDocument[]);
      setLoading(false);
    });
    return () => { live = false; };
  }, [projectId]);

  async function action(fn: () => Promise<unknown>, success: string) {
    setBusy(true); setError(""); setMessage("");
    try { await fn(); await load(); setMessage(success); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file") as File;
    if (!file || !allowed.has(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) {
      setError("Use PDF, JPG, PNG, DOCX, XLSX or CSV files up to 10 MiB.");
      return;
    }
    await action(async () => {
      const reserved = await rpc("reserve_project_document", {
        p_project: projectId,
        p_name: file.name,
        p_type: file.type,
        p_bytes: file.size,
        p_category: String(data.get("category") || "other"),
        p_note: String(data.get("note") || ""),
      }) as unknown as ProjectDocument;
      const uploaded = await db!.storage.from("fieldlance-project-documents").upload(reserved.object_path, file, { contentType: file.type, upsert: false, cacheControl: "0" });
      if (uploaded.error) throw uploaded.error;
      await rpc("finish_project_document", { p_id: reserved.id });
      form.reset();
    }, "Project document uploaded.");
  }

  async function download(row: ProjectDocument) {
    await action(async () => {
      const path = await rpc("project_document_download_path", { p_id: row.id });
      const file = await db!.storage.from("fieldlance-project-documents").download(path);
      if (file.error) throw file.error;
      const url = URL.createObjectURL(file.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = row.file_name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "Download requested.");
  }

  async function remove(row: ProjectDocument) {
    await action(async () => {
      const path = await rpc("begin_project_document_delete", { p_id: row.id });
      const removed = await db!.storage.from("fieldlance-project-documents").remove([path]);
      if (removed.error) throw removed.error;
      await rpc("finish_project_document_delete", { p_id: row.id });
    }, "Project document removed. Audit history was retained.");
    setPendingDelete(null);
  }

  return <section className="project-documents">
    <section className="project-section-header"><div><span className="eyebrow">PROJECT FILES</span><h2>Documents</h2><p>Project-scoped working files and evidence. Survey response attachments remain in their existing response evidence store.</p></div></section>
    {error && <p className="notice error" role="alert">{error}</p>}
    {message && <p className="notice success" role="status">{message}</p>}
    {canManage && <form className="project-document-upload" onSubmit={upload}>
      <div className="form-grid">
        <label className="field">Category<select name="category" defaultValue="project_brief"><option value="project_brief">Project brief / TOR</option><option value="questionnaire">Questionnaire support</option><option value="training">Training material</option><option value="consent">Consent material</option><option value="field_instruction">Field instructions</option><option value="finance">Finance support</option><option value="evidence">Project evidence</option><option value="report">Completion / project report</option><option value="other">Other</option></select></label>
        <label className="field">Choose file<input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.csv" required /></label>
      </div>
      <label className="field">Note <span className="optional">optional</span><textarea name="note" maxLength={1000} placeholder="What is this file for?" /></label>
      <button className="primary" disabled={busy}><Upload size={16}/>{busy ? "Please wait…" : "Upload project document"}</button>
      <p className="fine">PDF, JPG, PNG, DOCX, XLSX or CSV · maximum 10 MiB · up to 100 current files per project.</p>
    </form>}
    {loading && <p role="status">Loading project documents…</p>}
    <div className="project-document-list">
      {rows.map((row) => <article key={row.id} className="project-document-card">
        <div className="project-document-icon"><FileText size={20}/></div>
        <div className="project-document-copy"><strong>{row.file_name}</strong><p>{human(row.category)} · {(row.byte_size / 1024).toFixed(0)} KiB · {new Date(row.created_at).toLocaleString()}</p>{row.note && <small>{row.note}</small>}{row.state !== "ready" && <span className="badge pending">{human(row.state)}</span>}</div>
        <div className="project-document-actions">{row.state === "ready" && <button type="button" className="secondary" disabled={busy} onClick={() => void download(row)}><Download size={15}/>Download</button>}{canManage && row.state === "uploading" && <button type="button" className="secondary" disabled={busy} onClick={() => void action(() => rpc("finish_project_document", { p_id: row.id }), "Upload finalized.")}>Finalize</button>}{canManage && <button type="button" className="secondary danger-link" disabled={busy} onClick={() => setPendingDelete(row)}><Trash2 size={15}/>Remove</button>}</div>
      </article>)}
    </div>
    {!loading && !rows.length && <div className="empty"><FileText/><h3>No project documents yet</h3><p>{canManage ? "Upload the project brief, field instructions, consent support or completion evidence here." : "Project managers have not shared project documents yet."}</p></div>}
    <ActionDialog open={Boolean(pendingDelete)} title="Remove project document?" description={pendingDelete ? `${pendingDelete.file_name} will be removed from secure storage. The audit record remains.` : ""} confirmLabel="Remove file" danger busy={busy} onCancel={() => setPendingDelete(null)} onConfirm={() => pendingDelete ? remove(pendingDelete) : undefined}/>
  </section>;
}
