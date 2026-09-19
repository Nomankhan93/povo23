import { useEffect, useMemo, useState, type FormEvent } from "react";
import { db, rpc } from "../../lib/supabase/client";
import { type Database, type Json } from "../../lib/supabase/database.types";
import { Question, Template } from "./model";
import { templateLibrary, copyQuestions, dependencyErrors } from "./templateLibrary";
import { TemplatePreview } from "./TemplatePreview";
import { Pager } from "../../components/ui/Pager";

type Draft = Database["public"]["Tables"]["survey_template_drafts"]["Row"];
type ReviewEvent = Database["public"]["Tables"]["survey_template_review_events"]["Row"];
type Tab = "mine" | "library" | "review";

const statusLabel = (value: string) => value.replaceAll("_", " ");
const editableNgoStatus = (value: string) => value === "draft" || value === "changes_requested";

export function SurveyTemplates({
  organization = null,
  manage = false,
}: {
  organization?: string | null;
  manage?: boolean;
}) {
  const ngoMode = Boolean(organization && !manage);
  const [rows, setRows] = useState<Template[]>([]),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [rev, setRev] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [name, setName] = useState(""),
    [qs, setQs] = useState<Question[]>([]);
  const [tab, setTab] = useState<Tab>("mine"),
    [draftId, setDraftId] = useState<string>(() => crypto.randomUUID()),
    [version, setVersion] = useState(0),
    [source, setSource] = useState<Json>({}),
    [dirty, setDirty] = useState(false),
    [preview, setPreview] = useState(false),
    [drafts, setDrafts] = useState<Draft[]>([]),
    [reviewQueue, setReviewQueue] = useState<Draft[]>([]),
    [reviewEvents, setReviewEvents] = useState<ReviewEvent[]>([]),
    [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const eventsByDraft = useMemo(() => {
    const grouped = new Map<string, ReviewEvent[]>();
    for (const event of reviewEvents) {
      const list = grouped.get(event.draft_id) || [];
      list.push(event);
      grouped.set(event.draft_id, list);
    }
    return grouped;
  }, [reviewEvents]);

  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty]);

  useEffect(() => {
    let live = true;
    async function loadDrafts() {
      let mine = db!
        .from("survey_template_drafts")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(100);
      mine = manage ? mine.is("organization_id", null) : mine.eq("organization_id", organization!);
      const requests = [mine, db!.from("survey_template_review_events").select("*").order("created_at").limit(500)] as const;
      const [draftResult, eventResult] = await Promise.all(requests);
      if (!live) return;
      if (draftResult.error) setError(draftResult.error.message);
      else setDrafts(draftResult.data || []);
      if (eventResult.error) setError(eventResult.error.message);
      else setReviewEvents(eventResult.data || []);

      if (manage) {
        const queue = await db!
          .from("survey_template_drafts")
          .select("*")
          .not("organization_id", "is", null)
          .eq("review_status", "submitted")
          .order("submitted_at", { ascending: true })
          .limit(100);
        if (!live) return;
        if (queue.error) setError(queue.error.message);
        else setReviewQueue(queue.data || []);
      } else {
        setReviewQueue([]);
      }
    }
    void loadDrafts();
    return () => {
      live = false;
    };
  }, [manage, organization, rev]);

  useEffect(() => {
    let live = true;
    setBusy(true);
    let query = db!
      .from("survey_templates")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id")
      .range(page * 50, page * 50 + 50);
    if (ngoMode) query = query.eq("organization_id", organization!);
    query.then((r) => {
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
  }, [page, rev, ngoMode, organization]);

  function resetEditor() {
    setDraftId(crypto.randomUUID());
    setVersion(0);
    setSource({});
    setDirty(false);
    setPreview(false);
    setQs([]);
    setName("");
  }

  function openDraft(
    title: string,
    questions: Question[],
    origin: Json,
    id: string = crypto.randomUUID(),
    v = 0,
  ) {
    if (dirty && !window.confirm("Discard unsaved changes and open this draft?")) return;
    setName(title);
    setQs(structuredClone(questions));
    setSource(origin);
    setDraftId(id);
    setVersion(v);
    setDirty(v === 0);
    setPreview(false);
    setTab("mine");
    setError("");
    setMessage("");
  }

  async function saveDraft() {
    setBusy(true);
    setError("");
    try {
      const v = ngoMode
        ? await rpc("save_organization_template_draft", {
            p_id: draftId,
            p_organization: organization!,
            p_name: name,
            p_questions: qs as unknown as Json,
            p_source: source,
            p_version: version,
          })
        : await rpc("save_template_draft", {
            p_id: draftId,
            p_name: name,
            p_questions: qs as unknown as Json,
            p_source: source,
            p_version: version,
          });
      setVersion(v);
      setDirty(false);
      setMessage(ngoMode ? "NGO template draft saved." : "Draft saved.");
      setRev((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function move(i: number, delta: number) {
    const next = [...qs];
    [next[i], next[i + delta]] = [next[i + delta], next[i]];
    const errors = dependencyErrors(next);
    if (errors.length) {
      setError("Move blocked: " + errors.join(" "));
      return;
    }
    setQs(next);
    setDirty(true);
  }

  async function publishOrSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (dirty || !version) throw new Error("Save this draft before continuing.");
      const errors = dependencyErrors(qs);
      if (errors.length) throw new Error(errors.join(" "));
      if (ngoMode) {
        await rpc("submit_template_draft", { p_id: draftId, p_version: version });
        setMessage("Submitted to FieldLance for review. This revision is locked until FieldLance requests changes or decides it.");
      } else {
        await rpc("publish_template_draft", { p_id: draftId, p_version: version });
        setMessage("Published. Existing versions and their projects remain unchanged.");
      }
      resetEditor();
      setRev((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reviewDraft(draft: Draft, decision: "changes_requested" | "rejected" | "approved") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await rpc("review_template_draft", {
        p_id: draft.id,
        p_decision: decision,
        p_note: reviewNotes[draft.id] || "",
        p_version: draft.version,
      });
      setMessage(
        decision === "approved"
          ? "Template approved and published as an immutable version."
          : decision === "rejected"
            ? "Template rejected. The decision is preserved in review history."
            : "Changes requested. The NGO can edit and resubmit the same draft.",
      );
      setReviewNotes((current) => ({ ...current, [draft.id]: "" }));
      setRev((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const update = (i: number, patch: Partial<Question>) => {
    setDirty(true);
    setQs((q) => q.map((v, n) => (n === i ? { ...v, ...patch } : v)));
  };

  if (!manage && !organization) {
    return <section className="panel detail"><p role="alert">An NGO workspace or FieldLance survey-management workspace is required.</p></section>;
  }

  return (
    <section className="panel detail">
      <h2>{ngoMode ? "NGO survey templates" : "Survey templates"}</h2>
      <p>
        {ngoMode
          ? "Create organization-owned drafts with the existing FieldLance template builder. FieldLance approval publishes an immutable version; submitted drafts cannot be edited unless changes are requested."
          : "FieldLance-authored drafts can still publish directly. NGO submissions use a separate review queue and publish only after an explicit FieldLance decision."}
      </p>
      <div className="actions">
        <button type="button" disabled={busy} aria-pressed={tab === "mine"} onClick={() => setTab("mine")}>My templates</button>
        <button type="button" disabled={busy} aria-pressed={tab === "library"} onClick={() => setTab("library")}>Template library</button>
        {manage && <button type="button" disabled={busy} aria-pressed={tab === "review"} onClick={() => setTab("review")}>NGO review queue {reviewQueue.length ? `(${reviewQueue.length})` : ""}</button>}
      </div>

      {error && <p role="alert" className="notice error">{error}</p>}
      {message && <p role="status" className="notice success">{message}</p>}

      {tab === "review" && manage && (
        <div>
          <h3>Submitted NGO templates</h3>
          <p>Review is server-authorized. Approval atomically creates an immutable published template owned by the submitting NGO.</p>
          {!reviewQueue.length && <p>No NGO templates are waiting for review.</p>}
          {reviewQueue.map((draft) => (
            <article className="document-row" key={draft.id}>
              <strong>{draft.name || "Untitled template"}</strong>
              <p>{(draft.questions as unknown as Question[]).length} questions · revision {draft.version} · submitted {draft.submitted_at ? new Date(draft.submitted_at).toLocaleString() : "recently"}</p>
              <details>
                <summary>Review questions and history</summary>
                <ol>{(draft.questions as unknown as Question[]).map((q) => <li key={q.id}>{q.label} ({q.type}){q.required ? " · required" : ""}</li>)}</ol>
                {(eventsByDraft.get(draft.id) || []).length > 0 && <ul>{(eventsByDraft.get(draft.id) || []).map((event) => <li key={event.id}>{statusLabel(event.action)} · {event.note || "No note"}</li>)}</ul>}
              </details>
              <label className="field">
                Review note
                <textarea maxLength={1000} value={reviewNotes[draft.id] || ""} onChange={(e) => setReviewNotes((current) => ({ ...current, [draft.id]: e.target.value }))} />
              </label>
              <div className="actions">
                <button type="button" disabled={busy} onClick={() => void reviewDraft(draft, "changes_requested")}>Request changes</button>
                <button type="button" disabled={busy} onClick={() => void reviewDraft(draft, "rejected")}>Reject</button>
                <button className="primary" type="button" disabled={busy} onClick={() => void reviewDraft(draft, "approved")}>Approve & publish</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === "library" && (
        <div>
          <p>Read-only starter templates. “Use template” creates a new editable {ngoMode ? "NGO-owned" : "FieldLance-owned"} draft; the starter library itself remains application-managed.</p>
          {templateLibrary.map((t) => (
            <article className="document-row" key={t.id}>
              <h3>{t.name}</h3>
              <p>{t.description} · {t.questions.length} questions · Library v{t.version}</p>
              <details><summary>View questions</summary><ol>{t.questions.map((q) => <li key={q.id}>{q.label} ({q.type})</li>)}</ol></details>
              <button type="button" disabled={busy} onClick={() => openDraft(t.name, copyQuestions(t.questions), { library_id: t.id, library_version: t.version })}>Use template</button>
            </article>
          ))}
        </div>
      )}

      <div hidden={tab !== "mine"}>
        <h3>{ngoMode ? "Organization drafts" : "Saved FieldLance drafts and publication recovery"}</h3>
        <p>
          {ngoMode
            ? "Draft ownership belongs to the NGO, not one individual admin. Another active NGO Admin can continue an editable organization draft."
            : "Your latest FieldLance author drafts. NGO submissions are handled in the review queue."}
        </p>
        {drafts.map((draft) => {
          const editable = ngoMode ? editableNgoStatus(draft.review_status) && !draft.published_id : !draft.published_id;
          const history = eventsByDraft.get(draft.id) || [];
          return (
            <article className="document-row" key={draft.id}>
              <strong>{draft.name || "Untitled draft"}</strong>
              <span> · {draft.published_id ? "Published" : statusLabel(draft.review_status)} · revision {draft.version}</span>
              {draft.review_note && <p>Latest FieldLance note: {draft.review_note}</p>}
              {history.length > 0 && <details><summary>Review history</summary><ul>{history.map((event) => <li key={event.id}>{statusLabel(event.action)} · {event.note || "No note"}</li>)}</ul></details>}
              {editable && <button type="button" disabled={busy} onClick={() => openDraft(draft.name, draft.questions as unknown as Question[], draft.source, draft.id, draft.version)}>Open saved draft</button>}
            </article>
          );
        })}
        <button type="button" disabled={busy} onClick={() => openDraft("", [], {})}>New blank draft</button>
        <p role="status">{dirty ? "Unsaved changes" : version ? "Saved draft" : "New draft"} · Published versions cannot be edited.</p>

        <form onSubmit={publishOrSubmit} onChange={() => setDirty(true)}>
          <fieldset disabled={busy}>
            <label className="field">
              Template name
              <input required minLength={3} maxLength={150} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            {qs.map((q, i) => (
              <fieldset className="survey-question" key={q.id}>
                <legend>Question {i + 1}</legend>
                <label className="field">
                  Label
                  <input required maxLength={300} value={q.label} onChange={(e) => update(i, { label: e.target.value })} />
                </label>
                <label className="field">
                  Answer type
                  <select value={q.type} onChange={(e) => update(i, { type: e.target.value as Question["type"], min: undefined, max: undefined, after: undefined })}>
                    {["text", "number", "date", "choice", "yesno", "multiple", "phone", "identity", "household", "gps", "photo", "document"].map((t) => <option key={t}>{t}</option>)}
                  </select>
                </label>
                {(q.type === "choice" || q.type === "multiple") && (
                  <label className="field">
                    Choices, one per line
                    <textarea value={q.options?.join("\n") || ""} onChange={(e) => update(i, { options: e.target.value.split("\n") })} />
                  </label>
                )}
                {q.type === "number" && <div className="actions">{(["min", "max"] as const).map((key) => <label className="field" key={key}>{key}<input type="number" step="any" value={q[key] ?? ""} onChange={(e) => update(i, { [key]: e.target.value === "" ? undefined : Number(e.target.value) })} /></label>)}</div>}
                {q.type === "date" && <label className="field">Must be on or after<select value={q.after || ""} onChange={(e) => update(i, { after: e.target.value || undefined })}><option value="">No date comparison</option>{qs.slice(0, i).filter((p) => p.type === "date").map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>}
                <label className="field">Show only when<select value={q.when?.question || ""} onChange={(e) => { const parent = qs.find((p) => p.id === e.target.value); update(i, { when: parent ? { question: parent.id, equals: parent.type === "yesno" ? true : parent.options?.[0] || "" } : undefined }); }}><option value="">Always show</option>{qs.slice(0, i).filter((p) => p.type === "choice" || p.type === "yesno").map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
                {q.when && <label className="field">Equals<select value={String(q.when.equals)} onChange={(e) => update(i, { when: { question: q.when!.question, equals: qs.find((p) => p.id === q.when!.question)?.type === "yesno" ? e.target.value === "true" : e.target.value } })}>{(qs.find((p) => p.id === q.when!.question)?.type === "yesno" ? ["true", "false"] : qs.find((p) => p.id === q.when!.question)?.options || []).map((o) => <option key={o} value={o}>{o === "true" ? "Yes" : o === "false" ? "No" : o}</option>)}</select></label>}
                <label className="checklabel"><input type="checkbox" checked={q.required} onChange={(e) => update(i, { required: e.target.checked })} />Required on submission</label>
                <button className="secondary" type="button" onClick={() => { if (qs.some((other) => other.when?.question === q.id || other.after === q.id)) { setError("Remove blocked: another question depends on this question. Clear its condition/date comparison first."); return; } setQs((items) => items.filter((_, n) => n !== i)); setDirty(true); }}>Remove question</button>
                <button type="button" disabled={qs.length >= 50} onClick={() => { setQs((items) => [...items.slice(0, i + 1), { ...structuredClone(q), id: "q_" + crypto.randomUUID().replaceAll("-", "") }, ...items.slice(i + 1)]); setDirty(true); }}>Duplicate question</button>
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)}>Move up</button>
                <button type="button" disabled={i === qs.length - 1} onClick={() => move(i, 1)}>Move down</button>
              </fieldset>
            ))}
            <div className="actions">
              <button className="secondary" type="button" disabled={qs.length >= 50 || busy} onClick={() => { setDirty(true); setQs((q) => [...q, { id: "q_" + crypto.randomUUID().replaceAll("-", ""), label: "", type: "text", required: false }]); }}>Add question</button>
              <button type="button" onClick={() => void saveDraft()}>Save draft</button>
              <button type="button" onClick={() => setPreview((p) => !p)}>Preview form</button>
              <button className="primary" disabled={busy || !qs.length || dirty || !version}>{ngoMode ? "Submit to FieldLance" : "Publish immutable version"}</button>
            </div>
          </fieldset>
        </form>
        {preview && <TemplatePreview questions={qs} />}

        <h3>{ngoMode ? "Approved organization templates" : "Published versions"}</h3>
        {rows.map((t) => (
          <article className="document-row" key={t.id}>
            <strong>{t.name} · v{t.version}</strong>
            <p>{(t.questions as unknown as Question[]).length} questions{t.organization_id ? " · NGO-owned" : " · FieldLance-owned"}</p>
            <button className="secondary" disabled={busy} onClick={() => openDraft(t.name, t.questions as unknown as Question[], { published_template_id: t.id })}>Use as next-version draft</button>
          </article>
        ))}
        <Pager page={page} more={more} busy={busy} onChange={setPage} />
      </div>
    </section>
  );
}
