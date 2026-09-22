import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, BriefcaseBusiness, CalendarDays, CheckCircle2, CircleDollarSign, Clock3, FileCheck2, Filter, MapPin, Search, Send, UsersRound } from "lucide-react";
import { db, rpc } from "../../lib/supabase/client";
import type { Database, Json } from "../../lib/supabase/database.types";
import { geographyPath, type Geo } from "../geography/model";
import { AreaSelector } from "../geography/AreaSelector";
import { Badge, human } from "../../shared/ui/FormFields";
import { OrganizationLogoImage } from "../organizations/OrganizationLogo";

type Tables = Database["public"]["Tables"];
type Project = Tables["survey_projects"]["Row"];
type Opportunity = Tables["work_opportunities"]["Row"];
type Application = Tables["work_applications"]["Row"];
type Assignment = Tables["work_assignments"]["Row"];
type SurveyAssignment = Tables["survey_assignments"]["Row"];
type Mode = "personal" | "ngo" | "project" | "poem";
type PersonalView = "opportunities" | "applications" | "assigned" | "all";
type OrganizationView = "opportunities" | "applications" | "field_workers" | "assignments";
type ApplicationFilter = "all" | "pending" | "shortlisted" | "selected" | "rejected";
type Org = { id: string; name: string; status: string; logo_path?: string | null; logo_updated_at?: string | null };
type AvailableRow = Pick<Opportunity, "id" | "organization_id" | "title" | "description" | "geography_id" | "start_date" | "end_date" | "reply_by" | "payment_type" | "payment_note" | "status" | "survey_project_id" | "required_volunteers" | "required_skill" | "required_language" | "created_at" | "work_mode" | "compensation_type" | "currency" | "rate" | "compensation_note" | "compensation_snapshot_version"> & {
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
const projectCompensation = (p?: Project) =>
  !p || p.work_mode !== "paid"
    ? "Volunteer / unpaid"
    : `${p.compensation_currency} ${Number(p.compensation_rate || 0).toLocaleString()} · ${human(p.compensation_type)}`;
const opportunityCompensation = (o?: Pick<Opportunity, "payment_type" | "payment_note" | "work_mode" | "compensation_type" | "currency" | "rate" | "compensation_snapshot_version"> | null) =>
  !o
    ? "Compensation unavailable"
    : o.compensation_snapshot_version
      ? o.work_mode === "paid"
        ? `${o.currency} ${Number(o.rate || 0).toLocaleString()} · ${human(o.compensation_type || "paid")}`
        : "Volunteer / unpaid"
      : `${human(o.payment_type)} · legacy terms${o.payment_note ? ` · ${o.payment_note}` : ""}`;

export function WorkforceMarketplace({
  userId,
  organization,
  mode,
  geographies,
  orgs,
  personalView = "all",
  projectScopeId = null,
  focusKind = null,
  focusId = null,
  onFocusChange,
}: {
  userId: string;
  organization: string | null;
  mode: Mode;
  geographies: Geo[];
  orgs: Org[];
  personalView?: PersonalView;
  projectScopeId?: string | null;
  focusKind?: "application" | "assignment" | null;
  focusId?: string | null;
  onFocusChange?: (kind: "application" | "assignment", id: string) => void;
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
    [revision, setRevision] = useState(0),
    [organizationView, setOrganizationView] = useState<OrganizationView>("opportunities"),
    [applicationFilter, setApplicationFilter] = useState<ApplicationFilter>("all");

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
        } else if (mode === "project" && projectScopeId) {
          p = p.eq("id", projectScopeId);
          o = o.eq("survey_project_id", projectScopeId);
          a = a.eq("survey_project_id", projectScopeId);
          w = w.eq("survey_project_id", projectScopeId);
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
  }, [mode, organization, projectScopeId, userId, revision, orgFilter, areaFilter, paymentFilter, skillFilter, workDateFilter, deadlineFilter, availablePage]);

  useEffect(() => {
    if (mode !== "project" || !projectScopeId) return;
    setProjectId(projectScopeId);
    setCreateProjectId(projectScopeId);
  }, [mode, projectScopeId]);

  useEffect(()=>{
    if(!focusId||!focusKind)return;
    if(mode!=="personal")setOrganizationView(focusKind==="application"?"applications":"assignments");
    const timer=window.setTimeout(()=>document.getElementById(`workforce-${focusKind}-${focusId}`)?.scrollIntoView({block:"center"}),60);
    return()=>window.clearTimeout(timer);
  },[focusKind,focusId,mode,applications.length,assignments.length]);

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
          p_payment: chosenCreateProject?.work_mode === "paid" ? "paid" : "unpaid",
          p_payment_note: chosenCreateProject?.compensation_note || "Project compensation defaults",
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
      setCreateProjectId(mode === "project" ? projectScopeId || "" : "");
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
    const sourceApplication = offer.source_kind === "application" ? applications.find((a) => a.id === offer.source_id) : null;
    const sourceOpportunity = sourceApplication ? opportunities.find((o) => o.id === sourceApplication.opportunity_id) : null;
    const modeSnapshot = sourceOpportunity?.work_mode || chosenProject?.work_mode || "volunteer";
    const typeSnapshot = sourceOpportunity?.compensation_type || chosenProject?.compensation_type || "none";
    const currencySnapshot = sourceOpportunity?.currency || chosenProject?.compensation_currency || "PKR";
    const rateSnapshot = sourceOpportunity?.rate ?? chosenProject?.compensation_rate ?? null;
    act(
      () =>
        rpc("create_work_assignment", {
          p_project: projectId,
          p_user: offer.user_id,
          p_source_kind: offer.source_kind!,
          p_source_id: offer.source_kind === "shortlist" ? null : offer.source_id,
          p_work_mode: modeSnapshot,
          p_compensation_type: typeSnapshot,
          p_currency: currencySnapshot,
          p_rate: rateSnapshot,
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
  const orgById = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);
  const activeProjects = projects.filter((p) => p.status === "active");
  const chosenProject = projectMap.get(projectId);
  const chosenCreateProject = projectMap.get(createProjectId);
  const offerApplication = offer?.source_kind === "application" ? applications.find((a) => a.id === offer.source_id) : null;
  const offerOpportunity = offerApplication ? opportunities.find((o) => o.id === offerApplication.opportunity_id) : null;
  const offerCompensation = offer?.source_kind === "invitation"
    ? "Inherited from the accepted invitation opportunity snapshot"
    : offerOpportunity
      ? opportunityCompensation(offerOpportunity)
      : projectCompensation(chosenProject);
  const directSurveyAssignments = surveyAssignments.filter((sa) =>
    sa.active && !assignments.some((a) => a.survey_project_id === sa.project_id && ["active", "completed"].includes(a.status)),
  );
  const availablePageSize = 50;
  const availablePages = Math.max(1, Math.ceil(availableTotal / availablePageSize));
  const showOpportunities = mode !== "personal" || personalView === "all" || personalView === "opportunities";
  const showApplications = mode !== "personal" || personalView === "all" || personalView === "applications";
  const showAssigned = mode !== "personal" || personalView === "all" || personalView === "assigned";
  const openOpportunityCount = opportunities.filter((o) => o.publication_state === "published" && o.status === "open" && o.applications_open).length;
  const pendingApplicationCount = applications.filter((a) => a.status === "pending").length;
  const offeredAssignmentCount = assignments.filter((a) => a.status === "offered").length;
  const activeAssignmentCount = assignments.filter((a) => a.status === "active").length;
  const filteredApplications = applicationFilter === "all" ? applications : applications.filter((a) => a.status === applicationFilter);

  function selectOrganizationView(next: OrganizationView) {
    setOrganizationView(next);
    setOffer(null);
    if (next !== "field_workers") setCandidates([]);
  }

  const organizationHeading = mode === "ngo"
    ? "Organization recruitment"
    : mode === "project"
      ? "Project recruitment"
      : "Workforce operations";
  const organizationCopy = mode === "ngo"
    ? "Publish opportunities, review Field Worker applications and activate accountable project assignments."
    : mode === "project"
      ? "Recruit and manage Field Workers within this authorized project scope."
      : "Oversee recruitment, applications and assignments across authorized organizations.";

  return (
    <section className="panel detail workforce-marketplace workforce-marketplace-v2">
      {error && <p className="notice error" role="alert">{error}</p>}
      {message && <p className="notice success" role="status">{message}</p>}
      {busy && <p className="workforce-loading" role="status">Loading workforce records…</p>}

      {mode === "personal" ? (
        <>
          <WorkerJourney active={personalView} />
          <div className="workforce-metric-grid" aria-label="Field Worker marketplace summary">
            <WorkforceMetric icon={<BriefcaseBusiness size={18} />} label="Open opportunities" value={availableTotal} detail="Published work you can explore" />
            <WorkforceMetric icon={<FileCheck2 size={18} />} label="My applications" value={applications.length} detail={`${applications.filter((a) => ["pending", "shortlisted", "selected"].includes(a.status)).length} still in recruitment`} />
            <WorkforceMetric icon={<Send size={18} />} label="Offers" value={offeredAssignmentCount} detail="Awaiting your decision" />
            <WorkforceMetric icon={<CheckCircle2 size={18} />} label="Active assignments" value={activeAssignmentCount + directSurveyAssignments.length} detail="Survey access currently active" />
          </div>

          {showOpportunities && <>
            <div className="workforce-section-heading">
              <div><span className="eyebrow">DISCOVER WORK</span><h3>Available opportunities</h3><p>Published opportunities from active organizations. Applying shares only an application-scoped recruitment snapshot.</p></div>
              <span className="workforce-count">{availableTotal} available</span>
            </div>
            <div className="workforce-filter-card">
              <div className="workforce-filter-title"><Filter size={17} /><strong>Filter opportunities</strong></div>
              <div className="workforce-filter-grid">
                <label className="field">Organization<select value={orgFilter} onChange={(e) => { setOrgFilter(e.target.value); setAvailablePage(0); }}><option value="">All organizations</option>{orgs.filter((o)=>o.status==="active").map((o)=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
                <label className="field">Payment<select value={paymentFilter} onChange={(e)=>{ setPaymentFilter(e.target.value); setAvailablePage(0); }}><option value="">Paid or volunteer</option><option value="paid">Paid</option><option value="unpaid">Volunteer / unpaid</option></select></label>
                <label className="field">Skill<input value={skillFilter} maxLength={100} onChange={(e)=>{ setSkillFilter(e.target.value); setAvailablePage(0); }} placeholder="e.g. Data collection" /></label>
                <label className="field">Work date<input type="date" value={workDateFilter} onChange={(e)=>{ setWorkDateFilter(e.target.value); setAvailablePage(0); }} /></label>
                <label className="field">Apply by<input type="date" value={deadlineFilter} onChange={(e)=>{ setDeadlineFilter(e.target.value); setAvailablePage(0); }} /></label>
              </div>
              <AreaSelector rows={geographies} value={areaFilter || null} onChange={(id) => { setAreaFilter(id || ""); setAvailablePage(0); }} title="Work area" />
            </div>
            <div className="workforce-card-grid">
              {available.map((o) => {
                const org = orgById.get(o.organization_id);
                const location = geographyPath(o.geography_id, geographies).map((n)=>n.name).join(" / ");
                return <article className="workforce-opportunity-card" key={o.id}>
                  <div className="workforce-card-header">
                    <OrganizationLogoImage name={o.organization_name} path={org?.logo_path} updatedAt={org?.logo_updated_at} size="card" />
                    <div className="workforce-card-title"><span>{o.organization_name}</span><h4>{o.title}</h4><small>{o.project_title}</small></div>
                    <Badge value={o.work_mode === "paid" ? "paid" : "active"} />
                  </div>
                  <p className="workforce-card-description">{o.description}</p>
                  <div className="workforce-chip-row">
                    <span>{o.work_mode === "paid" ? "Paid field work" : "Volunteer opportunity"}</span>
                    {o.required_skill && <span>{o.required_skill}</span>}
                    {o.required_language && <span>{o.required_language}</span>}
                  </div>
                  <div className="workforce-meta-grid">
                    <WorkforceMeta icon={<MapPin size={15} />} label="Work area" value={location || "Area not listed"} />
                    <WorkforceMeta icon={<CalendarDays size={15} />} label="Work dates" value={`${shortDate(o.start_date)} – ${shortDate(o.end_date)}`} />
                    <WorkforceMeta icon={<CircleDollarSign size={15} />} label="Compensation" value={opportunityCompensation(o)} />
                    <WorkforceMeta icon={<UsersRound size={15} />} label="Positions" value={`${o.required_volunteers} Field Worker${o.required_volunteers === 1 ? "" : "s"}`} />
                    <WorkforceMeta icon={<Clock3 size={15} />} label="Apply by" value={new Date(o.reply_by).toLocaleString()} />
                  </div>
                  {o.eligibility_note && <p className="workforce-helper"><strong>Selection note:</strong> {o.eligibility_note}</p>}
                  {o.visibility === "area" && !o.area_match && <p className="notice">This work area is outside your current profile location. You may still apply if you can work there.</p>}
                  {!o.can_apply && o.eligibility_reason && <p className="notice">{o.eligibility_reason}</p>}
                  <div className="workforce-card-actions">
                    <span className="workforce-deadline">{o.visibility === "invite_only" ? "Invite only" : "Open recruitment"}</span>
                    {o.application_status ? <Badge value={o.application_status} /> : o.invitation_status ? <span className="badge pending">Invitation {human(o.invitation_status)} · respond from Invitations</span> : (
                      <button className="primary" disabled={busy || !o.can_apply} onClick={() => setApplying(o)}>Apply <ArrowRight size={15} /></button>
                    )}
                  </div>
                </article>;
              })}
            </div>
            {!available.length && !busy && <WorkforceEmpty icon={<Search size={22} />} title="No matching opportunities" copy="No published opportunities match these filters. Draft, closed and expired recruitment is not shown." />}
            {availableTotal > 0 && <div className="workforce-pagination">
              <button className="secondary" disabled={busy || availablePage === 0} onClick={() => setAvailablePage((p) => Math.max(0, p - 1))}>Previous</button>
              <span>Page {availablePage + 1} of {availablePages} · {availableTotal} opportunit{availableTotal === 1 ? "y" : "ies"}</span>
              <button className="secondary" disabled={busy || availablePage + 1 >= availablePages} onClick={() => setAvailablePage((p) => p + 1)}>Next</button>
            </div>}
          </>}

          {applying && <form className="workforce-inline-form" onSubmit={submitApplication}>
            <div className="workforce-section-heading compact"><div><span className="eyebrow">APPLICATION</span><h3>Apply — {applying.title}</h3><p>{applying.organization_name} will receive an application-scoped recruitment snapshot only. Private documents and beneficiary/survey data are not shared.</p></div></div>
            <label className="field">Availability for this assignment<textarea name="availability" required minLength={3} maxLength={1000} defaultValue="Available during the listed project dates." /></label>
            <label className="field">Short message<textarea name="message" maxLength={2000} placeholder="Why are you interested or suitable for this field assignment?" /></label>
            <label className="workforce-consent"><input name="consent" type="checkbox" required /><span>I consent to share my recruitment profile snapshot with <strong>{applying.organization_name}</strong> for this application. This does not grant permanent full-profile access.</span></label>
            <div className="actions"><button type="button" className="secondary" onClick={()=>setApplying(null)}>Cancel</button><button className="primary" disabled={busy}>Submit application</button></div>
          </form>}

          {showApplications && <>
            <div className="workforce-section-heading">
              <div><span className="eyebrow">RECRUITMENT PROGRESS</span><h3>My applications</h3><p>Track every application from submission through selection. Formal survey access starts only after you accept an assignment offer.</p></div>
              <span className="workforce-count">{applications.length} total</span>
            </div>
            <div className="workforce-list">
              {applications.map((a) => {
                const org = orgById.get(a.organization_id);
                return <article id={`workforce-application-${a.id}`} className={`workforce-application-card ${focusKind==="application"&&focusId===a.id?"route-focus":""}`} key={a.id}>
                  <div className="workforce-card-header">
                    <OrganizationLogoImage name={a.organization_name} path={org?.logo_path} updatedAt={org?.logo_updated_at} size="card" />
                    <div className="workforce-card-title"><span>{a.organization_name}</span><h4>{a.opportunity_title}</h4><small>{a.project_title}</small></div>
                    <Badge value={a.status} />
                  </div>
                  <RecruitmentProgress status={a.status} />
                  <div className="workforce-application-copy"><p><strong>Availability:</strong> {a.availability || "Not recorded"}</p>{a.note && <p><strong>Your message:</strong> {a.note}</p>}{a.review_note && <p><strong>Organization review:</strong> {a.review_note}</p>}</div>
                  <div className="workforce-card-actions"><span>{applicationNextStep(a.status)}</span><div className="actions"><button className="link" type="button" onClick={()=>onFocusChange?.("application",a.id)}>Open link</button>{(a.status === "pending" || a.status === "shortlisted") && <button className="secondary" disabled={busy} onClick={() => void act(() => rpc("withdraw_work_application", { p_id: a.id, p_version: a.version }), "Application withdrawn.")}>Withdraw application</button>}</div></div>
                </article>;
              })}
            </div>
            {!applications.length && !busy && <WorkforceEmpty icon={<FileCheck2 size={22} />} title="No applications yet" copy="When you apply to a published opportunity, its recruitment status will appear here." />}
          </>}

          {showAssigned && <>
            <div className="workforce-section-heading">
              <div><span className="eyebrow">ASSIGNMENTS</span><h3>My assigned surveys</h3><p>Review formal offers, accept the work terms, then open active survey assignments for field collection.</p></div>
              <span className="workforce-count">{assignments.length + directSurveyAssignments.length} record{assignments.length + directSurveyAssignments.length === 1 ? "" : "s"}</span>
            </div>
            <div className="workforce-list">
              {assignments.map((a) => (
                <article id={`workforce-assignment-${a.id}`} className={`workforce-assignment-card ${focusKind==="assignment"&&focusId===a.id?"route-focus":""}`} key={a.id}>
                  <div className="workforce-assignment-top"><div><span>{a.organization_name}</span><h4>{a.project_title}</h4>{a.opportunity_title && <small>{a.opportunity_title}</small>}</div><Badge value={a.status} /></div>
                  <div className="workforce-meta-grid three">
                    <WorkforceMeta icon={<CalendarDays size={15} />} label="Assignment dates" value={`${shortDate(a.start_date)} – ${shortDate(a.end_date)}`} />
                    <WorkforceMeta icon={<FileCheck2 size={15} />} label="Survey target" value={`${a.target_surveys} surveys`} />
                    <WorkforceMeta icon={<CircleDollarSign size={15} />} label="Compensation" value={money(a)} />
                  </div>
                  <p className="workforce-helper"><strong>Terms:</strong> {a.terms_note}</p>
                  {a.status === "offered" && <div className="workforce-offer-callout"><div><strong>Formal assignment offer</strong><p>Accept to activate this assignment and its survey access. Compensation and terms are frozen for this offer.</p></div><div className="actions"><button className="secondary" disabled={busy} onClick={() => void act(() => rpc("respond_work_assignment", { p_id: a.id, p_status: "declined", p_version: a.version }), "Offer declined.")}>Decline</button><button className="primary" disabled={busy} onClick={() => void act(() => rpc("respond_work_assignment", { p_id: a.id, p_status: "accepted", p_version: a.version }), "Offer accepted. Survey access is active only while the assignment and project are eligible.")}>Accept offer</button></div></div>}
                  {a.status === "active" && <p className="notice success"><CheckCircle2 size={16} /> Survey access is active. Open Survey projects to conduct assigned surveys.</p>}
                  {a.status === "completed" && <p className="notice success">Completed assignment is retained in your verified FieldLance work history.</p>}
                  <button className="link" type="button" onClick={()=>onFocusChange?.("assignment",a.id)}>Open assignment link</button>
                </article>
              ))}
              {directSurveyAssignments.map((sa) => {
                const project = projectMap.get(sa.project_id);
                return <article className="workforce-assignment-card" key={`direct-${sa.project_id}`}>
                  <div className="workforce-assignment-top"><div><span>{project ? (orgMap.get(project.organization_id) || project.organization_id) : "Survey project"}</span><h4>{project?.title || sa.project_id}</h4><small>Direct operational assignment</small></div><Badge value="active" /></div>
                  <p className="notice success">Survey access is active. This direct assignment remains separate from the formal marketplace contract/offer lifecycle.</p>
                </article>;
              })}
            </div>
            {!assignments.length && !directSurveyAssignments.length && !busy && <WorkforceEmpty icon={<BriefcaseBusiness size={22} />} title="No assignments or offers yet" copy="After an organization selects you and sends a formal offer, it will appear here for acceptance." />}
          </>}
        </>
      ) : (
        <>
          <div className="workforce-org-hero">
            <div><span className="eyebrow">RECRUITMENT HUB</span><h2>{organizationHeading}</h2><p>{organizationCopy}</p></div>
            <button className="primary" onClick={() => { selectOrganizationView("opportunities"); setCreate((v) => !v); setCreateProjectId(mode === "project" ? projectScopeId || "" : ""); setCreateArea(mode === "project" ? projectMap.get(projectScopeId || "")?.geography_id || null : null); }}>{create ? "Close form" : "+ Create opportunity"}</button>
          </div>

          <div className="workforce-metric-grid" aria-label="Organization recruitment summary">
            <WorkforceMetric icon={<BriefcaseBusiness size={18} />} label="Active opportunities" value={openOpportunityCount} detail={`${opportunities.length} total recruitment records`} />
            <WorkforceMetric icon={<FileCheck2 size={18} />} label="New applications" value={pendingApplicationCount} detail={`${applications.length} applications received`} />
            <WorkforceMetric icon={<Send size={18} />} label="Pending offers" value={offeredAssignmentCount} detail="Awaiting Field Worker response" />
            <WorkforceMetric icon={<CheckCircle2 size={18} />} label="Active assignments" value={activeAssignmentCount} detail="Field Workers currently activated" />
          </div>

          <div className="workforce-tabs" role="tablist" aria-label="Recruitment workspace sections">
            {([
              ["opportunities", "Opportunities", opportunities.length],
              ["applications", "Applications", applications.length],
              ["field_workers", "Find Field Workers", candidates.length],
              ["assignments", "Assignments", assignments.length],
            ] as const).map(([id, label, count]) => <button key={id} role="tab" aria-selected={organizationView === id} className={organizationView === id ? "active" : ""} onClick={() => selectOrganizationView(id)}>{label}<span>{count}</span></button>)}
          </div>

          {organizationView === "opportunities" && <>
            {create && (
              <form onSubmit={createOpportunity} className="workforce-inline-form workforce-create-opportunity">
                <div className="workforce-section-heading compact"><div><span className="eyebrow">NEW RECRUITMENT</span><h3>Create project opportunity</h3><p>Publish field work from an active survey project. Compensation is inherited and snapshotted from project defaults.</p></div></div>
                <div className="form-grid">
                  {mode === "project" ? <label className="field">Survey project<input readOnly value={chosenCreateProject?.title || "Authorized project"} /></label> : <label className="field">Survey project<select required value={createProjectId} onChange={(e) => { const id=e.target.value; setCreateProjectId(id); setCreateArea(projectMap.get(id)?.geography_id || null); }}><option value="">Choose active project</option>{activeProjects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>}
                  <label className="field">Opportunity title<input name="title" required minLength={3} maxLength={150} /></label>
                  <label className="field">Positions<input name="positions" type="number" min={1} max={5000} defaultValue={1} required /></label>
                  <label className="field">Start<input key={`start-${createProjectId}`} name="start" type="date" min={chosenCreateProject?.start_date} max={chosenCreateProject?.end_date} defaultValue={chosenCreateProject?.start_date || ""} required /></label>
                  <label className="field">End<input key={`end-${createProjectId}`} name="end" type="date" min={chosenCreateProject?.start_date} max={chosenCreateProject?.end_date} defaultValue={chosenCreateProject?.end_date || ""} required /></label>
                  <label className="field">Application deadline<input name="reply" type="datetime-local" required /></label>
                  <label className="field">Project compensation<input readOnly value={projectCompensation(chosenCreateProject)} /></label>
                  <label className="field">Recruitment access<select name="visibility" defaultValue="area"><option value="all">Open to all Field Workers</option><option value="area">Open to all Field Workers — selected work area</option><option value="invite_only">Invite only</option></select></label>
                  <label className="field">Publication<select name="publication" defaultValue="published"><option value="published">Publish now</option><option value="draft">Save as draft</option></select></label>
                  <label className="field">Required skill (optional)<input name="skill" maxLength={100} /></label>
                  <label className="field">Required language (optional)<input name="language" maxLength={100} /></label>
                </div>
                <AreaSelector rows={geographies} value={createArea} onChange={setCreateArea} title="Recruitment work area" />
                {chosenCreateProject && <p className="notice">The work area must stay within {chosenCreateProject.title}&apos;s configured project area. Compensation is snapshotted now; later project-rate changes do not alter this opportunity.</p>}
                <label className="field">Expected field tasks<textarea name="description" minLength={10} maxLength={4000} required /></label>
                <label className="field">Selection / eligibility note<textarea name="eligibility_note" maxLength={1000} placeholder="Optional qualifications, travel expectations or selection notes." /></label>
                <div className="actions"><button className="secondary" type="button" onClick={() => { setCreate(false); setCreateProjectId(""); setCreateArea(null); }}>Cancel</button><button className="primary" disabled={busy || !createProjectId || !createArea}>Save recruitment</button></div>
              </form>
            )}
            <div className="workforce-section-heading"><div><span className="eyebrow">PUBLISHED WORK</span><h3>Recruitment opportunities</h3><p>Manage draft, open and closed recruitment without affecting applications already received.</p></div><span className="workforce-count">{opportunities.length} total</span></div>
            <div className="workforce-card-grid">
              {opportunities.map((o) => {
                const project = projectMap.get(o.survey_project_id || "");
                const location = geographyPath(o.geography_id, geographies).map((n)=>n.name).join(" / ");
                const applicationCount = applications.filter((a) => a.opportunity_id === o.id).length;
                return <article className="workforce-opportunity-card organization" key={o.id}>
                  <div className="workforce-card-header"><div className="workforce-card-icon"><BriefcaseBusiness size={19} /></div><div className="workforce-card-title"><span>{project?.title || "Survey project"}</span><h4>{o.title}</h4><small>{location || "Area not listed"}</small></div><Badge value={opportunityState(o)} /></div>
                  <p className="workforce-card-description">{o.description}</p>
                  <div className="workforce-meta-grid three"><WorkforceMeta icon={<UsersRound size={15} />} label="Positions" value={`${o.required_volunteers} required`} /><WorkforceMeta icon={<FileCheck2 size={15} />} label="Applications" value={`${applicationCount} received`} /><WorkforceMeta icon={<Clock3 size={15} />} label="Deadline" value={new Date(o.reply_by).toLocaleString()} /></div>
                  <div className="workforce-chip-row"><span>{opportunityCompensation(o)}</span>{o.required_skill && <span>{o.required_skill}</span>}{o.required_language && <span>{o.required_language}</span>}</div>
                  <div className="workforce-card-actions"><span>{human(o.visibility)} recruitment</span><div className="actions">
                    {applicationCount > 0 && <button className="secondary" onClick={() => { setApplicationFilter("all"); selectOrganizationView("applications"); }}>View applicants</button>}
                    {o.publication_state === "draft" && <button className="primary" disabled={busy} onClick={()=>void act(()=>rpc("set_work_opportunity_state",{p_id:o.id,p_state:"published",p_version:o.version}),"Recruitment published and applications opened.")}>Publish</button>}
                    {o.publication_state === "published" && o.status === "open" && o.applications_open && <button className="secondary" disabled={busy} onClick={()=>void act(()=>rpc("set_work_opportunity_state",{p_id:o.id,p_state:"closed",p_version:o.version}),"New applications closed. Existing applications remain reviewable.")}>Close applications</button>}
                    {o.publication_state === "published" && o.status === "open" && !o.applications_open && <button className="primary" disabled={busy} onClick={()=>void act(()=>rpc("set_work_opportunity_state",{p_id:o.id,p_state:"published",p_version:o.version}),"Applications reopened.")}>Reopen applications</button>}
                  </div></div>
                </article>;
              })}
            </div>
            {!opportunities.length && !busy && <WorkforceEmpty icon={<BriefcaseBusiness size={22} />} title="No recruitment opportunities yet" copy="Create an opportunity from an active survey project so eligible Field Workers can discover and apply." action={<button className="primary" onClick={() => setCreate(true)}>+ Create opportunity</button>} />}
          </>}

          {organizationView === "applications" && <>
            <div className="workforce-section-heading"><div><span className="eyebrow">REVIEW PIPELINE</span><h3>{mode === "poem" ? "Applications across organizations" : "Field Worker applications"}</h3><p>Review application-scoped profile snapshots, shortlist candidates, select them and send formal assignment offers.</p></div><span className="workforce-count">{applications.length} total</span></div>
            <div className="workforce-filter-pills" aria-label="Application status filters">
              {(["all","pending","shortlisted","selected","rejected"] as ApplicationFilter[]).map((status) => <button key={status} className={applicationFilter === status ? "active" : ""} onClick={() => setApplicationFilter(status)}>{status === "all" ? "All" : human(status)} <span>{status === "all" ? applications.length : applications.filter((a)=>a.status===status).length}</span></button>)}
            </div>
            <div className="workforce-list">
              {filteredApplications.map((a) => {
                const snapshot = (a.profile_snapshot || {}) as Record<string, unknown>;
                const skills = readableSnapshot(snapshot.skills);
                const languages = readableSnapshot(snapshot.languages);
                return <article id={`workforce-application-${a.id}`} className={`workforce-application-card organization ${focusKind==="application"&&focusId===a.id?"route-focus":""}`} key={a.id}>
                  <div className="workforce-card-header"><div className="workforce-avatar">{initials(a.volunteer_name)}</div><div className="workforce-card-title"><span>{a.opportunity_title}</span><h4>{a.volunteer_name}</h4><small>{a.project_title}{mode === "poem" ? ` · ${orgMap.get(a.organization_id) || a.organization_name}` : ""}</small></div><Badge value={a.status} /></div>
                  <RecruitmentProgress status={a.status} organization />
                  <div className="workforce-candidate-facts"><span><strong>Skills</strong>{skills || "Not listed"}</span><span><strong>Languages</strong>{languages || "Not listed"}</span><span><strong>Availability</strong>{a.availability || "Not recorded"}</span></div>
                  {a.note && <p className="workforce-helper"><strong>Applicant message:</strong> {a.note}</p>}
                  {a.review_note && <p className="workforce-helper"><strong>Review note:</strong> {a.review_note}</p>}
                  {a.profile_share_consent && <details className="workforce-profile-snapshot"><summary>View application profile snapshot</summary><pre className="survey-json">{JSON.stringify(a.profile_snapshot, null, 2)}</pre></details>}
                  <button className="link" type="button" onClick={()=>onFocusChange?.("application",a.id)}>Open application link</button>
                  {["pending", "shortlisted", "selected"].includes(a.status) && <div className="workforce-card-actions"><span>{applicationNextStep(a.status, true)}</span><div className="actions">
                    {a.status !== "shortlisted" && a.status !== "selected" && <button className="secondary" disabled={busy} onClick={() => reviewApplication(a, "shortlisted")}>Shortlist</button>}
                    {a.status !== "selected" && <button className="primary" disabled={busy} onClick={() => reviewApplication(a, "selected")}>Select</button>}
                    <button className="secondary" disabled={busy} onClick={() => reviewApplication(a, "rejected")}>Reject</button>
                    {a.status === "selected" && <button className="primary" disabled={busy} onClick={() => {
                      setProjectId(a.survey_project_id);
                      const details=(a.profile_snapshot || {}) as Record<string,string>;
                      setOffer({user_id:a.user_id,details,geography_id:typeof details.geography_id === "string" ? details.geography_id : null,shortlist_status:null,approved_surveys:0,reviewed_surveys:0,approval_rate:null,completed_assignments:0,verified_experiences:0,source_kind:"application",source_id:a.id,match_label:"selected_application"});
                    }}>Send assignment offer</button>}
                  </div></div>}
                </article>;
              })}
            </div>
            {!filteredApplications.length && !busy && <WorkforceEmpty icon={<FileCheck2 size={22} />} title="No applications in this view" copy={applications.length ? "Choose another pipeline filter to see other applicants." : "Applications will appear here when Field Workers apply to published opportunities."} />}
            {offer && chosenProject && offer.source_kind === "application" && <AssignmentOfferForm offer={offer} project={chosenProject} compensation={offerCompensation} busy={busy} onCancel={() => setOffer(null)} onSubmit={offerAssignment} />}
          </>}

          {organizationView === "field_workers" && <>
            <div className="workforce-section-heading"><div><span className="eyebrow">DIRECT RECRUITMENT</span><h3>Find Field Workers</h3><p>Search eligible Field Workers for a project. Formal assignment still requires an accepted application, invitation or selected shortlist source.</p></div></div>
            <form onSubmit={findCandidates} className="workforce-search-card">
              <div className="form-grid">
                {mode === "project" ? <label className="field">Survey project<input readOnly value={chosenProject?.title || "Authorized project"} /></label> : <label className="field">Survey project<select value={projectId} onChange={(e) => { setProjectId(e.target.value); setCandidates([]); setOffer(null); }} required><option value="">Choose active project</option>{activeProjects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>}
                <label className="field">Name / skill / language<div className="workforce-search-input"><Search size={16} /><input value={query} maxLength={100} onChange={(e) => setQuery(e.target.value)} placeholder="Search Field Workers" /></div></label>
              </div>
              <button className="primary" disabled={busy || !projectId}>Search Field Workers</button>
            </form>
            <div className="workforce-card-grid candidates">
              {candidates.map((c) => {
                const details = c.details || {};
                return <article className="workforce-candidate-card" key={c.user_id}>
                  <div className="workforce-card-header"><div className="workforce-avatar">{initials(details.full_name || c.user_id)}</div><div className="workforce-card-title"><span>{human(c.match_label === "local_verified" ? "active_profile" : c.match_label)}</span><h4>{details.full_name || c.user_id}</h4><small>{details.skills || "Skills not listed"}</small></div>{c.source_kind ? <Badge value="selected" /> : <span className="badge pending">Discovery only</span>}</div>
                  <div className="workforce-candidate-facts"><span><strong>Languages</strong>{details.languages || "Not listed"}</span><span><strong>Approved surveys</strong>{c.approved_surveys}</span><span><strong>Approval rate</strong>{c.approval_rate === null ? "Insufficient data" : `${c.approval_rate}%`}</span><span><strong>Completed assignments</strong>{c.completed_assignments}</span><span><strong>Verified experience</strong>{c.verified_experiences}</span></div>
                  <p className="workforce-helper"><strong>Selection source:</strong> {c.source_kind ? human(c.source_kind) : "No accepted application/invitation or selected shortlist yet"}</p>
                  <div className="workforce-card-actions"><span>{c.source_kind ? "Eligible for formal offer" : "Use the recruitment lifecycle before assignment"}</span><button className="primary" disabled={busy || !c.source_kind} onClick={() => setOffer(c)}>Offer assignment</button></div>
                </article>;
              })}
            </div>
            {!candidates.length && !busy && <WorkforceEmpty icon={<UsersRound size={22} />} title="Search the Field Worker network" copy="Choose an active project and search by name, skill or language. Discovery does not grant permanent access to a worker's full private profile." />}
            {offer && chosenProject && offer.source_kind !== "application" && <AssignmentOfferForm offer={offer} project={chosenProject} compensation={offerCompensation} busy={busy} onCancel={() => setOffer(null)} onSubmit={offerAssignment} />}
          </>}

          {organizationView === "assignments" && <>
            <div className="workforce-section-heading"><div><span className="eyebrow">DELIVERY TEAM</span><h3>{mode === "poem" ? "Assignment oversight" : "Project assignments"}</h3><p>Offers become active only after Field Worker acceptance. Completion creates verified FieldLance work history.</p></div><span className="workforce-count">{assignments.length} total</span></div>
            <div className="workforce-list">
              {assignments.map((a) => <AssignmentCard key={a.id} assignment={a} project={projectMap.get(a.survey_project_id)} orgName={orgMap.get(a.organization_id)} mode={mode} busy={busy} act={act} focused={focusKind==="assignment"&&focusId===a.id} onFocus={()=>onFocusChange?.("assignment",a.id)} />)}
            </div>
            {!assignments.length && !busy && <WorkforceEmpty icon={<CheckCircle2 size={22} />} title="No assignments yet" copy="Select an applicant or eligible recruited Field Worker, send an offer, and the assignment will appear here." />}
          </>}

          {opportunities.length > 0 && <p className="workforce-footnote">{opportunities.length} linked project opportunit{opportunities.length === 1 ? "y" : "ies"}. Closing recruitment blocks only new applications; existing applications remain reviewable.</p>}
        </>
      )}
    </section>
  );

  function reviewApplication(application: Application, status: "shortlisted" | "selected" | "rejected") {
    const note = window.prompt(`Review note for ${human(status)}:`, status === "selected" ? "Selected for a formal assignment offer." : "Reviewed by project recruitment administrator.");
    if (note) void act(() => rpc("review_work_application", { p_id: application.id, p_status: status, p_note: note, p_version: application.version }), `Application marked ${human(status)}.`);
  }
}

function WorkforceMetric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: number; detail: string }) {
  return <article className="workforce-metric"><div className="workforce-metric-icon">{icon}</div><div><strong>{value}</strong><span>{label}</span><small>{detail}</small></div></article>;
}

function WorkforceMeta({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="workforce-meta"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}

function WorkforceEmpty({ icon, title, copy, action }: { icon: ReactNode; title: string; copy: string; action?: ReactNode }) {
  return <div className="workforce-empty"><div>{icon}</div><h4>{title}</h4><p>{copy}</p>{action}</div>;
}

function WorkerJourney({ active }: { active: PersonalView }) {
  const activeIndex = active === "opportunities" ? 0 : active === "applications" ? 1 : active === "assigned" ? 3 : 0;
  const steps = [["Discover", "Browse open work"], ["Apply", "Send your snapshot"], ["Selection", "Organization reviews"], ["Assigned", "Accept & work"]] as const;
  return <div className="workforce-journey" aria-label="Field Worker recruitment lifecycle">{steps.map(([label, copy], index) => <div key={label} className={index <= activeIndex ? "active" : ""}><span>{index + 1}</span><div><strong>{label}</strong><small>{copy}</small></div>{index < steps.length - 1 && <ArrowRight size={15} />}</div>)}</div>;
}

function RecruitmentProgress({ status, organization = false }: { status: string; organization?: boolean }) {
  const activeThrough = status === "shortlisted" ? 1 : status === "selected" ? 2 : 0;
  const labels = organization ? ["Applied", "Shortlisted", "Selected", "Offer"] : ["Applied", "Shortlisted", "Selected", "Offer / assignment"];
  return <div className={`recruitment-progress ${status === "rejected" || status === "withdrawn" ? "stopped" : ""}`}>{labels.map((label, index) => <span key={label} className={index <= activeThrough ? "active" : ""}><i>{index < activeThrough ? "✓" : index + 1}</i>{label}</span>)}</div>;
}

function AssignmentOfferForm({ offer, project, compensation, busy, onCancel, onSubmit }: { offer: Candidate; project: Project; compensation: string; busy: boolean; onCancel: () => void; onSubmit: (e: FormEvent<HTMLFormElement>) => void }) {
  return <form onSubmit={onSubmit} className="workforce-inline-form workforce-offer-form">
    <div className="workforce-section-heading compact"><div><span className="eyebrow">FORMAL OFFER</span><h3>Assignment terms for {offer.details.full_name || offer.user_id}</h3><p>Project: {project.title}. Compensation is inherited from the recruitment opportunity snapshot or project default and becomes immutable when offered.</p></div></div>
    <p className="notice"><strong>Contract compensation:</strong> {compensation}</p>
    <div className="form-grid"><label className="field">Survey target<input name="target" type="number" min={1} max={1000000} required /></label><label className="field">Start<input name="start" type="date" defaultValue={project.start_date} required /></label><label className="field">End<input name="end" type="date" defaultValue={project.end_date} required /></label></div>
    <label className="field">Terms / deliverables<textarea name="terms" minLength={5} maxLength={3000} required defaultValue="Complete assigned field surveys according to FieldLance data-quality, consent and project rules." /></label>
    <div className="actions"><button type="button" className="secondary" onClick={onCancel}>Cancel</button><button className="primary" disabled={busy}>Send formal offer</button></div>
  </form>;
}

function AssignmentCard({ assignment: a, project, orgName, mode, busy, act, focused, onFocus }: {
  assignment: Assignment;
  project?: Project;
  orgName?: string;
  mode: Mode;
  busy: boolean;
  act: (fn: () => Promise<unknown>, success: string) => Promise<boolean>;
  focused: boolean;
  onFocus?: () => void;
}) {
  const [complete, setComplete] = useState(false);
  return <article id={`workforce-assignment-${a.id}`} className={`workforce-assignment-card organization ${focused?"route-focus":""}`}>
    <div className="workforce-assignment-top"><div><span>{a.organization_name || orgName || a.organization_id}</span><h4>{a.project_title || project?.title || a.survey_project_id}</h4>{a.opportunity_title && <small>{a.opportunity_title}</small>}</div><Badge value={a.status} /></div>
    <div className="workforce-meta-grid three"><WorkforceMeta icon={<CalendarDays size={15} />} label="Assignment dates" value={`${shortDate(a.start_date)} – ${shortDate(a.end_date)}`} /><WorkforceMeta icon={<FileCheck2 size={15} />} label="Survey target" value={`${a.target_surveys} surveys`} /><WorkforceMeta icon={<CircleDollarSign size={15} />} label="Compensation" value={money(a)} /></div>
    <p className="workforce-helper"><strong>Field Worker:</strong> {a.volunteer_name}</p>
    <p className="workforce-helper"><strong>Terms:</strong> {a.terms_note}</p>
    <p className="workforce-helper"><strong>Compensation source:</strong> {human(a.compensation_source)}{a.compensation_source_version ? ` v${a.compensation_source_version}` : ""}{a.compensation_note_snapshot ? ` · ${a.compensation_note_snapshot}` : ""}</p>
    {a.completion_note && <p className="notice success">Completion: {a.completion_note}</p>}
    {a.cancellation_note && <p className="notice">Cancellation: {a.cancellation_note}</p>}
    <div className="workforce-card-actions"><span>{assignmentNextStep(a.status)}</span><div className="actions"><button className="link" type="button" onClick={onFocus}>Open assignment link</button>
      {(mode === "ngo" || mode === "project") && a.status === "active" && <><button className="primary" disabled={busy} onClick={() => setComplete((v) => !v)}>Complete assignment</button><button className="secondary" disabled={busy} onClick={() => { const note=window.prompt("Cancellation reason:","Assignment cancelled by project administrator."); if(note) void act(() => rpc("cancel_work_assignment",{p_id:a.id,p_note:note,p_version:a.version}),"Assignment cancelled and survey access revoked."); }}>Cancel assignment</button></>}
      {mode !== "personal" && a.status === "offered" && <button className="secondary" disabled={busy} onClick={() => { const note=window.prompt("Cancellation reason:","Assignment offer withdrawn by project administrator."); if(note) void act(() => rpc("cancel_work_assignment",{p_id:a.id,p_note:note,p_version:a.version}),"Assignment offer cancelled."); }}>Withdraw offer</button>}
    </div></div>
    {complete && (mode === "ngo" || mode === "project") && <form className="workforce-completion-form" onSubmit={(e) => {
      e.preventDefault();const f=new FormData(e.currentTarget);
      const feedback: Json={professionalism:Number(val(f,"professionalism")),communication:Number(val(f,"communication")),field_discipline:Number(val(f,"discipline")),data_quality:Number(val(f,"quality")),task_completion:Number(val(f,"completion"))};
      void act(() => rpc("complete_work_assignment",{p_id:a.id,p_feedback:feedback,p_note:val(f,"note"),p_version:a.version}),"Assignment completed and added to verified FieldLance work history.");
    }}><h4>Structured completion feedback</h4><div className="form-grid">{[["professionalism","Professionalism"],["communication","Communication"],["discipline","Field discipline"],["quality","Data quality"],["completion","Task completion"]].map(([name,label]) => <label className="field" key={name}>{label}<select name={name} defaultValue="5">{[1,2,3,4,5].map((n)=><option key={n} value={n}>{n} / 5</option>)}</select></label>)}</div><label className="field">Completion note<textarea name="note" minLength={5} maxLength={3000} required /></label><button className="primary" disabled={busy}>Confirm completion</button></form>}
  </article>;
}

function opportunityState(o: Opportunity) {
  if (o.publication_state === "draft") return "draft";
  if (o.status !== "open") return "closed";
  return o.applications_open ? "active" : "closed";
}

function shortDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FW";
}

function readableSnapshot(value: unknown) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string").join(", ");
  return typeof value === "string" ? value : "";
}

function applicationNextStep(status: string, organization = false) {
  if (organization) {
    if (status === "pending") return "Review the application and profile snapshot";
    if (status === "shortlisted") return "Decide whether to select this Field Worker";
    if (status === "selected") return "Send a formal assignment offer";
    if (status === "rejected") return "Application closed";
    return human(status);
  }
  if (status === "pending") return "Waiting for organization review";
  if (status === "shortlisted") return "Shortlisted · organization is reviewing your application";
  if (status === "selected") return "Selected · wait for a formal assignment offer";
  if (status === "rejected") return "Application was not selected";
  if (status === "withdrawn") return "Application withdrawn";
  return human(status);
}

function assignmentNextStep(status: string) {
  if (status === "offered") return "Waiting for Field Worker acceptance";
  if (status === "active") return "Field work is active";
  if (status === "completed") return "Completed and recorded in work history";
  if (status === "declined") return "Offer declined";
  if (status === "cancelled" || status === "canceled") return "Assignment cancelled";
  return human(status);
}
