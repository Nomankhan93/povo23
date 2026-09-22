import { useEffect, useMemo, useState } from "react";
import { db, rpc } from "../../lib/supabase/client";
import { type Database } from "../../lib/supabase/database.types";
import { AreaSelector } from "../geography/AreaSelector";
import { selectableArea } from "../geography/areaSelection";
import { type Geo } from "../geography/model";
import type { Template } from "./model";

type Draft = Database["public"]["Tables"]["survey_project_drafts"]["Row"];
type ReviewEvent = Database["public"]["Tables"]["survey_project_review_events"]["Row"];

const statusLabel = (value: string) => value.replaceAll("_", " ");

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
  geographies,
  onChanged,
}: {
  organization: string;
  geographies: Geo[];
  onChanged: () => void;
}) {
  const [drafts, setDrafts] = useState<Draft[]>([]),
    [events, setEvents] = useState<ReviewEvent[]>([]),
    [templates, setTemplates] = useState<Template[]>([]),
    [editor, setEditor] = useState(blankState),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
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
      const [draftResult, templateResult, eventResult] = await Promise.all([
        db!
          .from("survey_project_drafts")
          .select("*")
          .eq("organization_id", organization)
          .order("updated_at", { ascending: false })
          .limit(100),
        db!
          .from("survey_templates")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1000),
        db!
          .from("survey_project_review_events")
          .select("*")
          .order("created_at")
          .limit(500),
      ]);
      if (!live) return;
      if (draftResult.error) setError(draftResult.error.message);
      else setDrafts(draftResult.data || []);
      if (templateResult.error) setError(templateResult.error.message);
      else {
        setTemplates(
          (templateResult.data || []).filter(
            (template) =>
              template.moderation_status === "allowed" &&
              (template.organization_id === null || template.organization_id === organization),
          ),
        );
      }
      if (eventResult.error) setError(eventResult.error.message);
      else setEvents(eventResult.data || []);
    }
    void load();
    return () => {
      live = false;
    };
  }, [organization, rev]);

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
      setMessage("Project draft saved. Publish it when the project is ready to become operational.");
      setRev((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function publishDraft() {
    if (dirty || !editor.version) {
      setError("Save this project draft before publishing it.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const projectId = await rpc("publish_organization_project_draft", {
        p_id: editor.id,
        p_version: editor.version,
      });
      setMessage(`Project published and operational (${projectId}). FieldLance may moderate published content if required.`);
      resetEditor();
      setRev((n) => n + 1);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="project-self-service" aria-label="Organization project drafts">
      <div className="panel-title">
        <div>
          <h3>Project drafts</h3>
          <p>
            Create and publish your Organization&apos;s project using an allowed FieldLance library template or an Organization-owned published template. Publication creates the operational project immediately; FieldLance does not pre-approve it.
          </p>
        </div>
        <button type="button" disabled={busy} onClick={resetEditor}>New project draft</button>
      </div>

      {error && <p className="notice error" role="alert">{error}</p>}
      {message && <p className="notice success" role="status">{message}</p>}

      <div className="project-draft-list">
        {drafts.map((draft) => {
          const history = eventsByDraft.get(draft.id) || [];
          const editable = !draft.approved_project_id;
          return (
            <article className="document-row" key={draft.id}>
              <strong>{draft.title || "Untitled project draft"}</strong>
              <span> · {draft.approved_project_id ? "published" : statusLabel(draft.review_status)} · revision {draft.version}</span>
              {draft.review_note && <p>Historical FieldLance review note: {draft.review_note}</p>}
              {draft.approved_project_id && <p>Operational project: {draft.approved_project_id}</p>}
              {history.length > 0 && <details><summary>Historical review history</summary><ul>{history.map((event) => <li key={event.id}>{statusLabel(event.action)} · {event.note || "No note"}</li>)}</ul></details>}
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
            Published template
            <select value={editor.templateId} onChange={(event) => update("templateId", event.target.value)}>
              <option value="">Choose template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} · v{template.version}{template.organization_id ? " · Organization" : " · FieldLance"}
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
          Consent notice
          <textarea maxLength={5000} value={editor.consentNotice} onChange={(event) => update("consentNotice", event.target.value)} />
        </label>
        <p role="status">{dirty ? "Unsaved changes" : editor.version ? "Saved project draft" : "New project draft"} · Publishing makes the project operational immediately.</p>
        <div className="actions">
          <button type="button" disabled={busy} onClick={() => void saveDraft()}>Save draft</button>
          <button className="primary" type="button" disabled={busy || dirty || !editor.version} onClick={() => void publishDraft()}>Publish project</button>
        </div>
      </fieldset>
    </section>
  );
}
