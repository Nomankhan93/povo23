import { useDirtyAuthoring, requestAuthoringNavigation } from "../../shared/authoringNavigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { db, rpc } from "../../lib/supabase/client";
import { type Database, type Json } from "../../lib/supabase/database.types";
import { Question, Template } from "./model";
import { templateLibrary, copyQuestions, dependencyErrors } from "./templateLibrary";
import { TemplatePreview } from "./TemplatePreview";
import { Pager } from "../../components/ui/Pager";
import {
  ActionMenu,
  Alert,
  BottomSheet,
  Button,
  Card,
  Drawer,
  Field,
  FieldGroup,
  FormActions,
  FormSection,
  SectionHeader,
  Select,
  StatusBadge,
  Tabs,
  Textarea,
} from "../../components/ui/FieldLanceUI";
import styles from "./SurveyTemplates.module.css";

type Draft = Database["public"]["Tables"]["survey_template_drafts"]["Row"];
type ReviewEvent = Database["public"]["Tables"]["survey_template_review_events"]["Row"];
type Tab = "mine" | "library";
type MineView = "drafts" | "builder" | "published";

const questionTypes: Question["type"][] = [
  "text",
  "number",
  "date",
  "choice",
  "yesno",
  "multiple",
  "phone",
  "identity",
  "household",
  "gps",
  "photo",
  "document",
];

const statusLabel = (value: string) => value.replaceAll("_", " ");
const editableNgoStatus = (value: string) => value !== "approved";
const questionTypeLabel = (value: Question["type"]) => value.replaceAll("_", " ");

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
    [mineView, setMineView] = useState<MineView>("drafts"),
    [draftId, setDraftId] = useState<string>(() => crypto.randomUUID()),
    [version, setVersion] = useState(0),
    [source, setSource] = useState<Json>({}),
    [baseline, setBaseline] = useState(JSON.stringify({ name: "", qs: [], source: {} })),
    [preview, setPreview] = useState(false),
    [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null),
    [questionsOpen, setQuestionsOpen] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [drafts, setDrafts] = useState<Draft[]>([]),
    [reviewEvents, setReviewEvents] = useState<ReviewEvent[]>([]),
    [moderationNotes, setModerationNotes] = useState<Record<string, string>>({});

  const eventsByDraft = useMemo(() => {
    const grouped = new Map<string, ReviewEvent[]>();
    for (const event of reviewEvents) {
      const list = grouped.get(event.draft_id) || [];
      list.push(event);
      grouped.set(event.draft_id, list);
    }
    return grouped;
  }, [reviewEvents]);

  const snapshot = JSON.stringify({ name, qs, source });
  const dirty = snapshot !== baseline;
  useDirtyAuthoring(dirty);

  const selectedIndex = qs.length ? Math.max(0, qs.findIndex((question) => question.id === selectedQuestionId)) : -1;
  const selectedQuestion = selectedIndex >= 0 ? qs[selectedIndex] : null;

  useEffect(() => {
    if (!qs.length) {
      if (selectedQuestionId !== null) setSelectedQuestionId(null);
      return;
    }
    if (!selectedQuestionId || !qs.some((question) => question.id === selectedQuestionId)) {
      setSelectedQuestionId(qs[0].id);
    }
  }, [qs, selectedQuestionId]);

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
    setBaseline(JSON.stringify({ name: "", qs: [], source: {} }));
    setPreview(false);
    setSelectedQuestionId(null);
    setQs([]);
    setName("");
  }

  async function openDraft(
    title: string,
    questions: Question[],
    origin: Json,
    id: string = crypto.randomUUID(),
    v = 0,
  ) {
    if (!(await requestAuthoringNavigation())) return;
    setName(title);
    setQs(structuredClone(questions));
    setSource(origin);
    setDraftId(id);
    setVersion(v);
    setBaseline(v === 0 ? JSON.stringify({ name: "", qs: [], source: {} }) : JSON.stringify({ name: title, qs: questions, source: origin }));
    setSelectedQuestionId(questions[0]?.id || null);
    setPreview(false);
    setQuestionsOpen(false);
    setSettingsOpen(false);
    setTab("mine");
    setMineView("builder");
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
      setBaseline(snapshot);
      setMessage(ngoMode ? "Organization template draft saved." : "Draft saved.");
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
  }

  function addQuestion() {
    const next: Question = {
      id: "q_" + crypto.randomUUID().replaceAll("-", ""),
      label: "",
      type: "text",
      required: false,
    };
    setQs((items) => [...items, next]);
    setSelectedQuestionId(next.id);
  }

  function duplicateQuestion(i: number) {
    const copy = { ...structuredClone(qs[i]), id: "q_" + crypto.randomUUID().replaceAll("-", "") };
    setQs((items) => [...items.slice(0, i + 1), copy, ...items.slice(i + 1)]);
    setSelectedQuestionId(copy.id);
  }

  function removeQuestion(i: number) {
    const question = qs[i];
    if (qs.some((other) => other.when?.question === question.id || other.after === question.id)) {
      setError("Remove blocked: another question depends on this question. Clear its condition/date comparison first.");
      return;
    }
    const replacement = qs[i + 1]?.id || qs[i - 1]?.id || null;
    setQs((items) => items.filter((_, n) => n !== i));
    if (selectedQuestionId === question.id) setSelectedQuestionId(replacement);
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
        await rpc("publish_organization_template_draft", { p_id: draftId, p_version: version });
        setMessage("Published immediately as an immutable Organization template. FieldLance may moderate published content if required.");
      } else {
        await rpc("publish_template_draft", { p_id: draftId, p_version: version });
        setMessage("Published. Existing versions and their projects remain unchanged.");
      }
      resetEditor();
      setMineView("published");
      setRev((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function moderateTemplate(template: Template, action: "block" | "remove" | "restore") {
    const reason = (moderationNotes[template.id] || "").trim();
    if (reason.length < 3) {
      setError("Enter a moderation reason of at least 3 characters.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await rpc("moderate_survey_template", { p_id: template.id, p_action: action, p_reason: reason });
      setModerationNotes((current) => ({ ...current, [template.id]: "" }));
      setMessage(action === "restore" ? "Template restriction cleared. Temporarily blocked work can resume; operationally removed work remains closed or cancelled and must be reopened or reassigned deliberately." : "Template moderation applied. Projects using it are paused from new operational work.");
      setRev((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const update = (i: number, patch: Partial<Question>) => {
    setQs((q) => q.map((v, n) => (n === i ? { ...v, ...patch } : v)));
  };

  if (!manage && !organization) {
    return <Card><Alert tone="danger" title="Survey workspace required">An NGO workspace or FieldLance survey-management workspace is required.</Alert></Card>;
  }

  const currentDraftState = dirty ? "Unsaved changes" : version ? `Saved draft · revision ${version}` : "New draft";
  const saveIsPrimary = dirty || !version;
  const publishIsPrimary = !dirty && Boolean(version) && Boolean(qs.length);

  const renderQuestionPreview = (question: Question) => {
    if (question.type === "choice" || question.type === "yesno") {
      const options = question.type === "yesno" ? ["Yes", "No"] : question.options || [];
      return <select disabled aria-label="Question preview"><option>Choose answer</option>{options.map((option, optionIndex) => <option key={`${question.id}-preview-choice-${optionIndex}`}>{option}</option>)}</select>;
    }
    if (question.type === "multiple") {
      return <div className={styles.previewOptions}>{(question.options || []).length ? question.options?.map((option, optionIndex) => <span key={`${question.id}-preview-multiple-${optionIndex}`}><input type="checkbox" disabled /> {option || "Untitled option"}</span>) : <span>No options yet</span>}</div>;
    }
    if (["gps", "household", "photo", "document"].includes(question.type)) {
      return <div className={styles.specialPreview}>{questionTypeLabel(question.type)} field is completed in the existing field collection workflow.</div>;
    }
    return <input disabled type={question.type === "number" ? "number" : question.type === "date" ? "date" : "text"} placeholder="Response preview" />;
  };

  const renderQuestionList = (compact = false) => (
    <div className={`${styles.questionPanelContent} ${compact ? styles.questionPanelCompact : ""}`.trim()}>
      <div className={styles.questionPanelHeader}>
        <div>
          <strong>Questions</strong>
          <span>{qs.length}/50</span>
        </div>
        <Button type="button" variant="secondary" disabled={busy || qs.length >= 50} onClick={addQuestion}>Add question</Button>
      </div>
      {qs.length === 0 ? (
        <div className={styles.emptyState}>
          <strong>No questions yet</strong>
          <span>Add the first question to begin building this template.</span>
        </div>
      ) : (
        <ol className={styles.questionList}>
          {qs.map((question, i) => {
            const selected = selectedQuestion?.id === question.id;
            return <li key={question.id} className={selected ? styles.questionItemSelected : undefined}>
              <button type="button" className={styles.questionSelect} aria-current={selected ? "true" : undefined} onClick={() => { setSelectedQuestionId(question.id); setQuestionsOpen(false); }}>
                <span className={styles.questionNumber}>{i + 1}</span>
                <span className={styles.questionCopy}>
                  <strong>{question.label || "Untitled question"}</strong>
                  <span>{questionTypeLabel(question.type)}{question.required ? " · Required" : ""}{question.when || question.after ? " · Conditional" : ""}</span>
                </span>
              </button>
              <ActionMenu label={`Question ${i + 1} actions`} className={styles.questionMenu}>
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)}>Move up</button>
                <button type="button" disabled={i === qs.length - 1} onClick={() => move(i, 1)}>Move down</button>
                <button type="button" disabled={qs.length >= 50} onClick={() => duplicateQuestion(i)}>Duplicate</button>
                <button type="button" className={styles.dangerAction} onClick={() => removeQuestion(i)}>Remove</button>
              </ActionMenu>
            </li>;
          })}
        </ol>
      )}
    </div>
  );

  const renderQuestionSettings = () => {
    if (!selectedQuestion || selectedIndex < 0) {
      return <div className={styles.emptyState}><strong>No question selected</strong><span>Select or add a question to edit its settings.</span></div>;
    }
    const q = selectedQuestion;
    const i = selectedIndex;
    return <div className={styles.settingsContent}>
      <FormSection title="Answer configuration" description="Use the existing FieldLance question type and answer options.">
        <Select
          label="Answer type"
          value={q.type}
          onChange={(e) => update(i, { type: e.target.value as Question["type"], min: undefined, max: undefined, after: undefined })}
        >
          {questionTypes.map((type) => <option key={type} value={type}>{questionTypeLabel(type)}</option>)}
        </Select>
        {(q.type === "choice" || q.type === "multiple") && (
          <Textarea
            label="Choices, one per line"
            value={q.options?.join("\n") || ""}
            onChange={(e) => update(i, { options: e.target.value.split("\n") })}
          />
        )}
      </FormSection>

      <FormSection title="Validation" description="Existing submission requirements and constraints.">
        <label className={styles.checkRow}><input type="checkbox" checked={q.required} onChange={(e) => update(i, { required: e.target.checked })} /><span><strong>Required on submission</strong><small>Collectors must answer this question before submission.</small></span></label>
        {q.type === "number" && <FieldGroup columns={2}>
          <Field label="Minimum">
            <input type="number" step="any" value={q.min ?? ""} onChange={(e) => update(i, { min: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </Field>
          <Field label="Maximum">
            <input type="number" step="any" value={q.max ?? ""} onChange={(e) => update(i, { max: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </Field>
        </FieldGroup>}
        {q.type === "date" && <Select label="Must be on or after" value={q.after || ""} onChange={(e) => update(i, { after: e.target.value || undefined })}>
          <option value="">No date comparison</option>
          {qs.slice(0, i).filter((p) => p.type === "date").map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </Select>}
      </FormSection>

      <FormSection title="Conditional logic" description="Keep the existing dependency and comparison semantics.">
        <Select
          label="Show only when"
          value={q.when?.question || ""}
          onChange={(e) => {
            const parent = qs.find((p) => p.id === e.target.value);
            update(i, { when: parent ? { question: parent.id, equals: parent.type === "yesno" ? true : parent.options?.[0] || "" } : undefined });
          }}
        >
          <option value="">Always show</option>
          {qs.slice(0, i).filter((p) => p.type === "choice" || p.type === "yesno").map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </Select>
        {q.when && <Select
          label="Equals"
          value={String(q.when.equals)}
          onChange={(e) => update(i, { when: { question: q.when!.question, equals: qs.find((p) => p.id === q.when!.question)?.type === "yesno" ? e.target.value === "true" : e.target.value } })}
        >
          {(qs.find((p) => p.id === q.when!.question)?.type === "yesno" ? ["true", "false"] : qs.find((p) => p.id === q.when!.question)?.options || []).map((o) => <option key={o} value={o}>{o === "true" ? "Yes" : o === "false" ? "No" : o}</option>)}
        </Select>}
      </FormSection>
    </div>;
  };

  const builderStatus = (
    <div className={styles.builderStatus}>
      <StatusBadge tone={dirty ? "warning" : version ? "success" : "neutral"}>{currentDraftState}</StatusBadge>
      {version > 0 && <span>Version {version}</span>}
      <span>{qs.length} question{qs.length === 1 ? "" : "s"}</span>
    </div>
  );

  return (
    <section className={styles.workspace}>
      <Tabs<Tab>
        items={[{ id: "mine", label: "My templates" }, { id: "library", label: "Template library" }]}
        activeId={tab}
        onChange={setTab}
        label="Survey template workspace"
        className={styles.primaryTabs}
      />

      {error && <Alert tone="danger" title="Survey template action failed">{error}</Alert>}
      {message && <Alert tone="success" title="Survey template updated">{message}</Alert>}

      {tab === "library" ? (
        <section className={styles.librarySection}>
          <SectionHeader title="Template library" description={`Read-only starter templates. “Use template” creates a new editable ${ngoMode ? "Organization-owned" : "FieldLance-owned"} draft; the starter library itself remains application-managed.`} />
          <div className={styles.libraryGrid}>
            {templateLibrary.map((template) => (
              <Card key={template.id} className={styles.libraryCard}>
                <div className={styles.cardHeader}>
                  <div><h3>{template.name}</h3><p>{template.description}</p></div>
                  <StatusBadge tone="info">Library v{template.version}</StatusBadge>
                </div>
                <p className={styles.cardMeta}>{template.questions.length} questions</p>
                <details className={styles.secondaryDetails}><summary>View questions</summary><ol>{template.questions.map((question) => <li key={question.id}>{question.label} <span>({question.type})</span></li>)}</ol></details>
                <FormActions><Button type="button" variant="primary" disabled={busy} onClick={() => void openDraft(template.name, copyQuestions(template.questions), { library_id: template.id, library_version: template.version })}>Use template</Button></FormActions>
              </Card>
            ))}
          </div>
        </section>
      ) : (
        <div className={styles.mineWorkspace}>
          <Tabs<MineView>
            items={[
              { id: "drafts", label: ngoMode ? "Organization drafts" : "Drafts" },
              { id: "builder", label: "Builder" },
              { id: "published", label: ngoMode ? "Published templates" : "Published versions" },
            ]}
            activeId={mineView}
            onChange={setMineView}
            label="Survey template sections"
            className={styles.secondaryTabs}
          />

          {mineView === "drafts" && (
            <section className={styles.draftsSection}>
              <SectionHeader
                title={ngoMode ? "Organization drafts" : "Saved FieldLance drafts"}
                description={ngoMode
                  ? "Draft ownership belongs to the Organization. Another active Organization Admin can continue and publish an editable draft."
                  : "Your latest FieldLance author drafts. Partner Organization drafts stay private until they are self-published."}
                actions={<Button type="button" variant="primary" disabled={busy} onClick={() => void openDraft("", [], {})}>New blank draft</Button>}
              />
              {drafts.length === 0 ? (
                <Card className={styles.emptyCard}><strong>No saved drafts</strong><p>Create a blank draft or start from the Template Library.</p></Card>
              ) : (
                <div className={styles.draftGrid}>
                  {drafts.map((draft) => {
                    const editable = ngoMode ? editableNgoStatus(draft.review_status) && !draft.published_id : !draft.published_id;
                    const history = eventsByDraft.get(draft.id) || [];
                    return <Card className={styles.draftCard} key={draft.id}>
                      <div className={styles.cardHeader}>
                        <div><h3>{draft.name || "Untitled draft"}</h3><p>Revision {draft.version}</p></div>
                        <StatusBadge tone={draft.published_id ? "success" : "neutral"}>{draft.published_id ? "Published" : statusLabel(draft.review_status)}</StatusBadge>
                      </div>
                      {draft.review_note && <Alert title="Latest FieldLance note" tone="info">{draft.review_note}</Alert>}
                      {history.length > 0 && <details className={styles.secondaryDetails}><summary>Review history</summary><ul>{history.map((event) => <li key={event.id}>{statusLabel(event.action)} · {event.note || "No note"}</li>)}</ul></details>}
                      {editable && <FormActions><Button type="button" variant="primary" disabled={busy} onClick={() => void openDraft(draft.name, draft.questions as unknown as Question[], draft.source, draft.id, draft.version)}>Open saved draft</Button></FormActions>}
                    </Card>;
                  })}
                </div>
              )}
            </section>
          )}

          {mineView === "builder" && (
            <form onSubmit={publishOrSubmit} className={styles.builderForm}>
              <fieldset disabled={busy} className={styles.builderFieldset}>
                <Card className={styles.builderIdentity}>
                  <div className={styles.builderIdentityHeader}>
                    <div>
                      <span className={styles.builderEyebrow}>Editing template</span>
                      <h3>{name || "Untitled draft"}</h3>
                      {builderStatus}
                    </div>
                    <Button type="button" variant="tertiary" onClick={() => setMineView("drafts")}>Back to drafts</Button>
                  </div>
                  <Field label="Template name" required hint="Published versions are immutable; save this draft before publishing.">
                    <input required minLength={3} maxLength={150} value={name} onChange={(e) => setName(e.target.value)} />
                  </Field>
                </Card>

                <div className={styles.mobileBuilderControls}>
                  <Button type="button" variant="secondary" onClick={() => setQuestionsOpen(true)}>Questions · {qs.length}</Button>
                  <Button type="button" variant="secondary" disabled={!selectedQuestion} onClick={() => setSettingsOpen(true)}>Question settings</Button>
                </div>

                <div className={styles.builderGrid}>
                  <aside className={styles.questionsPanel} aria-label="Survey questions">{renderQuestionList()}</aside>

                  <section className={styles.canvasPanel} aria-label="Survey question canvas">
                    {selectedQuestion && selectedIndex >= 0 ? (
                      <>
                        <SectionHeader
                          eyebrow={`Question ${selectedIndex + 1} of ${qs.length}`}
                          title={selectedQuestion.label || "Untitled question"}
                          description={`${questionTypeLabel(selectedQuestion.type)}${selectedQuestion.required ? " · Required" : ""}`}
                          actions={<ActionMenu label="Selected question actions">
                            <button type="button" disabled={selectedIndex === 0} onClick={() => move(selectedIndex, -1)}>Move up</button>
                            <button type="button" disabled={selectedIndex === qs.length - 1} onClick={() => move(selectedIndex, 1)}>Move down</button>
                            <button type="button" disabled={qs.length >= 50} onClick={() => duplicateQuestion(selectedIndex)}>Duplicate</button>
                            <button type="button" className={styles.dangerAction} onClick={() => removeQuestion(selectedIndex)}>Remove</button>
                          </ActionMenu>}
                        />
                        <Card className={styles.questionEditorCard}>
                          <Field label="Question prompt" required>
                            <input required maxLength={300} value={selectedQuestion.label} onChange={(e) => update(selectedIndex, { label: e.target.value })} />
                          </Field>
                          <div className={styles.questionPreview}>
                            <span className={styles.previewLabel}>Collector preview</span>
                            <strong>{selectedQuestion.label || "Untitled question"}{selectedQuestion.required ? " *" : ""}</strong>
                            {renderQuestionPreview(selectedQuestion)}
                            {(selectedQuestion.when || selectedQuestion.after) && <span className={styles.previewCondition}>Conditional display is configured in Question settings.</span>}
                          </div>
                        </Card>
                      </>
                    ) : (
                      <Card className={styles.emptyCanvas}>
                        <strong>Start with a question</strong>
                        <p>Add a question to begin authoring this survey template.</p>
                        <Button type="button" variant="primary" disabled={qs.length >= 50} onClick={addQuestion}>Add first question</Button>
                      </Card>
                    )}
                  </section>

                  <aside className={styles.settingsPanel} aria-label="Question settings">
                    <SectionHeader title="Question settings" description="Answer configuration, validation and conditional logic." />
                    {renderQuestionSettings()}
                  </aside>
                </div>

                <FormActions className={styles.builderActions}>
                  <Button type="button" variant={saveIsPrimary ? "primary" : "secondary"} onClick={() => void saveDraft()}>Save draft</Button>
                  <Button type="button" variant="secondary" onClick={() => setPreview(true)}>Preview form</Button>
                  <Button type="submit" variant={publishIsPrimary ? "primary" : "secondary"} disabled={busy || !qs.length || dirty || !version}>{ngoMode ? "Publish Organization version" : "Publish immutable version"}</Button>
                </FormActions>

                <BottomSheet open={questionsOpen} title="Questions" onClose={() => setQuestionsOpen(false)} className={styles.questionsSheet}>
                  {renderQuestionList(true)}
                </BottomSheet>
                <Drawer open={settingsOpen} title="Question settings" onClose={() => setSettingsOpen(false)} side="right" className={styles.settingsDrawer}>
                  {renderQuestionSettings()}
                </Drawer>
                <Drawer open={preview} title="Form preview" onClose={() => setPreview(false)} side="right" className={styles.previewDrawer}>
                  <TemplatePreview questions={qs} />
                </Drawer>
              </fieldset>
            </form>
          )}

          {mineView === "published" && (
            <section className={styles.publishedSection}>
              <SectionHeader
                title={ngoMode ? "Published organization templates" : "Published versions and moderation"}
                description="Published versions remain immutable. Versioning and moderation behavior are unchanged."
              />
              {busy && rows.length === 0 ? (
                <Card className={styles.emptyCard}><strong>Loading published templates…</strong></Card>
              ) : rows.length === 0 ? (
                <Card className={styles.emptyCard}><strong>No published templates</strong><p>Published versions will appear here after the existing publish workflow completes.</p></Card>
              ) : (
                <div className={styles.publishedList}>
                  {rows.map((template) => (
                    <Card className={styles.publishedCard} key={template.id}>
                      <div className={styles.cardHeader}>
                        <div><h3>{template.name} · v{template.version}</h3><p>{(template.questions as unknown as Question[]).length} questions{template.organization_id ? " · Organization-owned" : " · FieldLance-owned"}</p></div>
                        <StatusBadge tone={template.moderation_status === "allowed" ? "success" : "danger"}>Moderation: {statusLabel(template.moderation_status)}</StatusBadge>
                      </div>
                      {template.moderation_status !== "allowed" && <Alert tone="danger" title="FieldLance moderation">{template.moderation_reason || "Restricted"}</Alert>}
                      <FormActions><Button type="button" variant="secondary" disabled={busy} onClick={() => void openDraft(template.name, template.questions as unknown as Question[], { published_template_id: template.id })}>Use as next-version draft</Button></FormActions>
                      {manage && (
                        <details className={styles.moderationDetails}>
                          <summary>Moderation actions</summary>
                          <div className={styles.moderationPanel}>
                            <Textarea
                              label="Moderation reason"
                              maxLength={1000}
                              value={moderationNotes[template.id] || ""}
                              onChange={(event) => setModerationNotes((current) => ({ ...current, [template.id]: event.target.value }))}
                              placeholder={template.moderation_status === "allowed" ? "Reason for blocking or removing this template" : "Reason for restoring this template"}
                            />
                            <FormActions>
                              {template.moderation_status === "allowed" ? (
                                <>
                                  <Button type="button" variant="danger" disabled={busy} onClick={() => void moderateTemplate(template, "block")}>Block</Button>
                                  <Button type="button" variant="danger" disabled={busy} onClick={() => void moderateTemplate(template, "remove")}>Remove from operation</Button>
                                </>
                              ) : (
                                <Button type="button" variant="primary" disabled={busy} onClick={() => void moderateTemplate(template, "restore")}>Restore</Button>
                              )}
                            </FormActions>
                          </div>
                        </details>
                      )}
                    </Card>
                  ))}
                </div>
              )}
              <Pager page={page} more={more} busy={busy} onChange={setPage} />
            </section>
          )}
        </div>
      )}
    </section>
  );
}
