import { useEffect, useMemo, useState, type FormEvent } from "react";
import { db, rpc } from "../../lib/supabase/client";
import type { Database, Json } from "../../lib/supabase/database.types";
import { geographyPath, type Geo } from "../geography/model";
import { human } from "../../shared/ui/FormFields";

type Tables = Database["public"]["Tables"];
type Project = Tables["survey_projects"]["Row"];
type Opportunity = Tables["work_opportunities"]["Row"];
type Application = Tables["work_applications"]["Row"];
type Assignment = Tables["work_assignments"]["Row"];
type Mode = "personal" | "ngo" | "poem";
type Org = { id: string; name: string; status: string };
type AvailableRow = Pick<Opportunity, "id" | "organization_id" | "title" | "description" | "geography_id" | "start_date" | "end_date" | "reply_by" | "payment_type" | "payment_note" | "status" | "survey_project_id" | "required_volunteers" | "required_skill" | "required_language" | "created_at"> & {
  organization_name: string;
  project_title: string;
  application_status: string | null;
  invitation_status: string | null;
};
type Candidate = {
  user_id: string;
  details: Record<string, string>;
  geography_id: string | null;
  shortlist_status: string | null;
  approved_surveys: number;
  reviewed_surveys: number;
  approval_rate: number | null;
  completed_assignments: number;
  verified_experiences: number;
  source_kind: "application" | "invitation" | "shortlist" | null;
  source_id: string | null;
  match_label: string;
};
const val = (f: FormData, k: string) => String(f.get(k) || "");
const money = (a: Assignment) =>
  a.work_mode === "paid"
    ? `${a.currency} ${Number(a.rate || 0).toLocaleString()} · ${human(a.compensation_type)}`
    : "Volunteer / unpaid";

export function WorkforceMarketplace({
  userId,
  organization,
  mode,
  geographies,
  orgs,
}: {
  userId: string;
  organization: string | null;
  mode: Mode;
  geographies: Geo[];
  orgs: Org[];
}) {
  const [projects, setProjects] = useState<Project[]>([]),
    [opportunities, setOpportunities] = useState<Opportunity[]>([]),
    [available, setAvailable] = useState<AvailableRow[]>([]),
    [applications, setApplications] = useState<Application[]>([]),
    [assignments, setAssignments] = useState<Assignment[]>([]),
    [candidates, setCandidates] = useState<Candidate[]>([]),
    [projectId, setProjectId] = useState(""),
    [query, setQuery] = useState(""),
    [offer, setOffer] = useState<Candidate | null>(null),
    [create, setCreate] = useState(false),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [revision, setRevision] = useState(0);

  async function load() {
    setBusy(true);
    setError("");
    try {
      if (mode === "personal") {
        const [a, w, open] = await Promise.all([
          db!.from("work_applications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(200),
          db!.from("work_assignments").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(200),
          rpc("available_work_opportunities", { p_page: 0 }),
        ]);
        if (a.error) throw a.error;
        if (w.error) throw w.error;
        setApplications(a.data || []);
        setAssignments(w.data || []);
        const result = open as unknown as { rows: AvailableRow[] };
        setAvailable(result.rows || []);
        setProjects([]);
        setOpportunities([]);
      } else {
        let p = db!.from("survey_projects").select("*").order("created_at", { ascending: false }).limit(500);
        let o = db!.from("work_opportunities").select("*").not("survey_project_id", "is", null).order("created_at", { ascending: false }).limit(500);
        let a = db!.from("work_applications").select("*").order("created_at", { ascending: false }).limit(500);
        let w = db!.from("work_assignments").select("*").order("created_at", { ascending: false }).limit(500);
        if (mode === "ngo" && organization) {
          p = p.eq("organization_id", organization);
          o = o.eq("organization_id", organization);
          a = a.eq("organization_id", organization);
          w = w.eq("organization_id", organization);
        }
        const result = await Promise.all([p, o, a, w]);
        for (const r of result) if (r.error) throw r.error;
        setProjects(result[0].data || []);
        setOpportunities(result[1].data || []);
        setApplications(result[2].data || []);
        setAssignments(result[3].data || []);
        setAvailable([]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [mode, organization, userId, revision]);

  async function act(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(success);
      setOffer(null);
      setRevision((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function findCandidates(e: FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setBusy(true);
    setError("");
    try {
      const data = (await rpc("project_workforce_candidates", {
        p_project: projectId,
        p_query: query,
        p_page: 0,
      })) as unknown as { rows: Candidate[] };
      setCandidates(data.rows || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function createOpportunity(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    act(
      () =>
        rpc("create_project_opportunity", {
          p_project: val(f, "project"),
          p_title: val(f, "title"),
          p_description: val(f, "description"),
          p_geography: val(f, "geo"),
          p_start: val(f, "start"),
          p_end: val(f, "end"),
          p_reply_by: new Date(val(f, "reply")).toISOString(),
          p_payment: val(f, "payment"),
          p_payment_note: val(f, "payment_note"),
          p_required_volunteers: Number(val(f, "positions")),
          p_required_skill: val(f, "skill"),
          p_required_language: val(f, "language"),
        }),
      "Project opportunity published.",
    );
    setCreate(false);
  }

  function offerAssignment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!offer || !projectId || !offer.source_kind) return;
    const f = new FormData(e.currentTarget);
    const paid = val(f, "work_mode") === "paid";
    act(
      () =>
        rpc("create_work_assignment", {
          p_project: projectId,
          p_user: offer.user_id,
          p_source_kind: offer.source_kind!,
          p_source_id: offer.source_kind === "shortlist" ? null : offer.source_id,
          p_work_mode: val(f, "work_mode"),
          p_compensation_type: paid ? val(f, "compensation") : "none",
          p_currency: val(f, "currency") || "PKR",
          p_rate: paid ? Number(val(f, "rate")) : null,
          p_target_surveys: Number(val(f, "target")),
          p_start: val(f, "start"),
          p_end: val(f, "end"),
          p_terms_note: val(f, "terms"),
        }),
      "Assignment offer sent. Survey access starts only after volunteer acceptance.",
    );
  }

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const orgMap = useMemo(() => new Map(orgs.map((o) => [o.id, o.name])), [orgs]);
  const activeProjects = projects.filter((p) => p.status === "active");
  const chosenProject = projectMap.get(projectId);

  return (
    <section className="panel detail workforce-marketplace">
      <div className="panel-title">
        <div>
          <h2>{mode === "personal" ? "Volunteer marketplace" : mode === "ngo" ? "NGO workforce marketplace" : "POEM workforce oversight"}</h2>
          <p>
            {mode === "personal"
              ? "Apply for local survey work and accept formal assignment terms before field access starts."
              : mode === "ngo"
                ? "Recruit active local volunteers, review applications and manage formal project assignments."
                : "Read-only oversight of applications and project assignments across partner NGOs."}
          </p>
        </div>
        {mode === "ngo" && <button className="primary" onClick={() => setCreate((v) => !v)}>Create project opportunity</button>}
      </div>
      {error && <p className="notice error" role="alert">{error}</p>}
      {message && <p className="notice success" role="status">{message}</p>}
      {busy && <p role="status">Loading workforce records…</p>}

      {mode === "personal" && (
        <>
          <h3>Available local survey work</h3>
          {available.map((o) => (
            <article className="document-row" key={o.id}>
              <strong>{o.title}</strong>
              <p>{o.organization_name} · {o.project_title}</p>
              <p>{o.description}</p>
              <p>{o.start_date} → {o.end_date} · {human(o.payment_type)} · {o.required_volunteers} position(s)</p>
              {(o.required_skill || o.required_language) && <p>Criteria: {o.required_skill || "Any skill"} · {o.required_language || "Any language"}</p>}
              {o.application_status ? <span className="badge">Application: {human(o.application_status)}</span> : o.invitation_status ? <span className="badge">Invitation: {human(o.invitation_status)}</span> : (
                <button className="primary" disabled={busy} onClick={() => {
                  const note = window.prompt("Optional application note (max 2000 characters):", "Available for this project and able to work in the listed area.");
                  if (note !== null) void act(() => rpc("apply_work_opportunity", { p_opportunity: o.id, p_note: note }), "Application submitted.");
                }}>Apply</button>
              )}
            </article>
          ))}
          {!busy && !available.length && <p className="empty">No matching open opportunities. Your profile location, skills/languages and profile-sharing choices control what appears here.</p>}

          <h3>My applications</h3>
          {applications.map((a) => (
            <article className="document-row" key={a.id}>
              <strong>{a.opportunity_title}</strong>
              <p>{a.organization_name} · {a.project_title}</p>
              <p>{human(a.status)} · {new Date(a.updated_at).toLocaleString()}</p>
              {a.review_note && <p>NGO review: {a.review_note}</p>}
              {["pending", "shortlisted", "selected"].includes(a.status) && <button className="secondary" disabled={busy} onClick={() => void act(() => rpc("withdraw_work_application", { p_id: a.id, p_version: a.version }), "Application withdrawn.")}>Withdraw</button>}
            </article>
          ))}

          <h3>My project assignments</h3>
          {assignments.map((a) => (
            <article className="document-row" key={a.id}>
              <strong>{a.project_title} · {human(a.status)}</strong>
              <p>{a.organization_name}{a.opportunity_title ? ` · ${a.opportunity_title}` : ""}</p>
              <p>{a.start_date} → {a.end_date} · Target {a.target_surveys} surveys · {money(a)}</p>
              <p>{a.terms_note}</p>
              {a.completion_note && <p>Completion: {a.completion_note}</p>}
              {a.cancellation_note && <p>Cancellation: {a.cancellation_note}</p>}
              {a.status === "offered" && <div className="actions">
                <button className="primary" disabled={busy} onClick={() => void act(() => rpc("respond_work_assignment", { p_id: a.id, p_status: "accepted", p_version: a.version }), "Assignment accepted. Field access is active within assignment dates.")}>Accept assignment</button>
                <button className="secondary" disabled={busy} onClick={() => void act(() => rpc("respond_work_assignment", { p_id: a.id, p_status: "declined", p_version: a.version }), "Assignment declined.")}>Decline</button>
              </div>}
            </article>
          ))}
          {!assignments.length && <p>No formal project assignments yet.</p>}
        </>
      )}

      {mode === "ngo" && create && (
        <form onSubmit={createOpportunity} className="review">
          <h3>Publish survey-project opportunity</h3>
          <div className="form-grid">
            <label className="field">Survey project<select name="project" required defaultValue=""><option value="">Choose active project</option>{activeProjects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
            <label className="field">Opportunity title<input name="title" required minLength={3} maxLength={150} /></label>
            <label className="field">Work area<select name="geo" required defaultValue=""><option value="">Choose project area / sub-area</option>{geographies.filter((g) => geographyPath(g.id, geographies).every((n) => n.active)).map((g) => <option key={g.id} value={g.id}>{geographyPath(g.id, geographies).map((n) => n.name).join(" / ")}</option>)}</select></label>
            <label className="field">Positions<input name="positions" type="number" min={1} max={5000} defaultValue={1} required /></label>
            <label className="field">Start<input name="start" type="date" required /></label>
            <label className="field">End<input name="end" type="date" required /></label>
            <label className="field">Reply deadline<input name="reply" type="datetime-local" required /></label>
            <label className="field">Work mode<select name="payment" defaultValue="unpaid"><option value="unpaid">Volunteer / unpaid</option><option value="paid">Paid</option></select></label>
            <label className="field">Required skill (optional)<input name="skill" maxLength={100} /></label>
            <label className="field">Required language (optional)<input name="language" maxLength={100} /></label>
          </div>
          <label className="field">Expected field tasks<textarea name="description" minLength={10} maxLength={4000} required /></label>
          <label className="field">Proposed payment / expense note<textarea name="payment_note" maxLength={1000} /></label>
          <div className="actions"><button className="secondary" type="button" onClick={() => setCreate(false)}>Cancel</button><button className="primary" disabled={busy}>Publish opportunity</button></div>
        </form>
      )}

      {mode !== "personal" && (
        <>
          {mode === "ngo" && <>
            <h3>Find active local volunteers</h3>
            <form onSubmit={findCandidates}>
              <div className="form-grid">
                <label className="field">Survey project<select value={projectId} onChange={(e) => { setProjectId(e.target.value); setCandidates([]); setOffer(null); }} required><option value="">Choose active project</option>{activeProjects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
                <label className="field">Name / skill / language<input value={query} maxLength={100} onChange={(e) => setQuery(e.target.value)} /></label>
              </div>
              <button className="secondary" disabled={busy || !projectId}>Search local candidates</button>
            </form>
            {candidates.map((c) => {
              const d = c.details || {};
              return <article className="document-row" key={c.user_id}>
                <strong>{d.full_name || c.user_id} · {human(c.match_label === "local_verified" ? "local_active" : c.match_label)}</strong>
                <p>{d.skills || "Skills not listed"} · {d.languages || "Languages not listed"}</p>
                <p>Approved surveys: {c.approved_surveys} · Reviewed: {c.reviewed_surveys} · Approval rate: {c.approval_rate === null ? "Insufficient data" : `${c.approval_rate}%`} · Completed assignments: {c.completed_assignments} · Verified experience entries: {c.verified_experiences}</p>
                <p>Selection source: {c.source_kind ? human(c.source_kind) : "No accepted application/invitation or selected shortlist yet"}</p>
                <button className="primary" disabled={busy || !c.source_kind} onClick={() => setOffer(c)}>Offer assignment</button>
              </article>;
            })}
            {offer && chosenProject && <form onSubmit={offerAssignment} className="review">
              <h3>Assignment terms for {offer.details.full_name || offer.user_id}</h3>
              <p>Project: {chosenProject.title}. Terms become an immutable snapshot when offered.</p>
              <div className="form-grid">
                <label className="field">Work mode<select name="work_mode" defaultValue="volunteer"><option value="volunteer">Volunteer / unpaid</option><option value="paid">Paid</option></select></label>
                <label className="field">Compensation basis<select name="compensation" defaultValue="per_verified_survey"><option value="per_verified_survey">Per verified survey</option><option value="daily_rate">Daily rate</option><option value="fixed_assignment">Fixed assignment</option></select></label>
                <label className="field">Currency<input name="currency" defaultValue="PKR" maxLength={3} /></label>
                <label className="field">Rate<input name="rate" type="number" min="0.01" step="0.01" /></label>
                <label className="field">Survey target<input name="target" type="number" min={1} max={1000000} required /></label>
                <label className="field">Start<input name="start" type="date" defaultValue={chosenProject.start_date} required /></label>
                <label className="field">End<input name="end" type="date" defaultValue={chosenProject.end_date} required /></label>
              </div>
              <label className="field">Terms / deliverables<textarea name="terms" minLength={5} maxLength={3000} required defaultValue="Complete assigned field surveys according to POEM data-quality, consent and project rules." /></label>
              <div className="actions"><button type="button" className="secondary" onClick={() => setOffer(null)}>Cancel</button><button className="primary" disabled={busy}>Send formal offer</button></div>
            </form>}
          </>}

          <h3>{mode === "poem" ? "Applications across partner NGOs" : "Project applications"}</h3>
          {applications.map((a) => <article className="document-row" key={a.id}>
            <strong>{a.volunteer_name} · {human(a.status)}</strong>
            <p>{projectMap.get(a.survey_project_id)?.title || a.survey_project_id} · {orgMap.get(a.organization_id) || a.organization_id}</p>
            {a.note && <p>Volunteer: {a.note}</p>}{a.review_note && <p>Review: {a.review_note}</p>}
            {mode === "ngo" && ["pending", "shortlisted", "selected"].includes(a.status) && <div className="actions">
              {(["shortlisted", "selected", "rejected"] as const).map((status) => <button key={status} className={status === "selected" ? "primary" : "secondary"} disabled={busy} onClick={() => {
                const note = window.prompt(`Review note for ${human(status)}:`, status === "selected" ? "Selected for a formal assignment offer." : "Reviewed by NGO project administrator.");
                if (note) void act(() => rpc("review_work_application", { p_id: a.id, p_status: status, p_note: note, p_version: a.version }), `Application marked ${human(status)}.`);
              }}>{human(status)}</button>)}
            </div>}
          </article>)}
          {!applications.length && <p>No applications in this workspace.</p>}

          <h3>{mode === "poem" ? "Assignment oversight" : "Project assignments"}</h3>
          {assignments.map((a) => <AssignmentCard key={a.id} assignment={a} project={projectMap.get(a.survey_project_id)} orgName={orgMap.get(a.organization_id)} mode={mode} busy={busy} act={act} />)}
          {!assignments.length && <p>No workforce assignments in this workspace.</p>}
        </>
      )}

      {mode === "ngo" && opportunities.length > 0 && <p>Published linked opportunities: {opportunities.length}. Invitation responses remain available in the existing Invitations workspace.</p>}
    </section>
  );
}

function AssignmentCard({ assignment: a, project, orgName, mode, busy, act }: {
  assignment: Assignment;
  project?: Project;
  orgName?: string;
  mode: Mode;
  busy: boolean;
  act: (fn: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  const [complete, setComplete] = useState(false);
  return <article className="document-row">
    <strong>{a.volunteer_name} · {human(a.status)}</strong>
    <p>{a.project_title || project?.title || a.survey_project_id} · {a.organization_name || orgName || a.organization_id}</p>
    <p>{a.start_date} → {a.end_date} · Target {a.target_surveys} · {money(a)}</p>
    <p>{a.terms_note}</p>
    {a.completion_note && <p>Completion: {a.completion_note}</p>}
    {a.cancellation_note && <p>Cancellation: {a.cancellation_note}</p>}
    {mode === "ngo" && a.status === "active" && <div className="actions">
      <button className="primary" disabled={busy} onClick={() => setComplete((v) => !v)}>Complete assignment</button>
      <button className="secondary" disabled={busy} onClick={() => {
        const note=window.prompt("Cancellation reason:","Assignment cancelled by NGO project administrator.");
        if(note) void act(() => rpc("cancel_work_assignment",{p_id:a.id,p_note:note,p_version:a.version}),"Assignment cancelled and survey access revoked.");
      }}>Cancel assignment</button>
    </div>}
    {mode === "ngo" && a.status === "offered" && <button className="secondary" disabled={busy} onClick={() => {
      const note=window.prompt("Cancellation reason:","Assignment offer withdrawn by NGO.");
      if(note) void act(() => rpc("cancel_work_assignment",{p_id:a.id,p_note:note,p_version:a.version}),"Assignment offer cancelled.");
    }}>Withdraw offer</button>}
    {complete && mode === "ngo" && <form className="review" onSubmit={(e) => {
      e.preventDefault();const f=new FormData(e.currentTarget);
      const feedback: Json={professionalism:Number(val(f,"professionalism")),communication:Number(val(f,"communication")),field_discipline:Number(val(f,"discipline")),data_quality:Number(val(f,"quality")),task_completion:Number(val(f,"completion"))};
      void act(() => rpc("complete_work_assignment",{p_id:a.id,p_feedback:feedback,p_note:val(f,"note"),p_version:a.version}),"Assignment completed and added to verified POEM work history.");
    }}>
      <h4>Structured completion feedback</h4>
      <div className="form-grid">{[["professionalism","Professionalism"],["communication","Communication"],["discipline","Field discipline"],["quality","Data quality"],["completion","Task completion"]].map(([name,label]) => <label className="field" key={name}>{label}<select name={name} defaultValue="5">{[1,2,3,4,5].map((n)=><option key={n} value={n}>{n} / 5</option>)}</select></label>)}</div>
      <label className="field">Completion note<textarea name="note" minLength={5} maxLength={3000} required /></label>
      <button className="primary" disabled={busy}>Confirm completion</button>
    </form>}
  </article>;
}
