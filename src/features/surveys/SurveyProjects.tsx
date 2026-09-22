import {AreaSelector} from "../geography/AreaSelector";
import {selectableArea} from "../geography/areaSelection";
import { useEffect, useState, type FormEvent } from "react";
import { db, rpc } from "../../lib/supabase/client";
import { geographyPath, type Geo } from "../geography/model";
import { Org, Project, Template, get } from "./model";
import { Pager } from "../../components/ui/Pager";
import { SurveyProjectDetail } from "./SurveyProjectDetail";
import { SurveyProjectDrafts } from "./SurveyProjectDrafts";
export function SurveyProjects({
  userId,
  organization,
  projectId,
  manage,
  review,
  manageAssignments,
  orgs,
  geographies,
  openRecruitment,
  onBackToWorkspace,
  workspaceMode = "full",
  openWorkspace,
}: {
  userId: string;
  organization: string | null;
  projectId?: string | null;
  manage: boolean;
  review: boolean;
  manageAssignments: boolean;
  orgs: Org[];
  geographies: Geo[];
  openRecruitment?: () => void;
  onBackToWorkspace?: () => void;
  workspaceMode?: "full" | "field-work" | "responses";
  openWorkspace?: (project: Project) => void;
}) {
  const [collectionArea,setCollectionArea]=useState<string|null>(null);
  const [createOrganization,setCreateOrganization]=useState("");
  const [rows, setRows] = useState<Project[]>([]),
    [templates, setTemplates] = useState<Template[]>([]),
    [chosen, setChosen] = useState<Project | null>(null),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [rev, setRev] = useState(0),
    [create, setCreate] = useState(false),
    [moderationNotes, setModerationNotes] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    setBusy(true);
    setRows([]);
    async function load() {
      let q = db!
        .from("survey_projects")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id")
        .range(page * 50, page * 50 + 50);
      if (organization) q = q.eq("organization_id", organization);
      if (projectId) q = q.eq("id", projectId);
      if (!manage && !review) {
        const a = await db!
          .from("survey_assignments")
          .select("project_id")
          .eq("user_id", userId)
          .eq("active", true)
          .limit(1000);
        if (a.error) throw a.error;
        q = q.in(
          "id",
          (a.data || []).map((a) => a.project_id),
        );
      }
      const r = await q;
      if (r.error) throw r.error;
      if (live) {
        setRows((r.data || []).slice(0, 50));
        setMore((r.data || []).length > 50);
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
  }, [userId, organization, projectId, manage, review, page, rev]);
  useEffect(() => {
    if (!projectId || chosen || rows.length !== 1 || rows[0].id !== projectId) return;
    setChosen(rows[0]);
  }, [projectId, rows, chosen]);
  useEffect(() => {
    if (!create) return;
    db!
      .from("survey_templates")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000)
      .then((r) => {
        if (r.error) setError(r.error.message);
        else setTemplates((r.data || []).filter((template) => template.moderation_status === "allowed"));
      });
  }, [create]);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if(!selectableArea(collectionArea,geographies)){setError("Choose an active collection area before creating the project.");return;}
    setBusy(true);
    setError("");
    try {
      await rpc("create_survey_project", {
        p_org: get(f, "org"),
        p_title: get(f, "title"),
        p_template: get(f, "template"),
        p_geography: collectionArea!,
        p_target: Number(get(f, "target")),
        p_start: get(f, "start"),
        p_end: get(f, "end"),
        p_purpose: get(f, "purpose"),
        p_consent_version: get(f, "consent_version"),
        p_consent_notice: get(f, "notice"),
      });
      setCreate(false);
      setCreateOrganization("");
      setCollectionArea(null);
      setRev((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function moderateProject(project: Project, action: "block" | "remove" | "restore") {
    const reason = (moderationNotes[project.id] || "").trim();
    if (reason.length < 3) {
      setError("Enter a moderation reason of at least 3 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await rpc("moderate_survey_project", { p_id: project.id, p_action: action, p_reason: reason });
      setModerationNotes((current) => ({ ...current, [project.id]: "" }));
      setRev((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (chosen)
    return (
      <SurveyProjectDetail
        key={chosen.id}
        project={chosen}
        userId={userId}
        manage={manage}
        review={review}
        manageAssignments={manageAssignments}
        geographies={geographies}
        openRecruitment={openRecruitment}
        workspaceMode={workspaceMode}
        openWorkspace={openWorkspace}
        backLabel={projectId ? "Project workspace" : "All projects"}
        back={() => {
          if (projectId && onBackToWorkspace) {
            onBackToWorkspace();
            return;
          }
          setChosen(null);
          setRev((n) => n + 1);
        }}
      />
    );
  return (
    <section className="panel detail">
      <div className="panel-title">
        <h2>Survey projects</h2>
        {manage && (
          <button className="primary" onClick={() => { setCreate(!create); setCreateOrganization(""); }}>
            Create project
          </button>
        )}
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {organization && !manage && (
        <SurveyProjectDrafts
          organization={organization}
          geographies={geographies}
          onChanged={() => setRev((n) => n + 1)}
        />
      )}
      {create && (
        <form onSubmit={save}>
          <div className="form-grid">
            <label className="field">
              Project title
              <input name="title" required minLength={3} maxLength={150} />
            </label>
            <label className="field">
              NGO
              <select name="org" required value={createOrganization} onChange={(event) => setCreateOrganization(event.target.value)}>
                <option value="">Choose NGO</option>
                {orgs
                  .filter((o) => o.status === "active")
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              Published template
              <select name="template" required>
                <option value="">Choose version</option>
                {templates
                  .filter((t) => Boolean(createOrganization) && t.moderation_status === "allowed" && (t.organization_id === null || t.organization_id === createOrganization))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · v{t.version}{t.organization_id ? " · NGO" : " · FieldLance"}
                    </option>
                  ))}
              </select>
            </label>
            <AreaSelector rows={geographies} value={collectionArea} onChange={setCollectionArea} title="Collection area" disabled={busy}/>
            <label className="field">
              Target responses
              <input
                name="target"
                type="number"
                required
                min={1}
                max={1000000}
              />
            </label>
            <label className="field">
              Start date
              <input name="start" type="date" required />
            </label>
            <label className="field">
              End date
              <input name="end" type="date" required />
            </label>
            <label className="field">
              Consent version
              <input name="consent_version" required maxLength={100} />
            </label>
          </div>
          <label className="field">
            Collection purpose
            <textarea name="purpose" required minLength={10} maxLength={2000} />
          </label>
          <label className="field">
            Consent notice
            <textarea name="notice" required minLength={20} maxLength={5000} />
          </label>
          <p>
            Project template, purpose and consent wording are fixed after
            creation. Use a new project if these change.
          </p>
          <button className="primary" disabled={busy}>
            Create project
          </button>
        </form>
      )}
      {busy && <p role="status">Loading projects…</p>}
      {rows.map((p) => (
        <article key={p.id} className="document-row">
          <h3>{p.title}</h3>
          <p>
            {p.status} · moderation {p.moderation_status} · {p.start_date} – {p.end_date} · target {p.target}
          </p>
          {p.moderation_status !== "allowed" && (
            <p className="notice error">FieldLance moderation: {p.moderation_reason || "Restricted"}</p>
          )}
          <p>
            {geographyPath(p.geography_id, geographies)
              .map((g) => g.name)
              .join(" / ")}
          </p>
          <div className="actions">
            <button className="secondary" onClick={() => setChosen(p)}>Open project</button>
          </div>
          {manage && (
            <div className="review">
              <label className="field">
                Moderation reason
                <textarea
                  maxLength={1000}
                  value={moderationNotes[p.id] || ""}
                  onChange={(event) => setModerationNotes((current) => ({ ...current, [p.id]: event.target.value }))}
                  placeholder={p.moderation_status === "allowed" ? "Reason for blocking or removing this project" : "Reason for restoring or changing moderation"}
                />
              </label>
              <div className="actions">
                {p.moderation_status === "allowed" ? (
                  <>
                    <button type="button" disabled={busy} onClick={() => void moderateProject(p, "block")}>Block</button>
                    <button type="button" disabled={busy} onClick={() => void moderateProject(p, "remove")}>Remove from operation</button>
                  </>
                ) : (
                  <button className="primary" type="button" disabled={busy} onClick={() => void moderateProject(p, "restore")}>Restore</button>
                )}
              </div>
            </div>
          )}
        </article>
      ))}
      {!busy && !rows.length && <p>No projects available in this workspace.</p>}
      <Pager page={page} more={more} busy={busy} onChange={setPage} />
    </section>
  );
}
