import { useEffect, useState, type FormEvent } from "react";
import { db, rpc } from "../../lib/supabase/client";
import { Experience, Org, text } from "../workforce/model";

type PlatformExperience = {
  id: string;
  organization_name: string;
  project_title: string;
  field_label: string;
  project_area: string;
  field_areas: string[];
  role_title: string;
  workflow_status: "in_progress" | "completed" | "cancelled" | "recorded";
  verified: boolean;
  verification_basis: string;
  source_kind: string;
  start_date: string;
  end_date: string | null;
  last_activity_on: string | null;
  submitted_surveys: number;
  approved_surveys: number;
  rejected_surveys: number;
  correction_required_surveys: number;
  pending_review_surveys: number;
  reviewed_surveys: number;
};
type PlatformExperiencePage = { rows: PlatformExperience[]; total: number; page: number; page_size: number };
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
    [roleChoice, setRoleChoice] = useState(""),
    [create, setCreate] = useState(false),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [platformRows, setPlatformRows] = useState<PlatformExperience[]>([]),
    [platformPage, setPlatformPage] = useState(0),
    [platformMore, setPlatformMore] = useState(false),
    [platformBusy, setPlatformBusy] = useState(false);
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
  useEffect(() => {
    if (organization) {
      setPlatformRows([]);
      setPlatformMore(false);
      return;
    }
    let live = true;
    setPlatformBusy(true);
    rpc("work_experience_history", { p_user: userId, p_page: platformPage })
      .then((data) => {
        if (!live) return;
        const pageData = data as unknown as PlatformExperiencePage;
        setPlatformRows(pageData.rows || []);
        setPlatformMore((pageData.page + 1) * pageData.page_size < pageData.total);
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      })
      .finally(() => {
        if (live) setPlatformBusy(false);
      });
    return () => {
      live = false;
    };
  }, [userId, organization, platformPage, revision]);
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
    const role = roleChoice === "Other" ? text(f, "role_other") : roleChoice;
    act(
      () =>
        rpc("save_experience", {
          p_id: editing?.id || null,
          p_org: editing?.organization_id || text(f, "org"),
          p_role: role,
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
            ? "Work experience"
            : organization
              ? "Experience confirmation requests"
              : "My work experience"}
        </h2>
        {!readonly && !organization && (
          <button
            className="primary"
            onClick={() => {
              setEditing(null);
              setRoleChoice("");
              setCreate(true);
            }}
          >
            Add previous experience
          </button>
        )}
      </div>
      <p>
        {organization
          ? "Confirm only external or previous work your NGO can substantiate. FieldLance project work is recorded automatically from platform evidence."
          : readonly
            ? "FieldLance-recorded field work is shown separately from NGO-confirmed previous or external experience."
            : "FieldLance survey work updates automatically from your project assignments and reviewed survey responses. Add previous or external work separately below."}
      </p>
      {!organization && (
        <div className="experience-platform">
          <div className="panel-title">
            <div>
              <h3>FieldLance verified work</h3>
              <p>Live project history from FieldLance assignments and survey-review evidence. These records cannot be edited manually.</p>
            </div>
          </div>
          {platformBusy && <p role="status">Loading FieldLance work history…</p>}
          {platformRows.map((e) => {
            const statusLabel = e.workflow_status === "completed"
              ? "FieldLance verified"
              : e.verified
                ? "FieldLance verified activity"
                : e.workflow_status === "in_progress"
                  ? "In progress"
                  : e.workflow_status === "cancelled"
                    ? "Recorded history"
                    : "FieldLance recorded";
            return (
              <article className="document-row" key={`poem-${e.id}`}>
                <div className="document-heading">
                  <h3>{e.role_title || "Field Surveyor"}</h3>
                  <span className={"badge " + (e.verified ? "verified" : "pending")}>{statusLabel}</span>
                </div>
                <p><strong>{e.organization_name}</strong> · {e.project_title}</p>
                <p>Survey field: {e.field_label} · Project area: {e.project_area}</p>
                {Array.isArray(e.field_areas) && e.field_areas.length > 0 && (
                  <p>Recorded field areas: {e.field_areas.join(" · ")}</p>
                )}
                <p>{e.start_date} – {e.end_date || (e.workflow_status === "in_progress" ? "Present" : e.last_activity_on || "Recorded")}</p>
                <div className="stats compact-stats">
                  <div><small>Submitted</small><strong>{e.submitted_surveys}</strong></div>
                  <div><small>Accepted</small><strong>{e.approved_surveys}</strong></div>
                  <div><small>Correction</small><strong>{e.correction_required_surveys}</strong></div>
                  <div><small>Rejected</small><strong>{e.rejected_surveys}</strong></div>
                  <div><small>Pending review</small><strong>{e.pending_review_surveys}</strong></div>
                </div>
              </article>
            );
          })}
          {!platformBusy && !platformRows.length && <p>No FieldLance project work recorded yet.</p>}
          <div className="actions">
            <button className="secondary" disabled={platformBusy || !platformPage} onClick={() => setPlatformPage((n) => n - 1)}>Previous FieldLance work</button>
            <button className="secondary" disabled={platformBusy || !platformMore} onClick={() => setPlatformPage((n) => n + 1)}>Next 50 FieldLance projects</button>
          </div>
          <hr />
          <h3>Previous / external experience</h3>
          <p>{readonly ? "Entries below were separately confirmed by their respective NGOs." : "Add experience completed outside FieldLance, then optionally request confirmation from that NGO."}</p>
        </div>
      )}
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
              <select
                name="role_choice"
                required
                value={roleChoice || ((editing?.role_title && ["Field Surveyor", "Volunteer", "Enumerator", "Supervisor", "Team Lead", "Data Entry Operator", "Community Mobilizer", "Monitoring & Evaluation", "Distribution Volunteer"].includes(editing.role_title)) ? editing.role_title : editing?.role_title ? "Other" : "")}
                onChange={(e) => setRoleChoice(e.target.value)}
              >
                <option value="">Choose role</option>
                {["Field Surveyor", "Volunteer", "Enumerator", "Supervisor", "Team Lead", "Data Entry Operator", "Community Mobilizer", "Monitoring & Evaluation", "Distribution Volunteer"].map((role) => <option key={role} value={role}>{role}</option>)}
                <option value="Other">Other</option>
              </select>
            </label>
            {(roleChoice === "Other" || (!roleChoice && editing?.role_title && !["Field Surveyor", "Volunteer", "Enumerator", "Supervisor", "Team Lead", "Data Entry Operator", "Community Mobilizer", "Monitoring & Evaluation", "Distribution Volunteer"].includes(editing.role_title))) && (
              <label className="field">
                Other role
                <input name="role_other" minLength={2} maxLength={120} required defaultValue={editing?.role_title || ""} />
              </label>
            )}
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
                setRoleChoice(["Field Surveyor", "Volunteer", "Enumerator", "Supervisor", "Team Lead", "Data Entry Operator", "Community Mobilizer", "Monitoring & Evaluation", "Distribution Volunteer"].includes(e.role_title) ? e.role_title : "Other");
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
