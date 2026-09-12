import { useEffect, useState, type FormEvent } from "react";
import { db, rpc } from "../../lib/supabase/client";
import { Experience, Org, text } from "../workforce/model";
export function ExperiencePanel({
  userId,
  organization,
  orgs,
  readonly = false,
}: {
  userId: string;
  organization: string | null;
  orgs: Org[];
  readonly?: boolean;
}) {
  const [rows, setRows] = useState<Experience[]>([]),
    [editing, setEditing] = useState<Experience | null>(null),
    [create, setCreate] = useState(false),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    let live = true;
    setBusy(true);
    setRows([]);
    setError("");
    let q = db!
      .from("volunteer_experiences")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id")
      .range(page * 50, page * 50 + 50);
    q = organization
      ? q.eq("organization_id", organization).neq("status", "unverified")
      : q.eq("user_id", userId);
    if (readonly) q = q.eq("status", "verified");
    q.then((r) => {
      if (!live) return;
      if (r.error) setError(r.error.message);
      else {
        setRows((r.data || []).slice(0, 50));
        setMore((r.data || []).length > 50);
      }
      setBusy(false);
    });
    return () => {
      live = false;
    };
  }, [userId, organization, readonly, page, revision]);
  async function act(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setEditing(null);
      setCreate(false);
      setMessage(success);
      setRevision((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    act(
      () =>
        rpc("save_experience", {
          p_id: editing?.id || null,
          p_org: editing?.organization_id || text(f, "org"),
          p_role: text(f, "role"),
          p_start: text(f, "start"),
          p_end: text(f, "end") || null,
          p_description: text(f, "description"),
          p_request: f.get("request") === "on",
          p_version: editing?.version || 0,
        }),
      "Experience saved. Any previous verification has been reset.",
    );
  }
  return (
    <section className="panel detail">
      <div className="panel-title">
        <h2>
          {readonly
            ? "NGO-confirmed experience"
            : organization
              ? "Experience confirmation requests"
              : "My work experience"}
        </h2>
        {!readonly && !organization && (
          <button
            className="primary"
            onClick={() => {
              setEditing(null);
              setCreate(true);
            }}
          >
            Add experience
          </button>
        )}
      </div>
      <p>
        {organization
          ? "Confirm only work your NGO can substantiate. This does not verify the complete volunteer profile."
          : readonly
            ? "These entries were confirmed by their respective NGOs."
            : "Requesting confirmation shares this entry and your name with the selected NGO. It does not grant access to your CV or private documents."}
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {(create || editing) && (
        <form key={editing?.id || "new"} onSubmit={save}>
          <div className="form-grid">
            <label className="field">
              NGO
              <select
                name="org"
                required
                disabled={!!editing}
                defaultValue={editing?.organization_id || ""}
              >
                <option value="">Choose NGO</option>
                {orgs
                  .filter(
                    (o) =>
                      o.status === "active" ||
                      o.id === editing?.organization_id,
                  )
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              Role
              <input
                name="role"
                minLength={2}
                maxLength={120}
                required
                defaultValue={editing?.role_title}
              />
            </label>
            <label className="field">
              Start date
              <input
                name="start"
                type="date"
                required
                defaultValue={editing?.start_date}
              />
            </label>
            <label className="field">
              End date (blank if ongoing)
              <input
                name="end"
                type="date"
                defaultValue={editing?.end_date || ""}
              />
            </label>
          </div>
          <label className="field">
            Work performed
            <textarea
              name="description"
              minLength={10}
              maxLength={2000}
              required
              defaultValue={editing?.description}
            />
          </label>
          <label className="checklabel">
            <input type="checkbox" name="request" />
            Request NGO confirmation and share this entry with its admins
          </label>
          <div className="actions">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setEditing(null);
                setCreate(false);
              }}
            >
              Cancel
            </button>
            <button className="primary" disabled={busy}>
              Save experience
            </button>
          </div>
        </form>
      )}
      {busy && <p role="status">Loading…</p>}
      {rows.map((e) => (
        <article className="document-row" key={e.id}>
          <div className="document-heading">
            <h3>{e.role_title}</h3>
            <span
              className={
                "badge " + (e.status === "verified" ? "verified" : "pending")
              }
            >
              {e.status === "verified" ? "NGO-confirmed" : e.status}
            </span>
          </div>
          <p>
            {organization
              ? e.volunteer_name
              : orgs.find((o) => o.id === e.organization_id)?.name ||
                `NGO ${e.organization_id}`}{" "}
            · {e.start_date} – {e.end_date || "Present"}
          </p>
          <p className="preserve-lines">{e.description}</p>
          {e.reviewed_at && (
            <p>
              Confirmed/reviewed by NGO{" "}
              {orgs.find((o) => o.id === e.organization_id)?.name ||
                e.organization_id}{" "}
              · {new Date(e.reviewed_at).toLocaleDateString()}
            </p>
          )}
          {!readonly && e.review_note && <p>Review: {e.review_note}</p>}
          {!readonly && !organization && (
            <button
              className="secondary"
              onClick={() => {
                setEditing(e);
                setCreate(false);
              }}
            >
              Edit / request again
            </button>
          )}
          {!readonly &&
            organization &&
            e.status === "pending" &&
            e.user_id !== userId && (
              <form
                className="review"
                onSubmit={(event) => {
                  event.preventDefault();
                  const f = new FormData(event.currentTarget);
                  act(
                    () =>
                      rpc("review_experience", {
                        p_id: e.id,
                        p_status: text(f, "status"),
                        p_note: text(f, "note"),
                        p_version: e.version,
                      }),
                    "Experience decision saved.",
                  );
                }}
              >
                <label className="field">
                  Decision
                  <select name="status">
                    <option value="verified">Confirm experience</option>
                    <option value="rejected">Reject claim</option>
                  </select>
                </label>
                <label className="field">
                  Reason / checks performed
                  <textarea
                    name="note"
                    required
                    minLength={3}
                    maxLength={2000}
                  />
                </label>
                <button className="primary" disabled={busy}>
                  Save decision
                </button>
              </form>
            )}
        </article>
      ))}
      {!busy && !rows.length && <p>No experience entries on this page.</p>}
      <div className="actions">
        <button
          className="secondary"
          disabled={busy || !page}
          onClick={() => setPage((n) => n - 1)}
        >
          Previous
        </button>
        <button
          className="secondary"
          disabled={busy || !more}
          onClick={() => setPage((n) => n + 1)}
        >
          Next 50
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => setRevision((n) => n + 1)}
        >
          Refresh
        </button>
      </div>
    </section>
  );
}
