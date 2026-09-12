import { useEffect, useState, type FormEvent } from "react";
import { db, rpc } from "../../lib/supabase/client";
type Row =
  import("../../lib/supabase/database.types").Database["public"]["Tables"]["volunteer_documents"]["Row"];
export async function validateFile(file: File) {
  if (file.size < 1 || file.size > 5242880)
    throw Error("Choose a file up to 5 MiB.");
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const type =
    bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70
      ? "application/pdf"
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        ? "image/jpeg"
        : bytes[0] === 137 &&
            bytes[1] === 80 &&
            bytes[2] === 78 &&
            bytes[3] === 71 &&
            bytes[4] === 13 &&
            bytes[5] === 10 &&
            bytes[6] === 26 &&
            bytes[7] === 10
          ? "image/png"
          : null;
  if (!type) throw Error("Choose a PDF, JPG or PNG file.");
  return type;
}
export function Documents({
  userId,
  owner,
  reviewer,
  onChanged,
}: {
  userId: string;
  owner: boolean;
  reviewer: boolean;
  onChanged: () => Promise<void>;
}) {
  const [rows, setRows] = useState<Row[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [loading, setLoading] = useState(true);
  async function load() {
    const r = await db!
      .from("volunteer_documents")
      .select("*")
      .eq("user_id", userId)
      .neq("state", "deleted")
      .order("created_at", { ascending: false });
    if (r.error) throw r.error;
    setRows(r.data || []);
  }
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setRows([]);
    setError("");
    db!
      .from("volunteer_documents")
      .select("*")
      .eq("user_id", userId)
      .neq("state", "deleted")
      .order("created_at", { ascending: false })
      .then((r) => {
        if (alive) {
          if (r.error) setError(r.error.message);
          else setRows(r.data || []);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [userId]);
  async function action(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await fn();
      await load();
      await onChanged();
      setSuccess(message);
    } catch (e) {
      setError((e as Error).message);
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form),
      file = f.get("file") as File;
    await action(async () => {
      const type = await validateFile(file);
      const d = await rpc("begin_document_upload", {
        p_name: file.name,
        p_type: type,
        p_bytes: file.size,
        p_kind: String(f.get("kind")),
      });
      if (
        !d ||
        typeof d !== "object" ||
        Array.isArray(d) ||
        typeof d.object_path !== "string" ||
        typeof d.id !== "string"
      )
        throw Error("Invalid document reservation response");
      const uploaded = await db!.storage
        .from("poem-private-documents")
        .upload(d.object_path, file, {
          contentType: type,
          upsert: false,
          cacheControl: "0",
        });
      if (uploaded.error) throw uploaded.error;
      await rpc("finish_document_upload", { p_id: d.id });
      form.reset();
    }, "Document uploaded for POEM review. Profile verification has been refreshed.");
  }
  async function download(d: Row) {
    await action(async () => {
      const path = await rpc("document_download_path", { p_id: d.id });
      const r = await db!.storage.from("poem-private-documents").download(path);
      if (r.error) throw r.error;
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = d.file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "Download requested.");
  }
  async function remove(d: Row) {
    if (
      !window.confirm(
        `Remove ${d.file_name}? The file bytes will be deleted and profile approval will be reset. Document history remains.`,
      )
    )
      return;
    await action(async () => {
      const path = await rpc("begin_document_delete", { p_id: d.id });
      const r = await db!.storage.from("poem-private-documents").remove([path]);
      if (r.error) throw r.error;
      await rpc("finish_document_delete", { p_id: d.id });
    }, "Document removed. Relevant profile approval has been reset.");
  }
  return (
    <section className="panel detail">
      <h2>Private documents</h2>
      <p>
        Visible only to the volunteer and authorized POEM admins. NGO profile
        sharing does not include these files. PDF, JPG or PNG; maximum 5 MiB
        each, 20 current files.
      </p>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="notice success" role="status">
          {success}
        </div>
      )}
      {owner && (
        <form className="upload-form" onSubmit={upload}>
          <label className="field">
            Document type
            <select name="kind">
              {["cv", "education", "training", "reference", "identity"].map(
                (k) => (
                  <option key={k}>{k}</option>
                ),
              )}
            </select>
          </label>
          <label className="field">
            Choose file
            <input
              type="file"
              name="file"
              required
              accept=".pdf,.jpg,.jpeg,.png"
            />
          </label>
          <button disabled={busy} className="primary">
            {busy ? "Please wait…" : "Upload document"}
          </button>
        </form>
      )}
      {loading && <p role="status">Loading documents…</p>}
      {rows.map((d) => (
        <article className="document-row" key={d.id}>
          <div className="document-heading">
            <div>
              <strong>{d.file_name}</strong>
              <small>
                {d.kind} · {(d.byte_size / 1024).toFixed(0)} KiB · {d.state}
              </small>
            </div>
            <span
              className={
                "badge " +
                (d.review_status === "accepted"
                  ? "verified"
                  : d.review_status === "rejected"
                    ? "correction_required"
                    : "pending")
              }
            >
              {d.review_status}
            </span>
          </div>
          {d.review_note && <p>POEM review: {d.review_note}</p>}
          <div className="document-actions">
            {d.state === "ready" && (
              <button
                disabled={busy}
                className="secondary"
                onClick={() => download(d)}
              >
                Download
              </button>
            )}
            {owner && d.state === "uploading" && (
              <button
                disabled={busy}
                className="secondary"
                onClick={() =>
                  action(
                    () => rpc("finish_document_upload", { p_id: d.id }),
                    "Upload finalized.",
                  )
                }
              >
                Finalize uploaded file
              </button>
            )}
            {owner && (
              <button
                disabled={busy}
                className="secondary"
                onClick={() => remove(d)}
              >
                {d.state === "deleting" ? "Retry removal" : "Remove file"}
              </button>
            )}
          </div>
          {reviewer && d.state === "ready" && (
            <form
              className="document-review"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                action(
                  () =>
                    rpc("review_document", {
                      p_id: d.id,
                      p_status: String(f.get("status")),
                      p_note: String(f.get("note")),
                      p_version: d.version,
                    }),
                  "Document review saved.",
                );
              }}
            >
              <label className="field">
                Review decision
                <select name="status">
                  <option value="accepted">Accept document</option>
                  <option value="rejected">Reject / replace required</option>
                </select>
              </label>
              <label className="field">
                Review note
                <input name="note" minLength={3} maxLength={2000} required />
              </label>
              <button disabled={busy} className="primary">
                Save document review
              </button>
            </form>
          )}
        </article>
      ))}
      {!loading && !rows.length && (
        <div className="empty">
          <h3>No documents uploaded</h3>
          <p>
            Upload supporting evidence if POEM requests it. Identity documents
            are optional.
          </p>
        </div>
      )}
      <p className="fine">
        An incomplete upload can be finalized if its bytes were saved, or
        removed and uploaded again. Downloads are untrusted attachments;
        server-side malware scanning is not part of this release.
      </p>
    </section>
  );
}
