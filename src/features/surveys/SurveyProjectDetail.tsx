import { useEffect, useState, type FormEvent } from "react";
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
import { Pager } from "./Pager";
import { SurveyForm } from "./SurveyForm";
export function SurveyProjectDetail({
  project,
  userId,
  manage,
  review,
  geographies,
  back,
}: {
  project: Project;
  userId: string;
  manage: boolean;
  review: boolean;
  geographies: Geo[];
  back: () => void;
}) {
  const [registryPerson, setRegistryPerson] = useState<string | null>(null);
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
    [candidates, setCandidates] = useState<
      { user_id: string; details: Record<string, string> }[]
    >([]),
    [query, setQuery] = useState(""),
    [revisions, setRevisions] = useState<
      Tables["survey_response_revisions"]["Row"][]
    >([]);
  useEffect(() => {
    let live = true;
    setBusy(true);
    setError("");
    async function load() {
      let r = db!
        .from("survey_responses")
        .select("*")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false })
        .order("id")
        .range(page * 50, page * 50 + 50);
      if (!review) r = r.eq("collector_id", userId);
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
  }, [project.id, page, registryPage, lookup, rev, review, userId]);
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
  async function findVolunteers(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const result = await rpc("survey_assignment_candidates", {
        p_project: project.id,
        p_query: query,
      });
      setCandidates(result as unknown as typeof candidates);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const assigned = assignments.some((a) => a.user_id === userId && a.active);
  return (
    <section className="panel detail">
      <button className="link" onClick={back}>
        ← All projects
      </button>
      <h2>{project.title}</h2>
      <p>
        {template?.name} · v{template?.version} · {project.status}
      </p>
      <p>{project.purpose}</p>
      <p>
        Visible records: {counts.submitted} submitted · {counts.approved}{" "}
        approved · {counts.correction} need correction. Project target:{" "}
        {project.target}.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {manage && project.status === "active" && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                "Close collection for this project? Existing records remain available for review.",
              )
            )
              act(
                () => rpc("close_survey_project", { p_id: project.id }),
                "Project closed. Return to the project list to refresh status.",
              );
          }}
        >
          Close collection
        </button>
      )}
      {review && (
        <details className="survey-question">
          <summary>Manage surveyor assignments</summary>
          <form onSubmit={findVolunteers}>
            <label className="field">
              Find a verified volunteer sharing with this NGO
              <input
                value={query}
                maxLength={100}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <button className="secondary">Search first 50 matches</button>
          </form>
          {candidates.map((p) => (
            <div className="share-row" key={p.user_id}>
              <span>{p.details.full_name || p.user_id}</span>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  act(
                    () =>
                      rpc("set_survey_assignment", {
                        p_project: project.id,
                        p_user: p.user_id,
                        p_active: true,
                      }),
                    "Surveyor assigned.",
                  )
                }
              >
                Assign
              </button>
            </div>
          ))}
          {assignments.map((a) => (
            <div className="share-row" key={a.user_id}>
              <span>
                {a.user_id} · {a.active ? "active" : "inactive"}
              </span>
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
      {assigned && project.status === "active" && (
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
      {collect && template && (
        <SurveyForm
          key={editing?.id || "new"}
          project={project}
          template={template}
          response={editing}
          people={people}
          households={houses}
          busy={busy}
          cancel={() => {
            setCollect(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCollect(false);
            setEditing(null);
            setMessage("Survey saved.");
            setRev((n) => n + 1);
          }}
        />
      )}
      {review && (
        <NeedsPanel
          refreshKey={rev}
          projectId={project.id}
          onChanged={() => setRev((n) => n + 1)}
        />
      )}
      <h3>Responses</h3>
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
      <Pager page={page} more={more} busy={busy} change={setPage} />
      {selected && (
        <section className="survey-question">
          <h3>Response detail</h3>
          {((template?.questions as unknown as Question[]) || []).map((q) => (
            <p key={q.id}>
              <strong>{q.label}:</strong>{" "}
              {String((selected.answers as Record<string, Json>)[q.id] ?? "—")}
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
      {review && registryPerson && (
        <RegistryOperations
          refreshKey={rev}
          key={registryPerson}
          personId={registryPerson}
          close={() => setRegistryPerson(null)}
          changed={() => setRev((n) => n + 1)}
        />
      )}
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
            POEM-BEN-{String(p.registry_no).padStart(8, "0")} · {p.full_name}
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
        change={setRegistryPage}
      />
    </section>
  );
}
