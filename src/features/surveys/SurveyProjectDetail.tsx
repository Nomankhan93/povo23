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
  return (
    <section className="panel detail">
      <button className="link" onClick={back}>
        ← {backLabel}
      </button>
      <h2>{project.title}</h2>
      <p>
        {template?.name} · v{template?.version} · {project.status} · moderation {project.moderation_status}
      </p>
      <p>{project.purpose}</p>
      <p>
        Visible records: {counts.submitted} submitted · {counts.approved}{" "}
        approved · {counts.correction} need correction. Project target:{" "}
        {project.target}.
      </p>
      {openWorkspace && workspaceMode === "full" && (
        <button className="secondary" type="button" onClick={() => openWorkspace(project)}>
          Open full project workspace
        </button>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {project.moderation_status !== "allowed" && (
        <p className="notice error" role="status">
          FieldLance moderation is active: {project.moderation_reason || "This project is restricted."} Historical records remain available, but new recruitment, assignments and field collection are paused.
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {showFieldWork && review && project.status === "active" && project.moderation_status === "allowed" && openRecruitment && (
        <button className="secondary" onClick={openRecruitment}>
          Open project recruitment
        </button>
      )}
      {showFieldWork && manage && project.status === "active" && project.moderation_status === "allowed" && (
        <button className="secondary" disabled={busy} onClick={() => setCloseRequested(true)}>
          Close collection
        </button>
      )}
      {showFieldWork && manageAssignments && project.moderation_status === "allowed" && (
        <details className="survey-question">
          <summary>Collection access and history</summary>
          <p>Application required, then application review, formal offer and worker acceptance. A selected application or invitation does not activate collection.</p>
          {openRecruitment && <button className="secondary" onClick={openRecruitment}>Open recruitment and offers</button>}
          {assignments.map((a) => (
            <div className="share-row" key={a.user_id}>
              <span>
                {a.user_id} · {contracts.some(w => w.user_id === a.user_id) ? (a.active ? "Accepted assignment; collection subject to project eligibility" : "Collection revoked") : "Historical access only: formal offer and worker acceptance required"}
              </span>
              {contracts.some(w => w.user_id === a.user_id) && <div>
                <label className="field">Collection area
                  <select value={scope[a.user_id] || a.collection_geography_id} onChange={e => setScope(old => ({...old, [a.user_id]: e.target.value}))}>
                    {geographies.filter(g => g.id === project.geography_id || geographyPath(g.id, geographies).some(parent => parent.id === project.geography_id)).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </label>
                <button className="secondary" disabled={busy} onClick={() => void act(() => rpc("set_survey_assignment_scope", {p_project: project.id, p_user: a.user_id, p_geography: scope[a.user_id] || a.collection_geography_id, p_active: true}), "Accepted assignment collection scope updated.")}>Save scope / restore collection</button>
              </div>}
              {a.active && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    act(
                      () =>
                        rpc("set_survey_assignment", {
                          p_project: project.id,
                          p_user: a.user_id,
                          p_active: false,
                        }),
                      "Assignment revoked.",
                    )
                  }
                >
                  Revoke assignment
                </button>
              )}
            </div>
          ))}
        </details>
      )}
      {showFieldWork && assigned && project.status === "active" && project.moderation_status === "allowed" && (
        <button
          className="primary"
          disabled={busy}
          onClick={() => {
            setEditing(null);
            setCollect(true);
            setSelected(null);
          }}
        >
          Start survey
        </button>
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
      {showResponses && review && (
        <NeedsPanel
          refreshKey={rev}
          projectId={project.id}
          onChanged={() => setRev((n) => n + 1)}
        />
      )}
      {showResponses && <>
      <div className="response-toolbar">
        <div>
          <h3>Responses</h3>
          <p>Only records allowed by your current project and geography scope are returned.</p>
        </div>
        <label className="field response-status-filter">
          Status
          <select value={responseStatus} onChange={(e) => { setResponseStatus(e.target.value); setPage(0); setSelected(null); }}>
            <option value="all">All visible</option>
            <option value="submitted">Pending review</option>
            <option value="approved">Approved</option>
            <option value="correction_required">Correction required</option>
            <option value="rejected">Rejected</option>
            <option value="draft">Draft</option>
          </select>
        </label>
      </div>
      {busy && <p role="status">Loading…</p>}
      {responses.map((r) => (
        <article className="document-row" key={r.id}>
          <strong>
            {people.find((p) => p.id === r.person_id)?.full_name ||
              `Person ${r.person_id}`}
          </strong>
          <p>
            {title(r.status)} · v{r.version} ·{" "}
            {new Date(r.updated_at).toLocaleString()}
          </p>
          {r.review_note && <p>Review: {r.review_note}</p>}
          <button
            className="link"
            onClick={() => {
              setSelected(r);
              setCollect(false);
              setRevisions([]);
            }}
          >
            View answers / review
          </button>
          {r.collector_id === userId &&
            ["draft", "correction_required"].includes(r.status) && (
              <button
                className="link"
                onClick={() => {
                  setEditing(r);
                  setCollect(true);
                  setSelected(null);
                }}
              >
                Edit / resubmit
              </button>
            )}
        </article>
      ))}
      {!busy && !responses.length && <p className="empty-state">No responses match this filter in your current scope.</p>}
      <Pager page={page} more={more} busy={busy} onChange={setPage} />
      {selected && (
        <section className="survey-question">
          <h3>Response detail</h3>
          {((template?.questions as unknown as Question[]) || []).map((q) => (
            <p key={q.id}>
              <strong>{q.label}:</strong>{" "}
              {(q.type === "photo" || q.type === "document") && typeof (selected.answers as Record<string, Json>)[q.id] === "string" && (selected.answers as Record<string, Json>)[q.id] ? <AttachmentView id={String((selected.answers as Record<string, Json>)[q.id])}/> : <pre>{answerText((selected.answers as Record<string, Json>)[q.id])}</pre>}
            </p>
          ))}
          <details>
            <summary>Identity at collection / upgrade baseline</summary>
            <pre className="survey-json">
              {JSON.stringify(selected.identity_snapshot, null, 2)}
            </pre>
          </details>
          <h4>Recorded consent</h4>
          <pre className="survey-json">
            {JSON.stringify(selected.consent, null, 2)}
          </pre>
          {review &&
            selected.status === "submitted" &&
            selected.collector_id !== userId && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  act(
                    () =>
                      rpc("review_survey_response", {
                        p_id: selected.id,
                        p_status: get(f, "status"),
                        p_note: get(f, "note"),
                        p_version: selected.version,
                      }),
                    "Survey review saved. Identity remains provisional.",
                  );
                }}
              >
                <label className="field">
                  Decision
                  <select name="status">
                    <option value="approved">Approve survey</option>
                    <option value="correction_required">
                      Correction required
                    </option>
                    <option value="rejected">Reject survey</option>
                  </select>
                </label>
                <label className="field">
                  Review note
                  <textarea
                    name="note"
                    required
                    minLength={3}
                    maxLength={2000}
                  />
                </label>
                <button className="primary" disabled={busy}>
                  Save review
                </button>
              </form>
            )}
          <button
            className="secondary"
            onClick={async () => {
              const r = await db!
                .from("survey_response_revisions")
                .select("*")
                .eq("response_id", selected.id)
                .order("version", { ascending: false })
                .limit(50);
              if (r.error) setError(r.error.message);
              else setRevisions(r.data || []);
            }}
          >
            Show latest 50 revisions
          </button>
          {revisions.map((r) => (
            <details key={r.version}>
              <summary>
                Revision {r.version} ·{" "}
                {new Date(r.recorded_at).toLocaleString()}
              </summary>
              <pre className="survey-json">
                {JSON.stringify(r.snapshot, null, 2)}
              </pre>
            </details>
          ))}
        </section>
      )}
      </>}
      {showResponses && review && registryPerson && (
        <RegistryOperations
          refreshKey={rev}
          key={registryPerson}
          personId={registryPerson}
          close={() => setRegistryPerson(null)}
          changed={() => setRev((n) => n + 1)}
        />
      )}
      {showResponses && <>
      <h3>Project registry</h3>
      <p>
        Identity is provisional, even after survey approval. Reuse an existing
        person/household when you have confirmed the match; no automatic merging
        occurs.
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
      {people.map((p) => (
        <article key={p.id} className="document-row">
          <strong>
            FL-BEN-{String(p.registry_no).padStart(8, "0")} · {p.full_name}
          </strong>
          <p>
            {p.birth_date || "Birth date unknown"} · {p.identity_status}
          </p>
          <p>
            Household:{" "}
            {houses.find((h) => h.id === p.household_id)?.label ||
              p.household_id}{" "}
            ·{" "}
            {geographyPath(project.geography_id, geographies)
              .map((g) => g.name)
              .join(" / ")}
          </p>
          {review && (
            <button
              className="secondary"
              onClick={() => setRegistryPerson(p.id)}
            >
              Review identity / assistance
            </button>
          )}
        </article>
      ))}
      <Pager
        page={registryPage}
        more={registryMore}
        busy={busy}
        onChange={setRegistryPage}
      />
      </>}
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
