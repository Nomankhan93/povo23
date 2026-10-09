import { answerText } from "./capture";
import { AttachmentView } from "./CaptureFields";
import { useEffect, useState } from "react";
import { db, rpc } from "../../lib/supabase/client";
import { type Json } from "../../lib/supabase/database.types";
import { geographyPath, type Geo } from "../geography/model";
import { NeedsPanel } from "../needs/NeedsPanel";
import { RegistryOperations } from "../registry/RegistryOperations";
import {
  Household,
  Person,
  Project,
  Question,
  Response,
  Tables,
  Template,
  get,
  title,
} from "./model";
import { Pager } from "../../components/ui/Pager";
import { SurveyForm } from "./SurveyForm";
import { ActionDialog } from "../../components/ui/ActionDialog";
import { Alert, Button, Field, StatusBadge } from "../../components/ui/FieldLanceUI";
import styles from "./SurveyResponses.module.css";

function responseTone(status: string) {
  if (status === "approved") return "success" as const;
  if (status === "correction_required") return "warning" as const;
  if (status === "rejected") return "danger" as const;
  if (status === "submitted") return "info" as const;
  return "neutral" as const;
}

function asRecord(value: Json | undefined): Record<string, Json> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Json> : null;
}

function ResponseAnswer({ question, value }: { question: Question; value: Json | undefined }) {
  if ((question.type === "photo" || question.type === "document") && typeof value === "string" && value) {
    return <AttachmentView id={value} />;
  }
  if (question.type === "gps") {
    const record = asRecord(value);
    if (record) {
      if (record.unavailable_reason) return <p className={styles.answerValue}>{String(record.unavailable_reason)}</p>;
      return <div className={styles.answerDataGrid}>
        {[
          ["Latitude", record.latitude],
          ["Longitude", record.longitude],
          ["Accuracy", record.accuracy],
          ["Captured", record.captured_at],
        ].map(([label, datum]) => <div className={styles.answerDatum} key={String(label)}><span>{String(label)}</span><strong>{answerText(datum as Json)}</strong></div>)}
      </div>;
    }
  }
  if (question.type === "household" && Array.isArray(value)) {
    return <ul className={styles.householdMembers}>{value.map((member, index) => {
      const row = asRecord(member as Json);
      return <li className={styles.householdMember} key={`${question.id}:member:${index}`}>
        <strong>{row ? String(row.full_name || `Member ${index + 1}`) : `Member ${index + 1}`}</strong>
        {row ? <span>{String(row.birth_date || "Birth date unknown")} · {String(row.relationship || "Relationship not recorded")}</span> : <span>{answerText(member as Json)}</span>}
      </li>;
    })}</ul>;
  }
  if (Array.isArray(value)) {
    return <ul className={styles.answerListValues}>{value.map((item, index) => <li key={`${question.id}:value:${index}`}>{answerText(item as Json)}</li>)}</ul>;
  }
  if (value && typeof value === "object") {
    return <details><summary>Structured answer</summary><pre>{answerText(value)}</pre></details>;
  }
  return <p className={styles.answerValue}>{answerText(value)}</p>;
}

function AuditSummary({ value, label }: { value: Json; label: string }) {
  const record = asRecord(value);
  const readable = record ? Object.entries(record).filter(([, datum]) => datum === null || ["string", "number", "boolean"].includes(typeof datum)).slice(0, 4) : [];
  return <div className={styles.auditSection}>
    <div className={styles.auditSummary}>
      <strong>{label}</strong>
      {readable.length ? readable.map(([key, datum]) => <div key={key}>{key.replaceAll("_", " ")}: {answerText(datum)}</div>) : <div>Recorded technical data is available below.</div>}
    </div>
    <details><summary>Technical {label.toLowerCase()}</summary><pre>{JSON.stringify(value, null, 2)}</pre></details>
  </div>;
}
export function SurveyProjectDetail({
  project,
  userId,
  manage,
  review,
  manageAssignments,
  geographies,
  back,
  backLabel = "All projects",
  openRecruitment,
  workspaceMode = "full",
  openWorkspace,
  initialResponseId = null,
}: {
  project: Project;
  userId: string;
  manage: boolean;
  review: boolean;
  manageAssignments: boolean;
  geographies: Geo[];
  back: () => void;
  backLabel?: string;
  openRecruitment?: () => void;
  workspaceMode?: "full" | "field-work" | "responses";
  openWorkspace?: (project: Project) => void;
  initialResponseId?: string | null;
}) {
  const [collectionAllowed, setCollectionAllowed] = useState(false);
  const [contracts, setContracts] = useState<Tables["work_assignments"]["Row"][]>([]);
  const [scope, setScope] = useState<Record<string, string>>({});
  const [registryPerson, setRegistryPerson] = useState<string | null>(null);
  const [closeRequested, setCloseRequested] = useState(false);
  const showFieldWork = workspaceMode !== "responses";
  const showResponses = workspaceMode !== "field-work";
  const [template, setTemplate] = useState<Template | null>(null),
    [responses, setResponses] = useState<Response[]>([]),
    [people, setPeople] = useState<Person[]>([]),
    [houses, setHouses] = useState<Household[]>([]),
    [assignments, setAssignments] = useState<
      Tables["survey_assignments"]["Row"][]
    >([]),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [rev, setRev] = useState(0),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [editing, setEditing] = useState<Response | null>(null),
    [collect, setCollect] = useState(false),
    [selected, setSelected] = useState<Response | null>(null),
    [registryPage, setRegistryPage] = useState(0),
    [registryMore, setRegistryMore] = useState(false),
    [lookup, setLookup] = useState(""),
    [counts, setCounts] = useState({
      submitted: 0,
      approved: 0,
      correction: 0,
    }),
    [responseStatus, setResponseStatus] = useState("all"),
    [revisions, setRevisions] = useState<
      Tables["survey_response_revisions"]["Row"][]
    >([]);
  useEffect(() => {
    if (!initialResponseId) return;
    setSelected(null);
    setError("");
    let live = true;
    let q = db!.from("survey_responses").select("*").eq("id", initialResponseId).eq("project_id", project.id);
    if (!review) q = q.eq("collector_id", userId);
    void q.maybeSingle().then(({ data, error: loadError }) => {
      if (!live) return;
      if (loadError) { setError(loadError.message); return; }
      if (!data) { setError("This survey response is unavailable in your current scope."); return; }
      setSelected(data as Response);
      setCollect(false);
      setEditing(null);
      setRevisions([]);
    });
    return () => { live = false; };
  }, [initialResponseId, project.id, review, userId]);
  useEffect(() => {
    const synced = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string }>).detail;
      if (detail?.projectId === project.id) setRev((n) => n + 1);
    };
    window.addEventListener("poem:survey-synced", synced);
    return () => window.removeEventListener("poem:survey-synced", synced);
  }, [project.id]);
  useEffect(() => {
    let live = true;
    setBusy(true);
    setError("");
    async function load() {
      setCollectionAllowed(false);
      setContracts([]);
      let r = db!
        .from("survey_responses")
        .select("*")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false })
        .order("id")
        .range(page * 50, page * 50 + 50);
      if (!review) r = r.eq("collector_id", userId);
      if (responseStatus !== "all") r = r.eq("status", responseStatus);
      const result = await Promise.all([
        db!
          .from("survey_templates")
          .select("*")
          .eq("id", project.template_id)
          .single(),
        r,
        db!
          .from("registry_persons")
          .select("*")
          .eq("project_id", project.id)
          .ilike(
            "full_name",
            "%" + lookup.replaceAll("%", "").replaceAll("_", "") + "%",
          )
          .order("full_name")
          .order("id")
          .range(registryPage * 50, registryPage * 50 + 50),
        db!
          .from("survey_assignments")
          .select("*")
          .eq("project_id", project.id)
          .limit(1000),
        db!.from("work_assignments").select("*").eq("survey_project_id", project.id).eq("status", "active").not("responded_at", "is", null),
        db!.rpc("can_collect_project", { p_project: project.id }),
      ]);
      for (const x of result) if (x.error) throw x.error;
      const persons = (result[2].data || []).slice(0, 50);
      const householdIds = [...new Set(persons.map((p) => p.household_id))];
      let households: Household[] = [];
      if (householdIds.length) {
        const h = await db!
          .from("registry_households")
          .select("*")
          .in("id", householdIds);
        if (h.error) throw h.error;
        households = h.data || [];
      }
      const c = await Promise.all(
        ["submitted", "approved", "correction_required"].map((status) =>
          db!
            .from("survey_responses")
            .select("id", { count: "exact", head: true })
            .eq("project_id", project.id)
            .eq("status", status),
        ),
      );
      for (const x of c) if (x.error) throw x.error;
      if (live) {
        setTemplate(result[0].data);
        setResponses((result[1].data || []).slice(0, 50));
        setMore((result[1].data || []).length > 50);
        setPeople(persons);
        setRegistryMore((result[2].data || []).length > 50);
        setHouses(households);
        setAssignments(result[3].data || []);
        setContracts(result[4].data || []);
        setCollectionAllowed(result[5].data === true);
        setCounts({
          submitted: c[0].count || 0,
          approved: c[1].count || 0,
          correction: c[2].count || 0,
        });
      }
    }
    load()
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [project.id, page, registryPage, lookup, rev, review, userId, responseStatus]);
  async function act(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    try {
      await fn();
      setMessage(success);
      setSelected(null);
      setEditing(null);
      setCollect(false);
      setRev((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  const assigned = collectionAllowed;
  const selectedPersonName = selected
    ? people.find((person) => person.id === selected.person_id)?.full_name || `Person ${selected.person_id}`
    : "";

  const registryContent = (
    <>
      <p>
        Identity is provisional, even after survey approval. Reuse an existing person/household when you have confirmed the match; no automatic merging occurs.
      </p>
      <label className="field">
        Find existing person
        <input
          maxLength={100}
          value={lookup}
          onChange={(e) => {
            setLookup(e.target.value);
            setRegistryPage(0);
          }}
        />
      </label>
      {people.map((person) => (
        <article key={person.id} className="document-row">
          <strong>FL-BEN-{String(person.registry_no).padStart(8, "0")} · {person.full_name}</strong>
          <p>{person.birth_date || "Birth date unknown"} · {person.identity_status}</p>
          <p>
            Household: {houses.find((house) => house.id === person.household_id)?.label || person.household_id} · {geographyPath(project.geography_id, geographies).map((geography) => geography.name).join(" / ")}
          </p>
          {review && (
            <Button type="button" variant="secondary" onClick={() => setRegistryPerson(person.id)}>
              Review identity / assistance
            </Button>
          )}
        </article>
      ))}
      <Pager page={registryPage} more={registryMore} busy={busy} onChange={setRegistryPage} />
    </>
  );

  return (
    <section className={styles.projectDetail}>
      {workspaceMode === "full" && (
        <header className={styles.standaloneHeader}>
          <div className={styles.standaloneActions}>
            <Button type="button" variant="tertiary" onClick={back}>← {backLabel}</Button>
            {openWorkspace && (
              <Button type="button" variant="secondary" onClick={() => openWorkspace(project)}>Open full project workspace</Button>
            )}
          </div>
          <h2>{project.title}</h2>
          <p className={styles.standaloneMeta}>{template?.name} · v{template?.version} · {project.status} · moderation {project.moderation_status}</p>
          <p>{project.purpose}</p>
          <p className={styles.standaloneMeta}>
            Visible records: {counts.submitted} submitted · {counts.approved} approved · {counts.correction} need correction. Project target: {project.target}.
          </p>
        </header>
      )}

      {error && <Alert title="Survey workspace error" tone="danger">{error}</Alert>}
      {project.moderation_status !== "allowed" && (
        <Alert title="FieldLance moderation is active" tone="danger">
          {project.moderation_reason || "This project is restricted."} Historical records remain available, but new recruitment, assignments and field collection are paused.
        </Alert>
      )}
      {message && <Alert title="Survey workspace updated" tone="success">{message}</Alert>}

      {showFieldWork && review && project.status === "active" && project.moderation_status === "allowed" && openRecruitment && (
        <Button type="button" variant="secondary" onClick={openRecruitment}>Open project recruitment</Button>
      )}
      {showFieldWork && manage && project.status === "active" && project.moderation_status === "allowed" && (
        <Button type="button" variant="secondary" disabled={busy} onClick={() => setCloseRequested(true)}>Close collection</Button>
      )}
      {showFieldWork && manageAssignments && project.moderation_status === "allowed" && (
        <details className="survey-question">
          <summary>Collection access and history</summary>
          <p>Application required, then application review, formal offer and worker acceptance. A selected application or invitation does not activate collection.</p>
          {openRecruitment && <Button type="button" variant="secondary" onClick={openRecruitment}>Open recruitment and offers</Button>}
          {assignments.map((assignment) => (
            <div className="share-row" key={assignment.user_id}>
              <span>
                {assignment.user_id} · {contracts.some((contract) => contract.user_id === assignment.user_id)
                  ? assignment.active
                    ? "Accepted assignment; collection subject to project eligibility"
                    : "Collection revoked"
                  : "Historical access only: formal offer and worker acceptance required"}
              </span>
              {contracts.some((contract) => contract.user_id === assignment.user_id) && (
                <div>
                  <label className="field">
                    Collection area
                    <select value={scope[assignment.user_id] || assignment.collection_geography_id} onChange={(e) => setScope((old) => ({ ...old, [assignment.user_id]: e.target.value }))}>
                      {geographies
                        .filter((geography) => geography.id === project.geography_id || geographyPath(geography.id, geographies).some((parent) => parent.id === project.geography_id))
                        .map((geography) => <option key={geography.id} value={geography.id}>{geography.name}</option>)}
                    </select>
                  </label>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void act(
                      () => rpc("set_survey_assignment_scope", {
                        p_project: project.id,
                        p_user: assignment.user_id,
                        p_geography: scope[assignment.user_id] || assignment.collection_geography_id,
                        p_active: true,
                      }),
                      "Accepted assignment collection scope updated.",
                    )}
                  >
                    Save scope / restore collection
                  </Button>
                </div>
              )}
              {assignment.active && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => act(
                    () => rpc("set_survey_assignment", { p_project: project.id, p_user: assignment.user_id, p_active: false }),
                    "Assignment revoked.",
                  )}
                >
                  Revoke assignment
                </Button>
              )}
            </div>
          ))}
        </details>
      )}

      {showFieldWork && assigned && project.status === "active" && project.moderation_status === "allowed" && (
        <Button
          type="button"
          variant="primary"
          disabled={busy}
          onClick={() => {
            setEditing(null);
            setCollect(true);
            setSelected(null);
          }}
        >
          Start survey
        </Button>
      )}

      {showFieldWork && collect && template && (
        <SurveyForm
          key={editing?.id || "new"}
          project={project}
          template={template}
          response={editing}
          people={people}
          households={houses}
          userId={userId}
          busy={busy}
          cancel={() => {
            setCollect(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCollect(false);
            setEditing(null);
            setMessage("Survey saved and confirmed by the server.");
            setRev((n) => n + 1);
          }}
          onQueued={() => {
            setCollect(false);
            setEditing(null);
            setMessage("Survey protected on this device and queued for sync.");
          }}
        />
      )}

      {showResponses && review && workspaceMode !== "responses" && (
        <NeedsPanel refreshKey={rev} projectId={project.id} onChanged={() => setRev((n) => n + 1)} />
      )}

      {showResponses && (
        <section className={styles.responsesSection} aria-labelledby="survey-responses-heading">
          <div className={styles.responseToolbar}>
            <div>
              <h3 id="survey-responses-heading">Responses</h3>
              <p>Only records allowed by your current project and geography scope are returned.</p>
            </div>
            <Field label="Status" className={styles.statusFilter}>
              <select
                value={responseStatus}
                onChange={(e) => {
                  setResponseStatus(e.target.value);
                  setPage(0);
                  setSelected(null);
                }}
              >
                <option value="all">All visible</option>
                <option value="submitted">Pending review</option>
                <option value="approved">Approved</option>
                <option value="correction_required">Correction required</option>
                <option value="rejected">Rejected</option>
                <option value="draft">Draft</option>
              </select>
            </Field>
          </div>

          <div
            className={workspaceMode === "responses" ? styles.responseWorkspace : styles.responseFlow}
            data-selected={Boolean(selected)}
          >
            <div className={styles.responseListPane}>
              {busy && <p role="status">Loading responses…</p>}
              {!busy && responses.length > 0 && (
                <div className={styles.responseList}>
                  {responses.map((responseRow) => {
                    const personName = people.find((person) => person.id === responseRow.person_id)?.full_name || `Person ${responseRow.person_id}`;
                    return (
                      <article className={styles.responseItem} data-selected={selected?.id === responseRow.id} key={responseRow.id}>
                        <div className={styles.responseItemHeader}>
                          <strong>{personName}</strong>
                          <StatusBadge tone={responseTone(responseRow.status)}>{title(responseRow.status)}</StatusBadge>
                        </div>
                        <p className={styles.responseMeta}>Version {responseRow.version} · {new Date(responseRow.updated_at).toLocaleString()}</p>
                        {responseRow.review_note && <p className={styles.responseNote}>Review: {responseRow.review_note}</p>}
                        <div className={styles.responseItemActions}>
                          <Button
                            type="button"
                            variant={selected?.id === responseRow.id ? "primary" : "secondary"}
                            onClick={() => {
                              setSelected(responseRow);
                              setCollect(false);
                              setRevisions([]);
                            }}
                          >
                            View answers / review
                          </Button>
                          {responseRow.collector_id === userId && ["draft", "correction_required"].includes(responseRow.status) && (
                            <Button
                              type="button"
                              variant="tertiary"
                              onClick={() => {
                                setEditing(responseRow);
                                setCollect(true);
                                setSelected(null);
                              }}
                            >
                              Edit / resubmit
                            </Button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              {!busy && !responses.length && <p className="empty-state">No responses match this filter in your current scope.</p>}
              <Pager page={page} more={more} busy={busy} onChange={setPage} />
            </div>

            <div className={styles.responseDetailPane}>
              {selected ? (
                <article className={styles.responseDetail} aria-labelledby="selected-response-heading">
                  <Button type="button" variant="tertiary" className={styles.mobileBack} onClick={() => setSelected(null)}>
                    ← Back to responses
                  </Button>
                  <header className={styles.responseDetailHeader}>
                    <div>
                      <h3 id="selected-response-heading">{selectedPersonName}</h3>
                      <p className={styles.operationalCopy}>Response {selected.id} · version {selected.version} · updated {new Date(selected.updated_at).toLocaleString()}</p>
                    </div>
                    <StatusBadge tone={responseTone(selected.status)}>{title(selected.status)}</StatusBadge>
                  </header>
                  {selected.review_note && <Alert title="Review note" tone={selected.status === "correction_required" ? "warning" : "info"}>{selected.review_note}</Alert>}

                  <section className={styles.answerList} aria-label="Survey answers">
                    {((template?.questions as unknown as Question[]) || []).map((question) => (
                      <div className={styles.answerBlock} key={question.id}>
                        <h4>{question.label}</h4>
                        <ResponseAnswer question={question} value={(selected.answers as Record<string, Json>)[question.id]} />
                      </div>
                    ))}
                  </section>

                  <AuditSummary value={selected.consent} label="Recorded consent" />
                  <AuditSummary value={selected.identity_snapshot} label="Identity at collection / upgrade baseline" />

                  {review && selected.status === "submitted" && selected.collector_id !== userId && (
                    <form
                      className={styles.decisionPanel}
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = new FormData(e.currentTarget);
                        act(
                          () => rpc("review_survey_response", {
                            p_id: selected.id,
                            p_status: get(form, "status"),
                            p_note: get(form, "note"),
                            p_version: selected.version,
                          }),
                          "Survey review saved. Identity remains provisional.",
                        );
                      }}
                    >
                      <div>
                        <h4>Review decision</h4>
                        <p className={styles.operationalCopy}>Use the existing response decision and note rules.</p>
                      </div>
                      <Field label="Decision">
                        <select name="status">
                          <option value="approved">Approve survey</option>
                          <option value="correction_required">Correction required</option>
                          <option value="rejected">Reject survey</option>
                        </select>
                      </Field>
                      <Field label="Review note" required>
                        <textarea name="note" required minLength={3} maxLength={2000} />
                      </Field>
                      <div className={styles.detailActions}>
                        <Button variant="primary" disabled={busy}>Save review</Button>
                      </div>
                    </form>
                  )}

                  <section className={styles.revisionSection} aria-label="Revision history">
                    <div className={styles.detailActions}>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={async () => {
                          const result = await db!
                            .from("survey_response_revisions")
                            .select("*")
                            .eq("response_id", selected.id)
                            .order("version", { ascending: false })
                            .limit(50);
                          if (result.error) setError(result.error.message);
                          else setRevisions(result.data || []);
                        }}
                      >
                        Show latest 50 revisions
                      </Button>
                    </div>
                    {revisions.map((revision) => (
                      <details key={revision.version}>
                        <summary>Revision {revision.version} · {new Date(revision.recorded_at).toLocaleString()}</summary>
                        <pre>{JSON.stringify(revision.snapshot, null, 2)}</pre>
                      </details>
                    ))}
                  </section>
                </article>
              ) : (
                <div className={styles.responseDetail}>
                  <h3>Select a response</h3>
                  <p className={styles.operationalCopy}>Choose a response from the list to inspect answers, consent, identity context, review state and revision history.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {showResponses && review && workspaceMode === "responses" && (
        <section className={styles.relatedTools} aria-labelledby="related-survey-tools-heading">
          <header className={styles.relatedToolsHeader}>
            <div>
              <h3 id="related-survey-tools-heading">Related project tools</h3>
              <p className={styles.operationalCopy}>Secondary needs and identity operations remain available without competing with the primary response-review flow.</p>
            </div>
          </header>
          <details>
            <summary>Needs and case follow-up</summary>
            <NeedsPanel refreshKey={rev} projectId={project.id} onChanged={() => setRev((n) => n + 1)} />
          </details>
          <details>
            <summary>Project registry</summary>
            {registryContent}
          </details>
        </section>
      )}

      {showResponses && review && registryPerson && (
        <RegistryOperations
          refreshKey={rev}
          key={registryPerson}
          personId={registryPerson}
          close={() => setRegistryPerson(null)}
          changed={() => setRev((n) => n + 1)}
        />
      )}

      {showResponses && workspaceMode !== "responses" && (
        <section className={styles.relatedTools} aria-labelledby="project-registry-heading">
          <header className={styles.relatedToolsHeader}>
            <div>
              <h3 id="project-registry-heading">Project registry</h3>
            </div>
          </header>
          {registryContent}
        </section>
      )}

      <ActionDialog
        open={closeRequested}
        title="Close project collection?"
        description="New collection will stop. Existing responses remain available for review and project closure continues through its separate operational and finance stages."
        confirmLabel="Close collection"
        danger
        busy={busy}
        onCancel={() => setCloseRequested(false)}
        onConfirm={async () => {
          await act(() => rpc("close_survey_project", { p_id: project.id }), "Project collection closed.");
          setCloseRequested(false);
        }}
      />
    </section>

  );
}
