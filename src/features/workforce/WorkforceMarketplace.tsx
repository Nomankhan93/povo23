import { useEffect, useMemo, useState, type FormEvent } from "react";
import { db, rpc } from "../../lib/supabase/client";
import type { Database, Json } from "../../lib/supabase/database.types";
import { geographyPath, type Geo } from "../geography/model";
import { AreaSelector } from "../geography/AreaSelector";
import { human } from "../../shared/ui/FormFields";

type Tables = Database["public"]["Tables"];
type Project = Tables["survey_projects"]["Row"];
type Opportunity = Tables["work_opportunities"]["Row"];
type Application = Tables["work_applications"]["Row"];
type Assignment = Tables["work_assignments"]["Row"];
type SurveyAssignment = Tables["survey_assignments"]["Row"];
type Mode = "personal" | "ngo" | "poem";
type PersonalView = "opportunities" | "applications" | "assigned" | "all";
type Org = { id: string; name: string; status: string };
type AvailableRow = Pick<Opportunity, "id" | "organization_id" | "title" | "description" | "geography_id" | "start_date" | "end_date" | "reply_by" | "payment_type" | "payment_note" | "status" | "survey_project_id" | "required_volunteers" | "required_skill" | "required_language" | "created_at"> & {
  organization_name: string;
  project_title: string;
  application_status: string | null;
  invitation_status: string | null;
  visibility: string;
  publication_state: string;
  applications_open: boolean;
  eligibility_note: string;
  skill_match: boolean;
  language_match: boolean;
  area_match: boolean;
  can_apply: boolean;
  eligibility_reason: string;
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
  personalView = "all",
}: {
  userId: string;
  organization: string | null;
  mode: Mode;
  geographies: Geo[];
  orgs: Org[];
  personalView?: PersonalView;
}) {
  const [projects, setProjects] = useState<Project[]>([]),
    [opportunities, setOpportunities] = useState<Opportunity[]>([]),
    [available, setAvailable] = useState<AvailableRow[]>([]),
    [applications, setApplications] = useState<Application[]>([]),
    [assignments, setAssignments] = useState<Assignment[]>([]),
    [surveyAssignments, setSurveyAssignments] = useState<SurveyAssignment[]>([]),
    [candidates, setCandidates] = useState<Candidate[]>([]),
    [projectId, setProjectId] = useState(""),
    [query, setQuery] = useState(""),
    [offer, setOffer] = useState<Candidate | null>(null),
    [create, setCreate] = useState(false),
    [createProjectId, setCreateProjectId] = useState(""),
    [createArea, setCreateArea] = useState<string | null>(null),
    [applying, setApplying] = useState<AvailableRow | null>(null),
    [orgFilter, setOrgFilter] = useState(""),
    [areaFilter, setAreaFilter] = useState(""),
    [paymentFilter, setPaymentFilter] = useState(""),
    [skillFilter, setSkillFilter] = useState(""),
    [workDateFilter, setWorkDateFilter] = useState(""),
    [deadlineFilter, setDeadlineFilter] = useState(""),
    [availablePage, setAvailablePage] = useState(0),
    [availableTotal, setAvailableTotal] = useState(0),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [revision, setRevision] = useState(0);

  async function load() {
    setBusy(true);
    setError("");
    try {
      if (mode === "personal") {
        const [a, w, sa, p, open] = await Promise.all([
          db!.from("work_applications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(200),
          db!.from("work_assignments").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(200),
          db!.from("survey_assignments").select("*").eq("user_id", userId).eq("active", true).limit(500),
          db!.from("survey_projects").select("*").order("created_at", { ascending: false }).limit(500),
          rpc("available_work_opportunities", { p_page: availablePage, p_organization: orgFilter || null, p_area: areaFilter || null, p_payment: paymentFilter || null, p_skill: skillFilter, p_work_date: workDateFilter || null, p_deadline: deadlineFilter || null }),
        ]);
        if (a.error) throw a.error;
        if (w.error) throw w.error;
        if (sa.error) throw sa.error;
        if (p.error) throw p.error;
        setApplications(a.data || []);
        setAssignments(w.data || []);
        setSurveyAssignments(sa.data || []);
        setProjects(p.data || []);
        const result = open as unknown as { rows: AvailableRow[]; total: number };
        setAvailable(result.rows || []);
        setAvailableTotal(Number(result.total || 0));
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
        setSurveyAssignments([]);
        setAvailable([]);
        setAvailableTotal(0);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [mode, organization, userId, revision, orgFilter, areaFilter, paymentFilter, skillFilter, workDateFilter, deadlineFilter, availablePage]);

  async function act(fn: () => Promise<unknown>, success: string): Promise<boolean> {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(success);
      setOffer(null);
      setRevision((n) => n + 1);
      return true;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      return false;
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

  async function createOpportunity(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!createProjectId || !createArea) {
      setError("Choose a survey project and recruitment work area.");
      return;
    }
    const published = val(f, "publication") === "published";
    const ok = await act(
      () =>
        rpc("create_recruitment_opportunity", {
          p_project: createProjectId,
          p_title: val(f, "title"),
          p_description: val(f, "description"),
          p_geography: createArea,
          p_start: val(f, "start"),
          p_end: val(f, "end"),
          p_reply_by: new Date(val(f, "reply")).toISOString(),
          p_payment: val(f, "payment"),
          p_payment_note: val(f, "payment_note"),
          p_required_volunteers: Number(val(f, "positions")),
          p_required_skill: val(f, "skill"),
          p_required_language: val(f, "language"),
          p_visibility: val(f, "visibility"),
          p_eligibility_note: val(f, "eligibility_note"),
          p_publish: published,
        }),
      published ? "Project opportunity published." : "Recruitment draft created.",
    );
    if (ok) {
      setCreate(false);
      setCreateProjectId("");
      setCreateArea(null);
    }
  }

  async function submitApplication(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!applying) return;
    const f = new FormData(e.currentTarget);
    const ok = await act(
      () => rpc("apply_work_opportunity", {
        p_opportunity: applying.id,
        p_availability: val(f, "availability"),
        p_note: val(f, "message"),
        p_profile_share_consent: f.get("consent") === "on",
      }),
      "Application submitted. This consent applies only to the recruitment snapshot attached to this application.",
    );
    if (ok) setApplying(null);
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
  const chosenCreateProject = projectMap.get(createProjectId);
  const directSurveyAssignments = surveyAssignments.filter((sa) =>
    sa.active && !assignments.some((a) => a.survey_project_id === sa.project_id && ["active", "completed"].includes(a.status)),
  );
  const availablePageSize = 50;
  const availablePages = Math.max(1, Math.ceil(availableTotal / availablePageSize));
  const showOpportunities = mode !== "personal" || personalView === "all" || personalView === "opportunities";
  const showApplications = mode !== "personal" || personalView === "all" || personalView === "applications";
  const showAssigned = mode !== "personal" || personalView === "all" || personalView === "assigned";

  return (
    <section className="panel detail workforce-marketplace">
      <div className="panel-title">
        <div>
          <h2>{mode === "personal" ? (personalView === "opportunities" ? "Available Opportunities" : personalView === "applications" ? "My Applications" : personalView === "assigned" ? "My Assigned Surveys" : "Volunteer marketplace") : mode === "ngo" ? "NGO workforce marketplace" : "POEM workforce management"}</h2>
          <p>
            {mode === "personal"
              ? (personalView === "opportunities" ? "Browse published project recruitment without granting permanent NGO profile access." : personalView === "applications" ? "Track application decisions and withdraw applications that are still pending or shortlisted." : personalView === "assigned" ? "Accept formal offers and open survey work only after assignment activation." : "Apply for survey work and accept formal assignment terms before field access starts.")
              : mode === "ngo"
                ? "Recruit active local volunteers, review applications and manage formal project assignments."
                : "Manage and oversee recruitment, applications and assignments across partner NGOs."}
          </p>
        </div>
        {mode !== "personal" && <button className="primary" onClick={() => { setCreate((v) => !v); setCreateProjectId(""); setCreateArea(null); }}>Create project opportunity</button>}
      </div>
      {error && <p className="notice error" role="alert">{error}</p>}
      {message && <p className="notice success" role="status">{message}</p>}
      {busy && <p role="status">Loading workforce records…</p>}

      {mode === "personal" && (
        <>
          {showOpportunities && <>
            <h3>Available Opportunities</h3>
            <div className="form-grid">
              <label className="field">NGO<select value={orgFilter} onChange={(e) => { setOrgFilter(e.target.value); setAvailablePage(0); }}><option value="">All NGOs</option>{orgs.filter((o)=>o.status==="active").map((o)=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
              <label className="field">Paid / unpaid<select value={paymentFilter} onChange={(e)=>{ setPaymentFilter(e.target.value); setAvailablePage(0); }}><option value="">Any</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option></select></label>
              <label className="field">Skill<input value={skillFilter} maxLength={100} onChange={(e)=>{ setSkillFilter(e.target.value); setAvailablePage(0); }} placeholder="e.g. Data Collection" /></label>
              <label className="field">Work date<input type="date" value={workDateFilter} onChange={(e)=>{ setWorkDateFilter(e.target.value); setAvailablePage(0); }} /></label>
              <label className="field">Deadline on/before<input type="date" value={deadlineFilter} onChange={(e)=>{ setDeadlineFilter(e.target.value); setAvailablePage(0); }} /></label>
            </div>
            <AreaSelector rows={geographies} value={areaFilter || null} onChange={(id) => { setAreaFilter(id || ""); setAvailablePage(0); }} title="Opportunity area filter" />
            {available.map((o) => (
              <article className="document-row" key={o.id}>
                <strong>{o.title}</strong>
                <p>{o.organization_name} · {o.project_title}</p>
                <p>{o.description}</p>
                <p>{geographyPath(o.geography_id, geographies).map((n)=>n.name).join(" / ")} · {o.start_date} → {o.end_date}</p>
                <p>{human(o.payment_type)} · {o.required_volunteers} position(s) · Apply by {new Date(o.reply_by).toLocaleString()}</p>
                <p>{o.visibility === "invite_only" ? "Invite only" : "Open to all active volunteers"}{o.visibility === "area" ? " · Work is based in the selected area" : ""}{o.eligibility_note ? ` · ${o.eligibility_note}` : ""}</p>
                {(o.required_skill || o.required_language) && <p>Criteria: {o.required_skill || "Any skill"} · {o.required_language || "Any language"}</p>}
                {o.visibility === "area" && !o.area_match && <p className="notice">Work area is outside your current profile location. You may still apply if you can work there.</p>}
                {!o.can_apply && o.eligibility_reason && <p className="notice">{o.eligibility_reason}</p>}
                {o.application_status ? <span className="badge">Application: {human(o.application_status)}</span> : o.invitation_status ? <span className="badge">Invitation: {human(o.invitation_status)} — respond from Invitations.</span> : (
                  <button className="primary" disabled={busy || !o.can_apply} onClick={() => setApplying(o)}>Apply</button>
                )}
              </article>
            ))}
            {!available.length && !busy && <p>No published opportunities match these filters. Draft, closed and expired recruitment is not shown.</p>}
            {availableTotal > 0 && <div className="actions">
              <button className="secondary" disabled={busy || availablePage === 0} onClick={() => setAvailablePage((p) => Math.max(0, p - 1))}>Previous</button>
              <span>Page {availablePage + 1} of {availablePages} · {availableTotal} opportunity{availableTotal === 1 ? "" : "s"}</span>
              <button className="secondary" disabled={busy || availablePage + 1 >= availablePages} onClick={() => setAvailablePage((p) => p + 1)}>Next</button>
            </div>}
          </>}

          {applying && <form className="review" onSubmit={submitApplication}>
            <h3>Apply — {applying.title}</h3>
            <p>The receiving NGO will see an application snapshot containing: your name, phone, area/location, education, skills, languages, experience, availability, work preferences, transport/smartphone availability, preferred areas, bio, profile publication status and profile version. Private documents and beneficiary/survey data are not shared. This does not create a permanent NGO profile-sharing grant.</p>
            <label className="field">Availability for this assignment<textarea name="availability" required minLength={3} maxLength={1000} defaultValue="Available during the listed project dates." /></label>
            <label className="field">Short message<textarea name="message" maxLength={2000} placeholder="Why are you interested / suitable?" /></label>
            <label className="field"><span><input name="consent" type="checkbox" required /> I consent to share the recruitment profile snapshot described above with {applying.organization_name} for this application.</span></label>
            <div className="actions"><button type="button" className="secondary" onClick={()=>setApplying(null)}>Cancel</button><button className="primary" disabled={busy}>Submit application</button></div>
          </form>}

          {showApplications && <>
            <h3>My Applications</h3>
            {applications.map((a) => (
              <article className="document-row" key={a.id}>
                <strong>{a.opportunity_title} · {human(a.status)}</strong>
                <p>{a.organization_name} · {a.project_title}</p>
                <p>Availability: {a.availability || "Not recorded"}</p>
                {a.note && <p>Message: {a.note}</p>}
                {a.review_note && <p>NGO review: {a.review_note}</p>}
                <p>Recruitment profile consent: {a.profile_share_consent ? "Granted for this application snapshot" : "Legacy application"}</p>
                {a.status === "pending" || a.status === "shortlisted" ? <button className="secondary" disabled={busy} onClick={() => void act(() => rpc("withdraw_work_application", { p_id: a.id, p_version: a.version }), "Application withdrawn.")}>Withdraw</button> : null}
              </article>
            ))}
            {!applications.length && !busy && <p>You have not applied to any opportunities yet.</p>}
          </>}

          {showAssigned && <>
            <h3>My Assigned Surveys</h3>
            {assignments.map((a) => (
              <article className="document-row" key={a.id}>
                <strong>{a.project_title} · {human(a.status)}</strong>
                <p>{a.organization_name}{a.opportunity_title ? ` · ${a.opportunity_title}` : ""}</p>
                <p>{a.start_date} → {a.end_date} · Target {a.target_surveys} surveys · {money(a)}</p>
                <p>{a.terms_note}</p>
                {a.status === "offered" && <div className="actions">
                  <button className="primary" disabled={busy} onClick={() => void act(() => rpc("respond_work_assignment", { p_id: a.id, p_status: "accepted", p_version: a.version }), "Offer accepted. Survey access is active only while the assignment and project are eligible.")}>Accept offer</button>
                  <button className="secondary" disabled={busy} onClick={() => void act(() => rpc("respond_work_assignment", { p_id: a.id, p_status: "declined", p_version: a.version }), "Offer declined.")}>Decline</button>
                </div>}
                {a.status === "active" && <p className="notice success">Survey access is active. Open Survey projects to conduct assigned surveys.</p>}
              </article>
            ))}
            {directSurveyAssignments.map((sa) => {
              const p = projectMap.get(sa.project_id);
              return <article className="document-row" key={`direct-${sa.project_id}`}>
                <strong>{p?.title || sa.project_id} · Active direct assignment</strong>
                <p>{p ? (orgMap.get(p.organization_id) || p.organization_id) : "Survey project"}</p>
                <p className="notice success">Operational survey access is active. This direct assignment is separate from a formal Workforce contract/offer.</p>
              </article>;
            })}
            {!assignments.length && !directSurveyAssignments.length && !busy && <p>No survey assignments or offers yet.</p>}
          </>}
        </>
      )}

      {mode !== "personal" && create && (
        <form onSubmit={createOpportunity} className="review">
          <h3>Publish survey-project opportunity</h3>
          <div className="form-grid">
            <label className="field">Survey project<select required value={createProjectId} onChange={(e) => { const id=e.target.value; setCreateProjectId(id); setCreateArea(projectMap.get(id)?.geography_id || null); }}><option value="">Choose active project</option>{activeProjects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
            <label className="field">Opportunity title<input name="title" required minLength={3} maxLength={150} /></label>
            <label className="field">Positions<input name="positions" type="number" min={1} max={5000} defaultValue={1} required /></label>
            <label className="field">Start<input key={`start-${createProjectId}`} name="start" type="date" min={chosenCreateProject?.start_date} max={chosenCreateProject?.end_date} defaultValue={chosenCreateProject?.start_date || ""} required /></label>
            <label className="field">End<input key={`end-${createProjectId}`} name="end" type="date" min={chosenCreateProject?.start_date} max={chosenCreateProject?.end_date} defaultValue={chosenCreateProject?.end_date || ""} required /></label>
            <label className="field">Application deadline<input name="reply" type="datetime-local" required /></label>
            <label className="field">Work mode<select name="payment" defaultValue="unpaid"><option value="unpaid">Volunteer / unpaid</option><option value="paid">Paid</option></select></label>
            <label className="field">Recruitment access<select name="visibility" defaultValue="area"><option value="all">Open to all volunteers</option><option value="area">Open to all volunteers — work in selected area</option><option value="invite_only">Invite only</option></select></label>
            <label className="field">Publication<select name="publication" defaultValue="published"><option value="published">Publish now</option><option value="draft">Save as draft</option></select></label>
            <label className="field">Required skill (optional)<input name="skill" maxLength={100} /></label>
            <label className="field">Required language (optional)<input name="language" maxLength={100} /></label>
          </div>
          <AreaSelector rows={geographies} value={createArea} onChange={setCreateArea} title="Recruitment work area" />
          {chosenCreateProject && <p className="notice">The recruitment work area must stay within {chosenCreateProject.title}'s configured project area.</p>}
          <label className="field">Expected field tasks<textarea name="description" minLength={10} maxLength={4000} required /></label>
          <label className="field">Proposed payment / expense note<textarea name="payment_note" maxLength={1000} /></label>
          <label className="field">Eligibility note<textarea name="eligibility_note" maxLength={1000} placeholder="Optional qualifications, travel expectations or selection notes." /></label>
          <div className="actions"><button className="secondary" type="button" onClick={() => { setCreate(false); setCreateProjectId(""); setCreateArea(null); }}>Cancel</button><button className="primary" disabled={busy || !createProjectId || !createArea}>Save recruitment</button></div>
        </form>
      )}

      {mode !== "personal" && (
        <>
          <div>
            <h3>Find active volunteers</h3>
            <form onSubmit={findCandidates}>
              <div className="form-grid">
                <label className="field">Survey project<select value={projectId} onChange={(e) => { setProjectId(e.target.value); setCandidates([]); setOffer(null); }} required><option value="">Choose active project</option>{activeProjects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
                <label className="field">Name / skill / language<input value={query} maxLength={100} onChange={(e) => setQuery(e.target.value)} /></label>
              </div>
              <button className="secondary" disabled={busy || !projectId}>Search candidates</button>
            </form>
            {candidates.map((c) => {
              const d = c.details || {};
              return <article className="document-row" key={c.user_id}>
                <strong>{d.full_name || c.user_id} · {human(c.match_label === "local_verified" ? "active_profile" : c.match_label)}</strong>
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
          </div>

          <div>
            <h3>Recruitment opportunities</h3>
            {opportunities.map((o)=><article className="document-row" key={o.id}>
              <strong>{o.title} · {o.publication_state === "draft" ? "Draft" : o.status !== "open" ? "Opportunity closed" : o.applications_open ? "Applications open" : "Applications closed"}</strong>
              <p>{projectMap.get(o.survey_project_id || "")?.title || o.survey_project_id} · {human(o.visibility)} · deadline {new Date(o.reply_by).toLocaleString()}</p>
              <p>{o.required_volunteers} position(s) · {human(o.payment_type)}{o.eligibility_note ? ` · ${o.eligibility_note}` : ""}</p>
              <div className="actions">
                {o.publication_state === "draft" && <button className="primary" disabled={busy} onClick={()=>void act(()=>rpc("set_work_opportunity_state",{p_id:o.id,p_state:"published",p_version:o.version}),"Recruitment published and applications opened.")}>Publish</button>}
                {o.publication_state === "published" && o.status === "open" && o.applications_open && <button className="secondary" disabled={busy} onClick={()=>void act(()=>rpc("set_work_opportunity_state",{p_id:o.id,p_state:"closed",p_version:o.version}),"New applications closed. Existing applications remain reviewable.")}>Close applications</button>}
                {o.publication_state === "published" && o.status === "open" && !o.applications_open && <button className="primary" disabled={busy} onClick={()=>void act(()=>rpc("set_work_opportunity_state",{p_id:o.id,p_state:"published",p_version:o.version}),"Applications reopened.")}>Reopen applications</button>}
              </div>
            </article>)}
            {!opportunities.length && <p>No project recruitment has been created in this workspace.</p>}
          </div>

          <h3>{mode === "poem" ? "Applications across partner NGOs" : "Project applications"}</h3>
          {applications.map((a) => <article className="document-row" key={a.id}>
            <strong>{a.volunteer_name} · {human(a.status)}</strong>
            <p>{projectMap.get(a.survey_project_id)?.title || a.survey_project_id} · {orgMap.get(a.organization_id) || a.organization_id}</p>
            {a.availability && <p>Availability: {a.availability}</p>}{a.note && <p>Volunteer: {a.note}</p>}{a.review_note && <p>Review: {a.review_note}</p>}
            {a.profile_share_consent && <details><summary>Recruitment profile shared for this application</summary><pre className="survey-json">{JSON.stringify(a.profile_snapshot, null, 2)}</pre></details>}
            {["pending", "shortlisted", "selected"].includes(a.status) && <div className="actions">
              {(["shortlisted", "selected", "rejected"] as const).map((status) => <button key={status} className={status === "selected" ? "primary" : "secondary"} disabled={busy || a.status === "selected" && status !== "rejected"} onClick={() => {
                const note = window.prompt(`Review note for ${human(status)}:`, status === "selected" ? "Selected for a formal assignment offer." : "Reviewed by project recruitment administrator.");
                if (note) void act(() => rpc("review_work_application", { p_id: a.id, p_status: status, p_note: note, p_version: a.version }), `Application marked ${human(status)}.`);
              }}>{human(status)}</button>)}
              {a.status === "selected" && <button className="primary" disabled={busy} onClick={()=>{
                setProjectId(a.survey_project_id);
                const d=(a.profile_snapshot || {}) as Record<string,string>;
                setOffer({user_id:a.user_id,details:d,geography_id:typeof d.geography_id === "string" ? d.geography_id : null,shortlist_status:null,approved_surveys:0,reviewed_surveys:0,approval_rate:null,completed_assignments:0,verified_experiences:0,source_kind:"application",source_id:a.id,match_label:"selected_application"});
              }}>Offer assignment</button>}
            </div>}
          </article>)}
          {!applications.length && <p>No applications in this workspace.</p>}

          <h3>{mode === "poem" ? "Assignment oversight" : "Project assignments"}</h3>
          {assignments.map((a) => <AssignmentCard key={a.id} assignment={a} project={projectMap.get(a.survey_project_id)} orgName={orgMap.get(a.organization_id)} mode={mode} busy={busy} act={act} />)}
          {!assignments.length && <p>No workforce assignments in this workspace.</p>}
        </>
      )}

      {mode !== "personal" && opportunities.length > 0 && <p>Linked project opportunities: {opportunities.length}. Closing recruitment blocks only new applications; existing applications remain reviewable.</p>}
    </section>
  );
}

function AssignmentCard({ assignment: a, project, orgName, mode, busy, act }: {
  assignment: Assignment;
  project?: Project;
  orgName?: string;
  mode: Mode;
  busy: boolean;
  act: (fn: () => Promise<unknown>, success: string) => Promise<boolean>;
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
        const note=window.prompt("Cancellation reason:","Assignment cancelled by project administrator.");
        if(note) void act(() => rpc("cancel_work_assignment",{p_id:a.id,p_note:note,p_version:a.version}),"Assignment cancelled and survey access revoked.");
      }}>Cancel assignment</button>
    </div>}
    {mode !== "personal" && a.status === "offered" && <button className="secondary" disabled={busy} onClick={() => {
      const note=window.prompt("Cancellation reason:","Assignment offer withdrawn by project administrator.");
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
