import { useEffect, useMemo, useState } from "react";
import { db, rpc } from "../../lib/supabase/client";
import { type Database } from "../../lib/supabase/database.types";
import { AreaSelector } from "../geography/AreaSelector";
import { selectableArea } from "../geography/areaSelection";
import { geographyPath, type Geo } from "../geography/model";
import type { Org, Template } from "./model";

type Draft = Database["public"]["Tables"]["survey_project_drafts"]["Row"];
type ReviewEvent = Database["public"]["Tables"]["survey_project_review_events"]["Row"];
type Decision = "changes_requested" | "rejected" | "approved";

const statusLabel = (value: string) => value.replaceAll("_", " ");
const editableStatus = (value: string) => value === "draft" || value === "changes_requested";

function blankState() {
  return {
    id: String(crypto.randomUUID()),
    version: 0,
    title: "",
    templateId: "",
    geographyId: null as string | null,
    target: "",
    startDate: "",
    endDate: "",
    purpose: "",
    consentVersion: "v1",
    consentNotice: "",
  };
}

export function SurveyProjectDrafts({
  organization,
  manage,
  orgs,
  geographies,
  onChanged,
}: {
  organization: string | null;
  manage: boolean;
  orgs: Org[];
  geographies: Geo[];
  onChanged: () => void;
}) {
  const ngoMode = Boolean(organization && !manage);
  const [drafts, setDrafts] = useState<Draft[]>([]),
    [queue, setQueue] = useState<Draft[]>([]),
    [events, setEvents] = useState<ReviewEvent[]>([]),
    [templates, setTemplates] = useState<Template[]>([]),
    [editor, setEditor] = useState(blankState),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [reviewNotes, setReviewNotes] = useState<Record<string, string>>({}),
    [rev, setRev] = useState(0);

  const eventsByDraft = useMemo(() => {
    const grouped = new Map<string, ReviewEvent[]>();
    for (const event of events) {
      const list = grouped.get(event.draft_id) || [];
      list.push(event);
      grouped.set(event.draft_id, list);
    }
    return grouped;
  }, [events]);

  useEffect(() => {
    let live = true;
    async function load() {
      const eventRequest = db!
        .from("survey_project_review_events")
        .select("*")
        .order("created_at")
        .limit(500);
      const eventResult = await eventRequest;
      if (!live) return;
      if (eventResult.error) setError(eventResult.error.message);
      else setEvents(eventResult.data || []);

      if (ngoMode) {
        const [draftResult, templateResult] = await Promise.all([
          db!
            .from("survey_project_drafts")
            .select("*")
            .eq("organization_id", organization!)
            .order("updated_at", { ascending: false })
            .limit(100),
          db!
            .from("survey_templates")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(1000),
        ]);
        if (!live) return;
        if (draftResult.error) setError(draftResult.error.message);
        else setDrafts(draftResult.data || []);
        if (templateResult.error) setError(templateResult.error.message);
        else {
          setTemplates(
            (templateResult.data || []).filter(
              (template) => template.organization_id === null || template.organization_id === organization,
            ),
          );
        }
        setQueue([]);
      } else if (manage) {
        const [result, templateResult] = await Promise.all([
          db!
            .from("survey_project_drafts")
            .select("*")
            .eq("review_status", "submitted")
            .order("submitted_at", { ascending: true })
            .limit(100),
          db!
            .from("survey_templates")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(1000),
        ]);
        if (!live) return;
        if (result.error) setError(result.error.message);
        else setQueue(result.data || []);
        if (templateResult.error) setError(templateResult.error.message);
        else setTemplates(templateResult.data || []);
        setDrafts([]);
      }
    }
    void load();
    return () => {
      live = false;
    };
  }, [ngoMode, manage, organization, rev]);

  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty]);

  function resetEditor() {
    setEditor(blankState());
    setDirty(false);
    setError("");
    setMessage("");
  }

  function openDraft(draft: Draft) {
    if (dirty && !window.confirm("Discard unsaved changes and open this project draft?")) return;
    setEditor({
      id: draft.id,
      version: draft.version,
      title: draft.title,
      templateId: draft.template_id || "",
      geographyId: draft.geography_id,
      target: draft.target == null ? "" : String(draft.target),
      startDate: draft.start_date || "",
      endDate: draft.end_date || "",
      purpose: draft.purpose,
      consentVersion: draft.consent_version,
      consentNotice: draft.consent_notice,
    });
    setDirty(false);
    setError("");
    setMessage("");
  }

  function update<K extends keyof ReturnType<typeof blankState>>(key: K, value: ReturnType<typeof blankState>[K]) {
    setEditor((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  async function saveDraft() {
    if (!ngoMode || !organization) return;
    if (editor.geographyId && !selectableArea(editor.geographyId, geographies)) {
      setError("Choose an active collection area or clear the area before saving this draft.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const version = await rpc("save_organization_project_draft", {
        p_id: editor.id,
        p_organization: organization,
        p_title: editor.title,
        p_template: editor.templateId || null,
        p_geography: editor.geographyId,
        p_target: editor.target ? Number(editor.target) : null,
        p_start: editor.startDate || null,
        p_end: editor.endDate || null,
        p_purpose: editor.purpose,
        p_consent_version: editor.consentVersion,
        p_consent_notice: editor.consentNotice,
        p_version: editor.version,
      });
      setEditor((current) => ({ ...current, version }));
      setDirty(false);
      setMessage("Project draft saved. It remains non-operational until FieldLance approves it.");
      setRev((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitDraft() {
    if (!ngoMode) return;
    if (dirty || !editor.version) {
      setError("Save this project draft before submitting it to FieldLance.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await rpc("submit_project_draft", { p_id: editor.id, p_version: editor.version });
      setMessage("Project submitted to FieldLance. This revision is locked while it is under review.");
      resetEditor();
      setRev((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reviewDraft(draft: Draft, decision: Decision) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const project = await rpc("review_project_draft", {
        p_id: draft.id,
        p_decision: decision,
        p_note: reviewNotes[draft.id] || "",
        p_version: draft.version,
      });
      setMessage(
        decision === "approved"
          ? `Project approved${project ? ` and activated (${project})` : ""}.`
          : decision === "rejected"
            ? "Project rejected. The decision remains in review history."
            : "Changes requested. The NGO can edit and resubmit this project draft.",
      );
      setReviewNotes((current) => ({ ...current, [draft.id]: "" }));
      setRev((n) => n + 1);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!ngoMode && !manage) return null;

  return (
    <section className="project-self-service" aria-label={ngoMode ? "NGO project drafts" : "NGO project review queue"}>
      <div className="panel-title">
        <div>
          <h3>{ngoMode ? "Project drafts" : "NGO project review queue"}</h3>
          <p>
            {ngoMode
              ? "Draft and submit a project using a FieldLance library template or your NGO's approved template. Only FieldLance approval creates an active operational project."
              : "Review submitted NGO project envelopes. Approval atomically materializes the existing operational survey project; no parallel project system is created."}
          </p>
        </div>
        {ngoMode && <button type="button" disabled={busy} onClick={resetEditor}>New project draft</button>}
      </div>

      {error && <p className="notice error" role="alert">{error}</p>}
      {message && <p className="notice success" role="status">{message}</p>}

      {manage && (
        <div>
          {!queue.length && <p>No NGO project drafts are waiting for review.</p>}
          {queue.map((draft) => {
            const org = orgs.find((row) => row.id === draft.organization_id);
            const template = templates.find((row) => row.id === draft.template_id);
            const area = draft.geography_id
              ? geographyPath(draft.geography_id, geographies).map((row) => row.name).join(" / ")
              : "No area";
            const history = eventsByDraft.get(draft.id) || [];
            return (
              <article className="document-row" key={draft.id}>
                <strong>{draft.title || "Untitled project"}</strong>
                <p>{org?.name || "Partner NGO"} · {template ? `${template.name} · v${template.version}` : "Template unavailable"}</p>
                <p>Target {draft.target ?? "—"} · {area} · {draft.start_date || "No start"} – {draft.end_date || "No end"}</p>
                <details>
                  <summary>Review project purpose, consent and history</summary>
                  <p><strong>Purpose:</strong> {draft.purpose || "Not provided"}</p>
                  <p><strong>Consent version:</strong> {draft.consent_version || "Not provided"}</p>
                  <p><strong>Consent notice:</strong> {draft.consent_notice || "Not provided"}</p>
                  {history.length > 0 && <ul>{history.map((event) => <li key={event.id}>{statusLabel(event.action)} · {event.note || "No note"}</li>)}</ul>}
                </details>
                <label className="field">
                  Review note
                  <textarea maxLength={1000} value={reviewNotes[draft.id] || ""} onChange={(event) => setReviewNotes((current) => ({ ...current, [draft.id]: event.target.value }))} />
                </label>
                <div className="actions">
                  <button type="button" disabled={busy} onClick={() => void reviewDraft(draft, "changes_requested")}>Request changes</button>
                  <button type="button" disabled={busy} onClick={() => void reviewDraft(draft, "rejected")}>Reject</button>
                  <button className="primary" type="button" disabled={busy} onClick={() => void reviewDraft(draft, "approved")}>Approve & activate</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {ngoMode && (
        <div>
          <div className="project-draft-list">
            {drafts.map((draft) => {
              const history = eventsByDraft.get(draft.id) || [];
              const editable = editableStatus(draft.review_status) && !draft.approved_project_id;
              return (
                <article className="document-row" key={draft.id}>
                  <strong>{draft.title || "Untitled project draft"}</strong>
                  <span> · {statusLabel(draft.review_status)} · revision {draft.version}</span>
                  {draft.review_note && <p>Latest FieldLance note: {draft.review_note}</p>}
                  {draft.approved_project_id && <p>Operational project created: {draft.approved_project_id}</p>}
                  {history.length > 0 && <details><summary>Review history</summary><ul>{history.map((event) => <li key={event.id}>{statusLabel(event.action)} · {event.note || "No note"}</li>)}</ul></details>}
                  {editable && <button type="button" disabled={busy} onClick={() => openDraft(draft)}>Open draft</button>}
                </article>
              );
            })}
          </div>

          <fieldset disabled={busy} className="project-draft-editor">
            <legend>{editor.version ? "Edit project draft" : "New project draft"}</legend>
            <div className="form-grid">
              <label className="field">
                Project title
                <input maxLength={150} value={editor.title} onChange={(event) => update("title", event.target.value)} />
              </label>
              <label className="field">
                Approved template
                <select value={editor.templateId} onChange={(event) => update("templateId", event.target.value)}>
                  <option value="">Choose template</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} · v{template.version}{template.organization_id ? " · NGO" : " · FieldLance"}
                    </option>
                  ))}
                </select>
              </label>
              <AreaSelector rows={geographies} value={editor.geographyId} onChange={(value) => update("geographyId", value)} title="Collection area" disabled={busy} />
              <label className="field">
                Target responses
                <input type="number" min={1} max={1000000} value={editor.target} onChange={(event) => update("target", event.target.value)} />
              </label>
              <label className="field">
                Start date
                <input type="date" value={editor.startDate} onChange={(event) => update("startDate", event.target.value)} />
              </label>
              <label className="field">
                End date
                <input type="date" value={editor.endDate} onChange={(event) => update("endDate", event.target.value)} />
              </label>
              <label className="field">
                Consent version
                <input maxLength={100} value={editor.consentVersion} onChange={(event) => update("consentVersion", event.target.value)} />
              </label>
            </div>
            <label className="field">
              Collection purpose
              <textarea maxLength={2000} value={editor.purpose} onChange={(event) => update("purpose", event.target.value)} />
            </label>
            <label className="field">
              Approved consent notice
              <textarea maxLength={5000} value={editor.consentNotice} onChange={(event) => update("consentNotice", event.target.value)} />
            </label>
            <p role="status">{dirty ? "Unsaved changes" : editor.version ? "Saved project draft" : "New project draft"} · Approval is required before field operations can start.</p>
            <div className="actions">
              <button type="button" disabled={busy} onClick={() => void saveDraft()}>Save draft</button>
              <button className="primary" type="button" disabled={busy || dirty || !editor.version} onClick={() => void submitDraft()}>Submit to FieldLance</button>
            </div>
          </fieldset>
        </div>
      )}
    </section>
  );
}
