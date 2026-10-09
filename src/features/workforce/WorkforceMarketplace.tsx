import {recruitmentStage,linkedAssignment,applicationDisplayStatus,loadApplicationAssignments,type ApplicationAssignment} from './recruitmentState';
import {useRecruitmentCollection,recruitmentQuery} from './recruitmentQueries';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, BriefcaseBusiness, CalendarDays, CheckCircle2, CircleDollarSign, Clock3, FileCheck2, MapPin, Search, Send, UsersRound } from "lucide-react";
import { db, rpc } from "../../lib/supabase/client";
import type { Database, Json } from "../../lib/supabase/database.types";
import { geographyPath, type Geo } from "../geography/model";
import { AreaSelector } from "../geography/AreaSelector";
import { human } from "../../shared/ui/FormFields";
import { OrganizationLogoImage } from "../organizations/OrganizationLogo";
import { Alert, BottomSheet, Button, StatusBadge, Tabs, type SemanticTone } from "../../components/ui/FieldLanceUI";
import styles from "./WorkforceMarketplace.module.css";

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
  project_required_volunteers: number | null;
  marketplace_origin: string;
  marketplace_current: boolean;
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
type ConflictPreview = {
  status: "clear" | "warning" | "hard_conflict";
  headline: string;
  reasons: string[];
  schedule_configured: boolean;
  overlapping_commitments: number;
  unavailable_days: number;
  estimated_available_days: number | null;
  max_active_projects: number;
  max_days_per_week: number;
  proposed_concurrent_projects: number;
  capacity_pct: number;
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
  onAttendance,
  onOpenField,
  initialOpportunityId = null,
  onOpportunityChange,
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
  onAttendance?: (assignmentId: string) => void;
  onOpenField?: (projectId: string) => void;
  initialOpportunityId?: string | null;
  onOpportunityChange?: (opportunityId: string | null) => void;
}) {
  const [projectRows, setProjects] = useState<Project[]>([]),
    [available, setAvailable] = useState<AvailableRow[]>([]),
    [currentContractProjects,setCurrentContractProjects]=useState<string[]>([]),
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

  const [filtersOpen,setFiltersOpen]=useState(false);
  const [selectedApplicationId,setSelectedApplicationId]=useState<string|null>(null);
  const [applicationDetailOpen,setApplicationDetailOpen]=useState(false);
  const activeFilterCount=[orgFilter,areaFilter,paymentFilter,skillFilter,workDateFilter,deadlineFilter].filter(Boolean).length;
  function clearFilters(){setOrgFilter("");setAreaFilter("");setPaymentFilter("");setSkillFilter("");setWorkDateFilter("");setDeadlineFilter("");setAvailablePage(0)}
  const [opportunityFilter,setOpportunityFilter]=useState(initialOpportunityId);
  const [applicationAssignments,setApplicationAssignments]=useState<ApplicationAssignment[]>([]);
  const [linksBusy,setLinksBusy]=useState(true),[linksError,setLinksError]=useState("");
  const [availableBusy,setAvailableBusy]=useState(false),[availableError,setAvailableError]=useState("");
  const applicationDialog=useRef<HTMLDialogElement>(null);
  const applicationOpener=useRef<HTMLElement|null>(null);
  const actionFlight=useRef(false);
  useEffect(()=>{
    setOpportunityFilter(initialOpportunityId);
    if(initialOpportunityId)setOrganizationView("applications");
  },[initialOpportunityId]);
  useEffect(()=>{
    if(focusKind==="application"&&focusId){
      setSelectedApplicationId(focusId);
      setApplicationDetailOpen(true);
    }
  },[focusKind,focusId]);
  useEffect(()=>{
    if(!applying)return;
    const dialog=applicationDialog.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    return()=>{dialog?.close();applicationOpener.current?.focus()};
  },[applying]);
  const scope=mode==='personal'?{userId}:mode==='project'?{project:projectScopeId}:mode==='ngo'?{organization}:{};
  const applicationList=useRecruitmentCollection('work_applications',{...scope,status:mode==='personal'?null:applicationFilter,opportunity:opportunityFilter},revision);
  const assignmentList=useRecruitmentCollection('work_assignments',scope,revision);
  const opportunityList=useRecruitmentCollection('work_opportunities',scope,revision,mode!=='personal');
  const [focused,setFocused]=useState<{application?:Application;assignment?:Assignment;project?:Project;opportunity?:Opportunity}>({});
  const [focusState,setFocusState]=useState<'idle'|'loading'|'ready'|'unavailable'|'error'>('idle');
  const [focusRevision,setFocusRevision]=useState(0);
  const focusScope=JSON.stringify(scope);
  useEffect(()=>{
    let live=true;setFocused({});
    if(!focusId||!focusKind){setFocusState('idle');return}
    if(!/^[0-9a-f-]{36}$/i.test(focusId)){setFocusState('unavailable');return}
    setFocusState('loading');
    void (async()=>{
      try{
        const result=await recruitmentQuery(focusKind==='application'?'work_applications':'work_assignments',scope).eq('id',focusId).maybeSingle();
        if(result.error)throw result.error;
        if(!live)return;
        if(!result.data){setFocusState('unavailable');return}
        const row=result.data as Application|Assignment;
        const p=await db!.from("survey_projects").select('*').eq('id',row.survey_project_id).maybeSingle();
        if(p.error)throw p.error;
        let opportunity:Opportunity|undefined;
        if(row.opportunity_id){
          const o=await db!.from("work_opportunities").select('*').eq('id',row.opportunity_id).maybeSingle();
          if(o.error)throw o.error;opportunity=o.data||undefined;
        }
        if(!live)return;
        setFocused({...(focusKind==='application'?{application:row as Application}:{assignment:row as Assignment}),project:p.data||undefined,opportunity});
        setFocusState('ready');
      }catch{if(live)setFocusState('error')}
    })();
    return()=>{live=false};
  },[focusKind,focusId,focusScope,revision,focusRevision]);
  const includeFocused=<T extends {id:string}>(rows:T[],row?:T)=>row?[row,...rows.filter(item=>item.id!==row.id)]:rows;
  const applications=includeFocused(applicationList.rows,focused.application);
  const assignments=includeFocused(assignmentList.rows,focused.assignment);
  const opportunities=includeFocused(opportunityList.rows,focused.opportunity);
  const projects=includeFocused(projectRows,focused.project);
  const applicationIds=applications.map(row=>row.id).sort().join(",");
  useEffect(()=>{
    let live=true;setLinksBusy(true);setLinksError("");setApplicationAssignments([]);
    void loadApplicationAssignments(applicationIds?applicationIds.split(","):[]).then(rows=>{
      if(live)setApplicationAssignments(rows);
    }).catch(()=>{if(live)setLinksError("Offer status could not be loaded. Refresh before sending an offer.")})
      .finally(()=>{if(live)setLinksBusy(false)});
    return()=>{live=false};
  },[applicationIds,revision]);

  async function load(current:()=>boolean) {
    setBusy(true);setError('');
    try{
      let p=db!.from("survey_projects").select('*').order('created_at',{ascending:false}).limit(500);
      if(mode==='ngo'&&organization)p=p.eq('organization_id',organization);
      if(mode==='project'&&projectScopeId)p=p.eq('id',projectScopeId);
      const projectResult=await p;if(projectResult.error)throw projectResult.error;
      if(!current())return;setProjects(projectResult.data||[]);
      if(mode==='personal'){
        const sa=await db!.from("survey_assignments").select('*').eq('user_id',userId).eq('active',true).limit(500);
        if(sa.error)throw sa.error;if(!current())return;setSurveyAssignments(sa.data||[]);
        const projectIds=(sa.data||[]).map(row=>row.project_id);
        if(projectIds.length){const contracts=await db!.from("work_assignments").select('survey_project_id').eq('user_id',userId).in('survey_project_id',projectIds).in('status',['active','completed']).limit(500);if(contracts.error)throw contracts.error;if(current())setCurrentContractProjects((contracts.data||[]).map(row=>row.survey_project_id));}else setCurrentContractProjects([]);
      }else{setSurveyAssignments([]);setAvailable([]);setAvailableTotal(0)}
    }catch{if(current())setError('Recruitment context could not be loaded. Refresh this view to try again.')}
    finally{if(current())setBusy(false)}
  }
  useEffect(() => {
    let live=true;void load(()=>live);return()=>{live=false};
  }, [mode, organization, projectScopeId, userId, revision]);
  useEffect(()=>{
    let live=true;
    if(mode!=="personal")return;
    setAvailableBusy(true);setAvailableError("");
    // Debounce typing; stale responses must never replace the current filter's result.
    const timer=window.setTimeout(()=>{
      void rpc('available_work_opportunities',{p_page:availablePage,p_organization:orgFilter||null,p_area:areaFilter||null,p_payment:paymentFilter||null,p_skill:skillFilter,p_work_date:workDateFilter||null,p_deadline:deadlineFilter||null})
        .then(value=>{if(live){const result=value as unknown as {rows:AvailableRow[];total:number};setAvailable(result.rows||[]);setAvailableTotal(Number(result.total||0))}})
        .catch(()=>{if(live){setAvailable([]);setAvailableError("Opportunities could not be loaded. Retry to continue.")}})
        .finally(()=>{if(live)setAvailableBusy(false)});
    },200);
    return()=>{live=false;window.clearTimeout(timer)};
  },[mode,userId,revision,orgFilter,areaFilter,paymentFilter,skillFilter,workDateFilter,deadlineFilter,availablePage]);

  useEffect(() => {
    if (mode !== "project" || !projectScopeId) return;
    setProjectId(projectScopeId);
    setCreateProjectId(projectScopeId);
  }, [mode, projectScopeId]);

  useEffect(()=>{
    if(!focusId||!focusKind)return;
    if(mode!=="personal")setOrganizationView(focusKind==="application"?"applications":"assignments");
    const timer=window.setTimeout(()=>{const element=document.getElementById("workforce-"+focusKind+"-"+focusId);element?.focus({preventScroll:true});element?.scrollIntoView({block:"center"});},60);
    return()=>window.clearTimeout(timer);
  },[focusKind,focusId,mode,focusState,focused]);

  async function act(fn: () => Promise<unknown>, success: string): Promise<boolean> {
    if(actionFlight.current)return false;
    actionFlight.current=true;
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
      setError("This recruitment action could not be completed. Refresh the record, check its current status and try again.");
      setBusy(false);
      return false;
    } finally {actionFlight.current=false;}
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
      setError("This recruitment action could not be completed. Refresh the record, check its current status and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function openCandidateOffer(candidate:Candidate){
    if(candidate.source_kind==="application"&&candidate.source_id){
      setBusy(true);setError("");
      try{
        const result=await recruitmentQuery("work_applications",scope).eq("id",candidate.source_id).maybeSingle();
        if(result.error||!result.data)throw result.error||new Error("Application unavailable");
        const application=result.data as Application;
        const linked=await loadApplicationAssignments([application.id]);
        if(linked.length){onFocusChange?.("assignment",linked[0].id);setOrganizationView("assignments");return;}
        const opportunity=application.opportunity_id?await db!.from("work_opportunities").select("*").eq("id",application.opportunity_id).maybeSingle():{data:null,error:null};
        if(opportunity.error)throw opportunity.error;
        setFocused({application,project:projectMap.get(application.survey_project_id),opportunity:opportunity.data||undefined});
        setOffer(candidate);
      }catch{setError("The selected application could not be loaded. Refresh recruitment and try again.")}
      finally{setBusy(false)}
    }else setOffer(candidate);
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
    sa.active && !currentContractProjects.includes(sa.project_id),
  );
  const availablePageSize = 50;
  const availablePages = Math.max(1, Math.ceil(availableTotal / availablePageSize));
  const showOpportunities = mode !== "personal" || personalView === "all" || personalView === "opportunities";
  const showApplications = mode !== "personal" || personalView === "all" || personalView === "applications" || focusKind==="application";
  const showAssigned = mode !== "personal" || personalView === "all" || personalView === "assigned" || focusKind==="assignment";
  const openOpportunityCount = opportunities.filter((o) => o.publication_state === "published" && o.status === "open" && o.applications_open).length;
  const pendingApplicationCount = applications.filter((a) => a.status === "pending").length;
  const offeredAssignmentCount = assignments.filter((a) => a.status === "offered").length;
  const activeAssignmentCount = assignments.filter((a) => a.status === "active").length;
  const filteredApplications = applications;
  const requestedApplicationId = focusKind === "application" && focusId ? focusId : selectedApplicationId;
  const selectedApplication = filteredApplications.find((application) => application.id === requestedApplicationId) || filteredApplications[0] || null;
  const selectedApplicationAssignment = selectedApplication ? linkedAssignment(selectedApplication.id, applicationAssignments) : undefined;

  function selectOrganizationView(next: OrganizationView) {
    setOrganizationView(next);
    setOffer(null);
    if (next !== "field_workers") setCandidates([]);
  }

  const organizationHeading = mode === "ngo"
    ? "Organization recruitment"
    : mode === "project"
      ? "Recruitment"
      : "Workforce operations";
  const organizationCopy = mode === "ngo"
    ? "Published projects appear automatically in the Field Worker marketplace. Review applications, optionally run targeted campaigns, and activate accountable assignments."
    : mode === "project"
      ? "This published project is automatically discoverable to Field Workers while recruitment is open; review applicants and manage formal assignments here."
      : "Oversee automatic project marketplace listings, applications and assignments across authorized organizations.";

  const opportunityFilters=(<div className={styles.filterPanel}>
              <div className={styles.sectionHeader}><div><span className="fl-eyebrow">FILTERS</span><h3>Filter opportunities</h3></div></div>
              <div className={styles.filterGrid}>
                <label className="field">Organization<select value={orgFilter} onChange={(e) => { setOrgFilter(e.target.value); setAvailablePage(0); }}><option value="">All organizations</option>{orgs.filter((o)=>o.status==="active").map((o)=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
                <label className="field">Payment<select value={paymentFilter} onChange={(e)=>{ setPaymentFilter(e.target.value); setAvailablePage(0); }}><option value="">Paid or volunteer</option><option value="paid">Paid</option><option value="unpaid">Volunteer / unpaid</option></select></label>
                <label className="field">Skill<input value={skillFilter} maxLength={100} onChange={(e)=>{ setSkillFilter(e.target.value); setAvailablePage(0); }} placeholder="e.g. Data collection" /></label>
                <label className="field">Work date<input type="date" value={workDateFilter} onChange={(e)=>{ setWorkDateFilter(e.target.value); setAvailablePage(0); }} /></label>
                <label className="field">Apply by<input type="date" value={deadlineFilter} onChange={(e)=>{ setDeadlineFilter(e.target.value); setAvailablePage(0); }} /></label>
              </div>
              <AreaSelector rows={geographies} value={areaFilter || null} onChange={(id) => { setAreaFilter(id || ""); setAvailablePage(0); }} title="Work area" />
              <div className={styles.filterActions}><Button type="button" variant="secondary" onClick={clearFilters}>Clear filters</Button><Button type="button" variant="primary" onClick={()=>setFiltersOpen(false)}>Apply filters</Button></div>
            </div>);
  return (
    <section className={styles.root}>
      <div className={styles.statusStack}>
        {error && <Alert tone="danger" title="Recruitment could not be updated" action={<Button variant="secondary" type="button" onClick={()=>setRevision(n=>n+1)}>Refresh recruitment</Button>}>{error}</Alert>}
        {linksError&&<Alert tone="danger" title="Offer status could not be loaded" action={<Button variant="secondary" type="button" onClick={()=>setRevision(n=>n+1)}>Retry offer status</Button>}>{linksError}</Alert>}
        {message && <Alert tone="success" title={message} />}
        {focusState==="loading"&&<p role="status" className={styles.helper}>Loading linked recruitment record…</p>}
        {focusState==="unavailable"&&<Alert tone="warning" title="Recruitment record unavailable">It may no longer exist or your access may have changed. Use the available lists below or contact the organization.</Alert>}
        {focusState==="error"&&<Alert tone="danger" title="Linked record could not be loaded" action={<Button variant="secondary" type="button" onClick={()=>setFocusRevision(n=>n+1)}>Retry linked record</Button>} />}
        {busy && <p className={styles.helper} role="status">Loading workforce records…</p>}
      </div>

      {mode === "personal" ? (
        <div className={styles.personal} data-view={personalView}>
          <WorkerJourney stage={recruitmentStage(applications,[...assignments,...applicationAssignments])} />
          <div className={styles.summaryGrid} aria-label="Field Worker marketplace summary">
            <WorkforceMetric icon={<BriefcaseBusiness size={18} />} label="Open projects" value={availableTotal} detail="Published projects you can explore" />
            <WorkforceMetric icon={<FileCheck2 size={18} />} label="My applications" value={applications.length} detail={`${applications.filter((a) => ["pending", "shortlisted", "selected"].includes(a.status)).length} loaded applications still in recruitment`} />
            <WorkforceMetric icon={<Send size={18} />} label="Offers" value={offeredAssignmentCount} detail="Loaded offers awaiting your decision" />
            <WorkforceMetric icon={<CheckCircle2 size={18} />} label="Active assignments" value={activeAssignmentCount} detail="Loaded accepted contracts; collection eligibility is checked separately" />
          </div>

          {showOpportunities && <>
            {availableError&&<Alert tone="danger" title="Opportunities could not be loaded" action={<Button type="button" variant="secondary" onClick={()=>setRevision(n=>n+1)}>Retry opportunities</Button>}>{availableError}</Alert>}
            {availableBusy&&<p role="status" className={styles.helper}>Refreshing opportunities…</p>}
            <div className={styles.sectionHeader}>
              <div><span className="fl-eyebrow">DISCOVER WORK</span><h3>Available projects</h3><p>Every published project with open recruitment appears automatically. Applying shares only the application-scoped recruitment snapshot required by the existing recruitment flow.</p></div>
              <span className={styles.count}>{availableTotal} available</span>
            </div>
            <div className={styles.desktopFilters}>{opportunityFilters}</div>
            <div className={styles.mobileFilterBar}>
              <Button type="button" variant="secondary" onClick={()=>setFiltersOpen(true)}>Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}</Button>
              {activeFilterCount>0&&<Button type="button" variant="tertiary" onClick={clearFilters}>Clear filters</Button>}
            </div>
            <BottomSheet open={filtersOpen} title="Filter opportunities" onClose={()=>setFiltersOpen(false)}>
              {opportunityFilters}
            </BottomSheet>
            <div className={styles.cardGrid}>
              {available.map((o) => {
                const org = orgById.get(o.organization_id);
                const location = geographyPath(o.geography_id, geographies).map((n)=>n.name).join(" / ");
                return <article className={styles.opportunityCard} key={o.id}>
                  <div className={styles.cardHeader}>
                    <div className={styles.identity}>
                      <OrganizationLogoImage name={o.organization_name} path={org?.logo_path} updatedAt={org?.logo_updated_at} size="card" />
                      <div className={styles.titleBlock}><span>{o.organization_name}</span><h4>{o.title}</h4><small>{o.project_title}</small></div>
                    </div>
                    <StatusBadge tone={o.work_mode === "paid" ? "info" : "neutral"}>{o.work_mode === "paid" ? "Paid" : "Volunteer"}</StatusBadge>
                  </div>
                  <p className={styles.description}>{o.description}</p>
                  <div className={styles.metaGrid}>
                    <WorkforceMeta icon={<MapPin size={15} />} label="Work area" value={location || "Area not listed"} />
                    <WorkforceMeta icon={<CalendarDays size={15} />} label="Work dates" value={`${shortDate(o.start_date)} – ${shortDate(o.end_date)}`} />
                    <WorkforceMeta icon={<CircleDollarSign size={15} />} label="Compensation" value={opportunityCompensation(o)} />
                    <WorkforceMeta icon={<UsersRound size={15} />} label="Project capacity" value={o.project_required_volunteers === null ? "Open / not configured" : `${o.project_required_volunteers} Field Worker${o.project_required_volunteers === 1 ? "" : "s"}`} />
                    <WorkforceMeta icon={<Clock3 size={15} />} label="Apply by" value={new Date(o.reply_by).toLocaleString()} />
                  </div>
                  <div className={styles.chips}>
                    {o.required_skill && <span>{o.required_skill}</span>}
                    {o.required_language && <span>{o.required_language}</span>}
                  </div>
                  <div className={styles.matchRow} aria-label="Recruitment profile match">
                    <span className={styles.matchPill} data-match={o.area_match}>{o.area_match ? "✓ Area match" : "Area differs"}</span>
                    {o.required_skill && <span className={styles.matchPill} data-match={o.skill_match}>{o.skill_match ? "✓ Skill match" : "Skill differs"}</span>}
                    {o.required_language && <span className={styles.matchPill} data-match={o.language_match}>{o.language_match ? "✓ Language match" : "Language differs"}</span>}
                  </div>
                  {o.eligibility_note && <p className={styles.helper}><strong>Selection note:</strong> {o.eligibility_note}</p>}
                  {o.visibility === "area" && !o.area_match && <Alert tone="warning" title="Work area differs from your profile">You may still apply if you can work in the listed area.</Alert>}
                  {!o.can_apply && o.eligibility_reason && <Alert tone="warning" title="Application unavailable">{o.eligibility_reason}</Alert>}
                  <div className={styles.cardActions}>
                    <span className={styles.nextStep}>{o.marketplace_origin === "project_auto" ? "Automatic project marketplace listing" : o.visibility === "invite_only" ? "Invite-only recruitment" : "Open recruitment"}</span>
                    {o.application_status ? <StatusBadge tone={statusTone(o.application_status)}>{applicationDisplayStatus(o.application_status)}</StatusBadge> : o.invitation_status ? <StatusBadge tone="warning">Invitation {human(o.invitation_status)} · respond from Invitations</StatusBadge> : (
                      <Button variant="primary" type="button" disabled={busy || availableBusy || !o.can_apply} onClick={(event) => {applicationOpener.current=event.currentTarget;setApplying(o)}}>Apply <ArrowRight size={15} /></Button>
                    )}
                  </div>
                </article>;
              })}
            </div>
            {!available.length && !busy && !availableBusy && !availableError && <WorkforceEmpty icon={<Search size={22} />} title="No available projects" copy="No available projects match your current filters or recruitment eligibility." />}
            {availableTotal > 0 && <div className={styles.pagination}>
              <Button variant="secondary" type="button" disabled={busy || availableBusy || availablePage === 0} onClick={() => setAvailablePage((p) => Math.max(0, p - 1))}>Previous</Button>
              <span>Page {availablePage + 1} of {availablePages} · {availableTotal} opportunit{availableTotal === 1 ? "y" : "ies"}</span>
              <Button variant="secondary" type="button" disabled={busy || availableBusy || availablePage + 1 >= availablePages} onClick={() => setAvailablePage((p) => p + 1)}>Next</Button>
            </div>}
          </>}

          {applying && <dialog ref={applicationDialog} className={styles.applicationDialog} aria-labelledby="application-title" onCancel={event=>{event.preventDefault();if(!busy)setApplying(null)}}>
          <form className={styles.applicationForm} onSubmit={submitApplication}>
            {error&&<Alert tone="danger" title="Application could not be submitted">{error}</Alert>}
            <div className={styles.sectionHeader}><div><span className="fl-eyebrow">APPLICATION</span><h3 id="application-title">Apply for {applying.title}</h3><p>{applying.organization_name} receives only the application-scoped recruitment profile snapshot required by the existing recruitment workflow.</p></div></div>
            <div className={styles.applicationContext}>
              <strong>{applying.project_title}</strong>
              <span>{shortDate(applying.start_date)} – {shortDate(applying.end_date)} · {opportunityCompensation(applying)}</span>
              <span>Private survey, beneficiary and private-document records are not part of this recruitment snapshot.</span>
            </div>
            <label className="field">Availability for this assignment<textarea name="availability" required minLength={3} maxLength={1000} defaultValue="Available during the listed project dates." /></label>
            <label className="field">Short message<textarea name="message" maxLength={2000} placeholder="Why are you interested or suitable for this field assignment?" /></label>
            <label className={styles.consent}><input name="consent" type="checkbox" required /><span>I consent to share my recruitment profile snapshot with <strong>{applying.organization_name}</strong> for this application. No permanent Organization profile access is required.</span></label>
            <div className={styles.actionGroup}><Button type="button" variant="tertiary" disabled={busy} onClick={()=>setApplying(null)}>Cancel</Button><Button variant="primary" disabled={busy}>Submit application</Button></div>
          </form></dialog>}


          {showApplications && <>
            <div className={styles.sectionHeader}>
              <div><span className="fl-eyebrow">RECRUITMENT PROGRESS</span><h3>My applications</h3><p>Track application review separately from formal offers and active assignments. Selection alone does not start field work.</p></div>
              <span className={styles.count}>{applications.length} loaded</span>
            </div>
            <div className={styles.list}>
              {applications.map((a) => {
                const org = orgById.get(a.organization_id);
                const linked=linkedAssignment(a.id,applicationAssignments);
                const displayStatus=applicationDisplayStatus(a.status,linked);
                return <article tabIndex={-1} id={`workforce-application-${a.id}`} className={styles.applicationCard} data-route-focus={focusKind==="application"&&focusId===a.id || undefined} key={a.id}>
                  <div className={styles.cardHeader}>
                    <div className={styles.identity}>
                      <OrganizationLogoImage name={a.organization_name} path={org?.logo_path} updatedAt={org?.logo_updated_at} size="card" />
                      <div className={styles.titleBlock}><span>{a.organization_name}</span><h4>{a.opportunity_title}</h4><small>{a.project_title}</small></div>
                    </div>
                    <StatusBadge tone={statusTone(linked?.status||a.status)}>{displayStatus}</StatusBadge>
                  </div>
                  <RecruitmentProgress status={linked?.status||a.status} />
                  <div className={styles.applicationCopy}><p><strong>Availability:</strong> {a.availability || "Not recorded"}</p>{a.note && <p><strong>Your message:</strong> {a.note}</p>}{a.review_note && <p><strong>Organization review:</strong> {a.review_note}</p>}</div>
                  <div className={styles.cardActions}>
                    <span className={styles.nextStep}>{linked ? assignmentNextStep(linked.status) : applicationNextStep(a.status)}</span>
                    <div className={styles.actionGroup}>
                      {linked&&<Button variant="primary" type="button" onClick={()=>linked.status==="active"&&onOpenField?onOpenField(linked.survey_project_id):onFocusChange?.("assignment",linked.id)}>{linked.status==="active"?"Open field work":linked.status==="offered"?"Review formal offer":"View assignment"}</Button>}
                      <Button variant="tertiary" type="button" onClick={()=>onFocusChange?.("application",a.id)}>View application details</Button>
                      {(a.status === "pending" || a.status === "shortlisted") && <Button variant="secondary" type="button" disabled={busy} onClick={() => void act(() => rpc("withdraw_work_application", { p_id: a.id, p_version: a.version }), "Application withdrawn.")}>Withdraw application</Button>}
                    </div>
                  </div>
                </article>;
              })}
            </div>
            <RecruitmentPages list={applicationList}/>
            {!applications.length && !busy && !applicationList.busy && !applicationList.error && <WorkforceEmpty icon={<FileCheck2 size={22} />} title="No applications yet" copy="When you apply to a published opportunity, its recruitment status will appear here." />}
          </>}


          {showAssigned && <>
            <div className={styles.sectionHeader}>
              <div><span className="fl-eyebrow">ASSIGNMENTS</span><h3>My assigned surveys</h3><p>Formal offers, accepted assignments and completed work are separate stages. Accepting a formal offer activates the assignment subject to the existing eligibility rules.</p></div>
              <span className={styles.count}>{assignments.length + directSurveyAssignments.length} record{assignments.length + directSurveyAssignments.length === 1 ? "" : "s"}</span>
            </div>
            <div className={styles.list}>
              {assignments.map((a) => (
                <article tabIndex={-1} id={`workforce-assignment-${a.id}`} className={styles.assignmentCard} data-route-focus={focusKind==="assignment"&&focusId===a.id || undefined} key={a.id}>
                  <div className={styles.assignmentHeader}><div><span>{a.organization_name}</span><h4>{a.project_title}</h4>{a.opportunity_title && <small>{a.opportunity_title}</small>}</div><StatusBadge tone={statusTone(a.status)}>{human(a.status)}</StatusBadge></div>
                  <div className={`${styles.metaGrid} ${styles.metaGridThree}`}>
                    <WorkforceMeta icon={<CalendarDays size={15} />} label="Assignment dates" value={`${shortDate(a.start_date)} – ${shortDate(a.end_date)}`} />
                    <WorkforceMeta icon={<FileCheck2 size={15} />} label="Survey target" value={`${a.target_surveys} surveys`} />
                    <WorkforceMeta icon={<CircleDollarSign size={15} />} label="Compensation" value={money(a)} />
                  </div>
                  <p className={styles.helper}><strong>Terms:</strong> {a.terms_note}</p>
                  {a.status === "offered" && <div className={styles.offerCallout}><div><strong>Formal assignment offer</strong><p>Accepting activates the assignment under the existing rules. Compensation and terms are frozen for this offer.</p></div><div className={styles.actionGroup}><Button variant="secondary" type="button" disabled={busy} onClick={() => void act(() => rpc("respond_work_assignment", { p_id: a.id, p_status: "declined", p_version: a.version }), "Offer declined.")}>Decline</Button><Button variant="primary" type="button" disabled={busy} onClick={() => void act(() => rpc("respond_work_assignment", { p_id: a.id, p_status: "accepted", p_version: a.version }), "Offer accepted. Survey access is active only while the assignment and project are eligible.")}>Accept offer</Button></div></div>}
                  {a.status === "active" && <Alert tone="success" title="Field work active">Offer accepted. Open field work to check current collection eligibility; project restrictions, dates and revocation still apply.</Alert>}
                  {a.status === "completed" && <Alert tone="success" title="Completed">This assignment is retained in your verified FieldLance work history.</Alert>}
                  <div className={styles.actionGroup}><Button variant="tertiary" type="button" onClick={()=>a.status==="active"&&onOpenField?onOpenField(a.survey_project_id):onFocusChange?.("assignment",a.id)}>{a.status==="active"?"Open field work":a.status==="offered"?"Review offer":"View assignment details"}</Button>{a.status === "active" && <Button variant="secondary" type="button" onClick={()=>onAttendance?.(a.id)}>Attendance / timesheet</Button>}</div>
                </article>
              ))}
              {directSurveyAssignments.map((sa) => {
                const project = projectMap.get(sa.project_id);
                return <article className={styles.assignmentCard} key={`direct-${sa.project_id}`}>
                  <div className={styles.assignmentHeader}><div><span>{project ? (orgMap.get(project.organization_id) || project.organization_id) : "Survey project"}</span><h4>{project?.title || sa.project_id}</h4><small>Historical survey assignment</small></div><StatusBadge tone="neutral">Inactive</StatusBadge></div>
                  <Alert tone="warning" title="Historical record only">This record does not grant collection access. Apply through Available projects, wait for application review and a formal offer, then accept the offer.</Alert>
                </article>;
              })}
            </div>
            <RecruitmentPages list={assignmentList}/>
            {!assignments.length && !directSurveyAssignments.length && !busy && !assignmentList.busy && !assignmentList.error && <WorkforceEmpty icon={<BriefcaseBusiness size={22} />} title="No assignments or offers yet" copy="After an organization selects you and sends a formal offer, it will appear here for acceptance." />}
          </>}
        </div>
      ) : (
        <div className={styles.organizationWorkspace}>
          <div className={styles.compactContext}>
            <div><span className="fl-eyebrow">RECRUITMENT</span><h2>{organizationHeading}</h2><p>{organizationCopy}</p></div>
            <Button variant="secondary" type="button" onClick={() => { selectOrganizationView("opportunities"); setCreate((v) => !v); setCreateProjectId(mode === "project" ? projectScopeId || "" : ""); setCreateArea(mode === "project" ? projectMap.get(projectScopeId || "")?.geography_id || null : null); }}>{create ? "Close optional campaign" : "+ Optional targeted campaign"}</Button>
          </div>

          <div className={styles.summaryGrid} aria-label="Loaded recruitment summary">
            <WorkforceMetric icon={<BriefcaseBusiness size={18} />} label="Open opportunities" value={openOpportunityCount} detail={`${opportunities.length} loaded recruitment records`} />
            <WorkforceMetric icon={<FileCheck2 size={18} />} label="Applications" value={pendingApplicationCount} detail={`${applications.length} applications loaded`} />
            <WorkforceMetric icon={<Send size={18} />} label="Offers pending" value={offeredAssignmentCount} detail="Loaded offers awaiting Field Worker response" />
            <WorkforceMetric icon={<CheckCircle2 size={18} />} label="Active assignments" value={activeAssignmentCount} detail="Loaded active assignments" />
          </div>

          <Tabs<OrganizationView>
            className={styles.tabs}
            label="Recruitment workspace sections"
            activeId={organizationView}
            onChange={selectOrganizationView}
            items={[
              {id:"opportunities",label:`Opportunities (${opportunities.length})`},
              {id:"applications",label:`Applications (${applications.length})`},
              {id:"field_workers",label:`Find Field Workers (${candidates.length})`},
              {id:"assignments",label:`Assignments (${assignments.length})`},
            ]}
          />

          {organizationView === "opportunities" && <>
            {create && (
              <form onSubmit={createOpportunity} className={styles.createCampaign}>
                <div className={styles.sectionHeader}><div><span className="fl-eyebrow">OPTIONAL TARGETED RECRUITMENT</span><h3>Create an additional campaign</h3><p>Normal recruitment does not require a separate opportunity: every published project already receives its automatic Field Worker marketplace listing. Use this only for an existing targeted or invitation workflow.</p></div></div>
                <div className="form-grid">
                  {mode === "project" ? <label className="field">Survey project<input readOnly value={chosenCreateProject?.title || "Authorized project"} /></label> : <label className="field">Survey project<select required value={createProjectId} onChange={(e) => { const id=e.target.value; setCreateProjectId(id); setCreateArea(projectMap.get(id)?.geography_id || null); }}><option value="">Choose active project</option>{activeProjects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>}
                  <label className="field">Opportunity title<input name="title" required minLength={3} maxLength={150} /></label>
                  <label className="field">Positions<input name="positions" type="number" min={1} max={5000} defaultValue={1} required /></label>
                  <label className="field">Start<input key={`start-${createProjectId}`} name="start" type="date" min={chosenCreateProject?.start_date} max={chosenCreateProject?.end_date} defaultValue={chosenCreateProject?.start_date || ""} required /></label>
                  <label className="field">End<input key={`end-${createProjectId}`} name="end" type="date" min={chosenCreateProject?.start_date} max={chosenCreateProject?.end_date} defaultValue={chosenCreateProject?.end_date || ""} required /></label>
                  <label className="field">Application deadline<input name="reply" type="datetime-local" required /></label>
                  <label className="field">Project compensation<input readOnly value={projectCompensation(chosenCreateProject)} /></label>
                  <label className="field">Recruitment access<select name="visibility" defaultValue="invite_only"><option value="invite_only">Invite only / targeted</option><option value="area">Additional area campaign</option><option value="all">Additional public campaign</option></select></label>
                  <label className="field">Publication<select name="publication" defaultValue="published"><option value="published">Publish now</option><option value="draft">Save as draft</option></select></label>
                  <label className="field">Required skill (optional)<input name="skill" maxLength={100} /></label>
                  <label className="field">Required language (optional)<input name="language" maxLength={100} /></label>
                </div>
                <AreaSelector rows={geographies} value={createArea} onChange={setCreateArea} title="Recruitment work area" />
                {chosenCreateProject && <Alert tone="info" title="Project recruitment boundary">The work area must stay within {chosenCreateProject.title}&apos;s configured project area. Compensation is snapshotted now; later project-rate changes do not alter this opportunity.</Alert>}
                <label className="field">Expected field tasks<textarea name="description" minLength={10} maxLength={4000} required /></label>
                <label className="field">Selection / eligibility note<textarea name="eligibility_note" maxLength={1000} placeholder="Optional qualifications, travel expectations or selection notes." /></label>
                <div className={styles.actionGroup}><Button variant="tertiary" type="button" onClick={() => { setCreate(false); setCreateProjectId(""); setCreateArea(null); }}>Cancel</Button><Button variant="primary" disabled={busy || !createProjectId || !createArea}>Save recruitment</Button></div>
              </form>
            )}
            <div className={styles.sectionHeader}><div><span className="fl-eyebrow">PROJECT MARKETPLACE</span><h3>Recruitment listings</h3><p>Published projects are listed automatically for Field Workers. Additional campaigns remain optional and preserve the existing recruitment source rules.</p></div><span className={styles.count}>{opportunities.length} loaded</span></div>
            <div className={styles.cardGrid}>
              {opportunities.map((o) => {
                const project = projectMap.get(o.survey_project_id || "");
                const location = geographyPath(o.geography_id, geographies).map((n)=>n.name).join(" / ");
                const applicationCount = applications.filter((a) => a.opportunity_id === o.id).length;
                return <article className={styles.opportunityCard} key={o.id}>
                  <div className={styles.cardHeader}><div className={styles.identity}><div className={styles.summaryIcon}><BriefcaseBusiness size={19} /></div><div className={styles.titleBlock}><span>{project?.title || "Survey project"}</span><h4>{o.title}</h4><small>{location || "Area not listed"}</small></div></div><StatusBadge tone={statusTone(opportunityState(o))}>{human(opportunityState(o))}</StatusBadge></div>
                  <p className={styles.description}>{o.description}</p>
                  <div className={`${styles.metaGrid} ${styles.metaGridThree}`}><WorkforceMeta icon={<UsersRound size={15} />} label="Project capacity" value={project?.required_volunteers == null ? "Open / not configured" : `${project.required_volunteers} required`} /><WorkforceMeta icon={<FileCheck2 size={15} />} label="Applications" value={`${applicationCount} loaded`} /><WorkforceMeta icon={<Clock3 size={15} />} label="Marketplace through" value={new Date(o.reply_by).toLocaleString()} /></div>
                  <div className={styles.chips}><span>{opportunityCompensation(o)}</span>{o.required_skill && <span>{o.required_skill}</span>}{o.required_language && <span>{o.required_language}</span>}</div>
                  <div className={styles.cardActions}><span className={styles.nextStep}>{o.marketplace_origin === "project_auto" ? "Automatic all-Field-Workers listing" : `${human(o.visibility)} recruitment`}</span><div className={styles.actionGroup}>
                    <Button variant="secondary" type="button" onClick={() => { setApplicationFilter("all"); setOpportunityFilter(o.id);selectOrganizationView("applications");onOpportunityChange?.(o.id); }}>View applicants</Button>
                    {o.marketplace_origin === "project_auto" ? <span className={styles.helper}>Use the project recruitment plan to pause or reopen this listing.</span> : <>
                      {o.publication_state === "draft" && <Button variant="primary" type="button" disabled={busy} onClick={()=>void act(()=>rpc("set_work_opportunity_state",{p_id:o.id,p_state:"published",p_version:o.version}),"Recruitment published and applications opened.")}>Publish</Button>}
                      {o.publication_state === "published" && o.status === "open" && o.applications_open && <Button variant="secondary" type="button" disabled={busy} onClick={()=>void act(()=>rpc("set_work_opportunity_state",{p_id:o.id,p_state:"closed",p_version:o.version}),"New applications closed. Existing applications remain reviewable.")}>Close applications</Button>}
                      {o.publication_state === "published" && o.status === "open" && !o.applications_open && <Button variant="primary" type="button" disabled={busy} onClick={()=>void act(()=>rpc("set_work_opportunity_state",{p_id:o.id,p_state:"published",p_version:o.version}),"Applications reopened.")}>Reopen applications</Button>}
                    </>}
                  </div></div>
                </article>;
              })}
            </div>
            <RecruitmentPages list={opportunityList}/>
            {!opportunities.length && !busy && !opportunityList.busy && !opportunityList.error && <WorkforceEmpty icon={<BriefcaseBusiness size={22} />} title="No published project listings yet" copy="Publish an active project and FieldLance will create its workforce marketplace listing automatically. No separate opportunity is required." />}
          </>}


          {organizationView === "applications" && <>
            {opportunityFilter&&<Alert tone="info" title={`Applicants for ${opportunities.find(o=>o.id===opportunityFilter)?.title||"selected opportunity"}`} action={<Button variant="secondary" type="button" onClick={()=>{setOpportunityFilter(null);onOpportunityChange?.(null)}}>Show all applicants</Button>} />}
            <div className={styles.sectionHeader}><div><span className="fl-eyebrow">REVIEW PIPELINE</span><h3>{mode === "poem" ? "Applications across organizations" : "Field Worker applications"}</h3><p>Review the immutable application-time recruitment snapshot, then shortlist, select or reject without collapsing application state into assignment state.</p></div><span className={styles.count}>{applications.length} loaded</span></div>
            <div className={styles.filterPills} aria-label="Application status filters">
              {(["all","pending","shortlisted","selected","rejected"] as ApplicationFilter[]).map((status) => <button type="button" key={status} data-active={applicationFilter === status} aria-pressed={applicationFilter === status} onClick={() => {setApplicationFilter(status);setApplicationDetailOpen(false)}}>{status === "all" ? "All" : human(status)}</button>)}
            </div>
            <div className={styles.applicationsWorkspace} data-mobile-detail={applicationDetailOpen}>
              <div className={styles.applicationListPane}>
                <div className={styles.applicationList}>
                  {filteredApplications.map((a) => {
                    const linked=linkedAssignment(a.id,applicationAssignments);
                    const active=selectedApplication?.id===a.id;
                    return <button type="button" className={styles.applicationListButton} data-active={active} aria-pressed={active} key={a.id} onClick={()=>{setSelectedApplicationId(a.id);setApplicationDetailOpen(true)}}>
                      <strong>{a.volunteer_name}</strong>
                      <span>{a.opportunity_title}</span>
                      <small>{applicationDisplayStatus(a.status,linked)} · {a.project_title}{mode === "poem" ? ` · ${orgMap.get(a.organization_id) || a.organization_name}` : ""}</small>
                    </button>;
                  })}
                </div>
                <RecruitmentPages list={applicationList}/>
                {!filteredApplications.length && !busy && !applicationList.busy && !applicationList.error && <WorkforceEmpty icon={<FileCheck2 size={22} />} title="No applications in this view" copy={applications.length ? "Choose another pipeline filter to see other applicants." : "Applications will appear here when Field Workers apply to published opportunities."} />}
              </div>
              <section className={styles.applicationDetail} aria-label="Applicant detail">
                <Button className={styles.mobileBack} variant="tertiary" type="button" onClick={()=>setApplicationDetailOpen(false)}>← Back to applications</Button>
                {selectedApplication ? <OrganizationApplicationDetail
                  application={selectedApplication}
                  linked={selectedApplicationAssignment}
                  mode={mode}
                  organizationName={orgMap.get(selectedApplication.organization_id) || selectedApplication.organization_name}
                  busy={busy}
                  linksBusy={linksBusy}
                  linksError={linksError}
                  onOpenApplication={()=>onFocusChange?.("application",selectedApplication.id)}
                  onOpenAssignment={(assignmentId)=>onFocusChange?.("assignment",assignmentId)}
                  onReview={(status)=>reviewApplication(selectedApplication,status)}
                  onOffer={()=>{
                    onFocusChange?.("application",selectedApplication.id);
                    setProjectId(selectedApplication.survey_project_id);
                    const details=(selectedApplication.profile_snapshot || {}) as Record<string,string>;
                    setOffer({user_id:selectedApplication.user_id,details,geography_id:typeof details.geography_id === "string" ? details.geography_id : null,shortlist_status:null,approved_surveys:0,reviewed_surveys:0,approval_rate:null,completed_assignments:0,verified_experiences:0,source_kind:"application",source_id:selectedApplication.id,match_label:"selected_application"});
                  }}
                /> : <WorkforceEmpty icon={<FileCheck2 size={22} />} title="Select an application" copy="Choose an applicant from the list to review their application-scoped recruitment snapshot and available actions." />}
              </section>
            </div>
            {offer && chosenProject && offer.source_kind === "application" && <AssignmentOfferForm offer={offer} project={chosenProject} compensation={offerCompensation} busy={busy} onCancel={() => setOffer(null)} onSubmit={offerAssignment} />}
          </>}


          {organizationView === "field_workers" && <>
            <div className={styles.sectionHeader}><div><span className="fl-eyebrow">OPTIONAL DIRECT RECRUITMENT</span><h3>Find Field Workers</h3><p>This remains a secondary path. Published projects are already discoverable in the marketplace; discovery here does not bypass application/invitation and formal-offer requirements.</p></div></div>
            <form onSubmit={findCandidates} className={styles.searchCard}>
              <div className="form-grid">
                {mode === "project" ? <label className="field">Survey project<input readOnly value={chosenProject?.title || "Authorized project"} /></label> : <label className="field">Survey project<select value={projectId} onChange={(e) => { setProjectId(e.target.value); setCandidates([]); setOffer(null); }} required><option value="">Choose active project</option>{activeProjects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>}
                <label className="field">Name / skill / language<div className={styles.searchInput}><Search size={16} /><input value={query} maxLength={100} onChange={(e) => setQuery(e.target.value)} placeholder="Search Field Workers" /></div></label>
              </div>
              <div className={styles.actionGroup}><Button variant="primary" disabled={busy || !projectId}>Search Field Workers</Button></div>
            </form>
            <div className={styles.cardGrid}>
              {candidates.map((c) => {
                const details = c.details || {};
                return <article className={styles.candidateCard} key={c.user_id}>
                  <div className={styles.cardHeader}><div className={styles.identity}><div className={styles.summaryIcon}>{initials(details.full_name || c.user_id)}</div><div className={styles.titleBlock}><span>{human(c.match_label === "local_verified" ? "active_profile" : c.match_label)}</span><h4>{details.full_name || c.user_id}</h4><small>{details.skills || "Skills not listed"}</small></div></div>{c.source_kind ? <StatusBadge tone="success">Eligible recruitment source</StatusBadge> : <StatusBadge tone="neutral">Discovery only</StatusBadge>}</div>
                  <div className={styles.candidateFacts}><span><strong>Languages</strong>{details.languages || "Not listed"}</span><span><strong>Approved surveys</strong>{c.approved_surveys}</span><span><strong>Approval rate</strong>{c.approval_rate === null ? "Insufficient data" : `${c.approval_rate}%`}</span><span><strong>Completed assignments</strong>{c.completed_assignments}</span><span><strong>Verified experience</strong>{c.verified_experiences}</span></div>
                  <p className={styles.helper}><strong>Recruitment source:</strong> {c.source_kind ? human(c.source_kind) : "No accepted application/invitation or selected shortlist yet"}</p>
                  <div className={styles.cardActions}><span className={styles.nextStep}>{c.source_kind ? "Eligible for formal offer under existing rules" : "Complete the recruitment lifecycle before assignment"}</span><Button variant="primary" type="button" disabled={busy || !c.source_kind} onClick={() => void openCandidateOffer(c)}>Offer assignment</Button></div>
                </article>;
              })}
            </div>
            {!candidates.length && !busy && <WorkforceEmpty icon={<UsersRound size={22} />} title="Search the Field Worker network" copy="Choose an active project and search by name, skill or language. Discovery does not grant permanent access to a worker's full private profile." />}
            {offer && chosenProject && <AssignmentOfferForm offer={offer} project={chosenProject} compensation={offerCompensation} busy={busy} onCancel={() => setOffer(null)} onSubmit={offerAssignment} />}
          </>}


          {organizationView === "assignments" && <>
            <div className={styles.sectionHeader}><div><span className="fl-eyebrow">DELIVERY TEAM</span><h3>{mode === "poem" ? "Assignment oversight" : "Project assignments"}</h3><p>Formal offers become active only after Field Worker acceptance. Completion creates verified FieldLance work history under the existing assignment workflow.</p></div><span className={styles.count}>{assignments.length} loaded</span></div>
            <div className={styles.list}>
              {assignments.map((a) => <AssignmentCard key={a.id} assignment={a} project={projectMap.get(a.survey_project_id)} orgName={orgMap.get(a.organization_id)} mode={mode} busy={busy} act={act} focused={focusKind==="assignment"&&focusId===a.id} onFocus={()=>onFocusChange?.("assignment",a.id)} />)}
            </div>
            <RecruitmentPages list={assignmentList}/>
            {!assignments.length && !busy && !assignmentList.busy && !assignmentList.error && <WorkforceEmpty icon={<CheckCircle2 size={22} />} title="No assignments yet" copy="Select an applicant or eligible recruited Field Worker, send a formal offer, and the assignment will appear here." />}
          </>}


          {opportunities.length > 0 && <p className={styles.footnote}>{opportunities.length} linked project opportunit{opportunities.length === 1 ? "y" : "ies"}. Closing recruitment blocks only new applications; existing applications remain reviewable.</p>}
        </div>
      )}
    </section>
  );

  function reviewApplication(application: Application, status: "shortlisted" | "selected" | "rejected") {
    const note = window.prompt(`Review note for ${human(status)}:`, status === "selected" ? "Selected for a formal assignment offer." : "Reviewed by project recruitment administrator.");
    if (note) void act(() => rpc("review_work_application", { p_id: application.id, p_status: status, p_note: note, p_version: application.version }), `Application marked ${human(status)}.`);
  }
}

function WorkforceMetric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: number; detail: string }) {
  return <article className={styles.summaryCard}><div className={styles.summaryIcon}>{icon}</div><div><strong>{value}</strong><span>{label}</span><small>{detail}</small></div></article>;
}

function WorkforceMeta({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className={styles.meta}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}

function WorkforceEmpty({ icon, title, copy, action }: { icon: ReactNode; title: string; copy: string; action?: ReactNode }) {
  return <div className={styles.empty}><div className={styles.emptyIcon}>{icon}</div><h4>{title}</h4><p>{copy}</p>{action}</div>;
}

function WorkerJourney({stage}:{stage:ReturnType<typeof recruitmentStage>}) {
  const steps=["Discover","Apply","Selection",stage.index===3?stage.label:"Assigned"];
  return <div className={styles.journey} aria-label="Field Worker recruitment lifecycle">{steps.map((label,index)=><div key={index} className={styles.journeyStep} data-active={index<=stage.index} aria-current={index===stage.index?'step':undefined}><span className={styles.journeyMarker}>{index<stage.index?'✓':index+1}</span><div><strong>{label}</strong><small>{index===stage.index?stage.detail:''}</small></div>{index<3&&<ArrowRight size={15}/>}</div>)}</div>;
}

function RecruitmentProgress({ status, organization = false }: { status: string; organization?: boolean }) {
  const activeThrough = ["offered","active","completed"].includes(status) ? 3 : status === "shortlisted" ? 1 : status === "selected" ? 2 : 0;
  const labels = organization ? ["Applied", "Shortlisted", "Selected", "Offer"] : ["Applied", "Shortlisted", "Selected", "Offer / assignment"];
  return <div className={styles.progress} data-stopped={status === "rejected" || status === "withdrawn"}>{labels.map((label, index) => <span key={label} className={styles.progressStep} data-active={index <= activeThrough}><i className={styles.progressMarker}>{index < activeThrough ? "✓" : index + 1}</i>{label}</span>)}</div>;
}

function OrganizationApplicationDetail({
  application,
  linked,
  mode,
  organizationName,
  busy,
  linksBusy,
  linksError,
  onOpenApplication,
  onOpenAssignment,
  onReview,
  onOffer,
}: {
  application: Application;
  linked?: ApplicationAssignment;
  mode: Mode;
  organizationName: string;
  busy: boolean;
  linksBusy: boolean;
  linksError: string;
  onOpenApplication: () => void;
  onOpenAssignment: (assignmentId: string) => void;
  onReview: (status: "shortlisted" | "selected" | "rejected") => void;
  onOffer: () => void;
}) {
  const snapshot = (application.profile_snapshot || {}) as Record<string, unknown>;
  const skills = readableSnapshot(snapshot.skills);
  const languages = readableSnapshot(snapshot.languages);
  const displayStatus = applicationDisplayStatus(application.status, linked);
  return <>
    <div className={styles.cardHeader}>
      <div className={styles.identity}>
        <div className={styles.summaryIcon}>{initials(application.volunteer_name)}</div>
        <div className={styles.titleBlock}>
          <span>{application.opportunity_title}</span>
          <h4>{application.volunteer_name}</h4>
          <small>{application.project_title}{mode === "poem" ? ` · ${organizationName}` : ""}</small>
        </div>
      </div>
      <StatusBadge tone={statusTone(linked?.status || application.status)}>{displayStatus}</StatusBadge>
    </div>
    <RecruitmentProgress status={linked?.status || application.status} organization />
    <div className={styles.candidateFacts}>
      <span><strong>Skills</strong>{skills || "Not listed"}</span>
      <span><strong>Languages</strong>{languages || "Not listed"}</span>
      <span><strong>Availability</strong>{application.availability || "Not recorded"}</span>
    </div>
    {application.note && <p className={styles.helper}><strong>Applicant message:</strong> {application.note}</p>}
    {application.review_note && <p className={styles.helper}><strong>Review note:</strong> {application.review_note}</p>}
    {application.profile_share_consent && <ApplicantSnapshot snapshot={snapshot} />}
    <div className={styles.actionGroup}><Button variant="tertiary" type="button" onClick={onOpenApplication}>Open application link</Button></div>
    {linked&&<Alert tone={linked.status === "active" || linked.status === "completed" ? "success" : "info"} title={displayStatus} action={<Button variant="secondary" type="button" onClick={()=>onOpenAssignment(linked.id)}>Open {linked.status === "offered" ? "offer" : "assignment"}</Button>}>Application state and assignment state remain separate; the linked formal offer/assignment is authoritative for field activation.</Alert>}
    {!linked && !linksBusy && !linksError && ["pending", "shortlisted", "selected"].includes(application.status) && <div className={styles.cardActions}>
      <span className={styles.nextStep}>{applicationNextStep(application.status, true)}</span>
      <div className={styles.actionGroup}>
        {application.status !== "shortlisted" && application.status !== "selected" && <Button variant="secondary" type="button" disabled={busy} onClick={() => onReview("shortlisted")}>Shortlist</Button>}
        {application.status !== "selected" && <Button variant="primary" type="button" disabled={busy} onClick={() => onReview("selected")}>Select</Button>}
        <Button variant="danger" type="button" disabled={busy} onClick={() => onReview("rejected")}>Reject</Button>
        {application.status === "selected" && <Button variant="primary" type="button" disabled={busy} onClick={onOffer}>Send formal offer</Button>}
      </div>
    </div>}
    {linksBusy && <p className={styles.helper} role="status">Checking linked assignment state…</p>}
  </>;
}

function ApplicantSnapshot({ snapshot }: { snapshot: Record<string, unknown> }) {
  const candidates: Array<[string, string]> = [
    ["full_name", "Full name"],
    ["phone", "Phone"],
    ["area", "Area"],
    ["education", "Education"],
    ["skills", "Skills"],
    ["languages", "Languages"],
    ["experience", "Experience"],
    ["availability", "Availability"],
    ["preference", "Work preference"],
    ["transport", "Transport"],
    ["smartphone", "Smartphone"],
    ["preferred_areas", "Preferred areas"],
    ["bio", "Bio"],
    ["geography_id", "Geography ID"],
    ["profile_publication_status", "Publication status"],
    ["profile_version", "Profile version"],
    ["poem_verified_work", "Verified work record"],
    ["poem_verified_work_count", "Verified FieldLance work"],
  ];
  const rows = candidates.map(([key,label]) => [key, label, snapshotValue(snapshot[key])] as const).filter(([, ,value]) => value);
  return <section className={styles.snapshot} aria-label="Application-time recruitment snapshot">
    <div><h4>Recruitment snapshot</h4><p className={styles.helper}>This is the immutable application-time snapshot shared for recruitment, not the worker&apos;s live profile.</p></div>
    {rows.length > 0 && <dl className={styles.snapshotGrid}>{rows.map(([key,label,value]) => <div className={styles.snapshotItem} key={key}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
    <details className={styles.technicalSnapshot}><summary>Technical snapshot</summary><pre>{JSON.stringify(snapshot, null, 2)}</pre></details>
  </section>;
}

function AssignmentOfferForm({ offer, project, compensation, busy, onCancel, onSubmit }: { offer: Candidate; project: Project; compensation: string; busy: boolean; onCancel: () => void; onSubmit: (e: FormEvent<HTMLFormElement>) => void }) {
  const [target,setTarget]=useState("");
  const [start,setStart]=useState(project.start_date);
  const [end,setEnd]=useState(project.end_date);
  const [conflict,setConflict]=useState<ConflictPreview|null>(null);
  const [checking,setChecking]=useState(false);
  const [checkError,setCheckError]=useState("");
  useEffect(()=>{
    const targetValue=Number(target);
    if(!start||!end||!Number.isFinite(targetValue)||targetValue<1){setConflict(null);setCheckError("");return;}
    let live=true;
    const timer=window.setTimeout(()=>{
      setChecking(true);setCheckError("");
      void rpc("check_work_assignment_conflicts",{p_project:project.id,p_user:offer.user_id,p_start:start,p_end:end,p_target_surveys:targetValue})
        .then((result)=>{if(live)setConflict(result as unknown as ConflictPreview)})
        .catch((error)=>{if(live){setConflict(null);setCheckError((error as Error).message)}})
        .finally(()=>{if(live)setChecking(false)});
    },250);
    return()=>{live=false;window.clearTimeout(timer)};
  },[offer.user_id,project.id,start,end,target]);
  const hardConflict=conflict?.status==="hard_conflict";
  return <form onSubmit={onSubmit} className={styles.offerForm}>
    <div className={styles.sectionHeader}><div><span className="fl-eyebrow">FORMAL ASSIGNMENT OFFER</span><h3>Assignment terms for {offer.details.full_name || offer.user_id}</h3><p>{project.title}. Sending this offer does not activate field work; the Field Worker must accept it under the existing assignment rules.</p></div></div>
    <Alert tone="info" title="Agreed compensation">{compensation}. This compensation source is inherited from the existing recruitment snapshot/project default and remains immutable when offered.</Alert>
    <div className="form-grid"><label className="field">Survey target<input name="target" type="number" min={1} max={1000000} value={target} onChange={(e)=>setTarget(e.target.value)} required /></label><label className="field">Starts<input name="start" type="date" value={start} onChange={(e)=>setStart(e.target.value)} required /></label><label className="field">Ends<input name="end" type="date" value={end} onChange={(e)=>setEnd(e.target.value)} required /></label></div>
    <section className={styles.capacityCheck} data-status={conflict?.status || "pending"} aria-live="polite">
      <div className={styles.capacityHeading}><div><span className="fl-eyebrow">ASSIGNMENT SAFETY</span><strong>{checking?"Checking worker schedule…":conflict?.headline || "Enter a target and dates to check availability"}</strong></div>{conflict&&<StatusBadge tone={statusTone(conflict.status)}>{human(conflict.status)}</StatusBadge>}</div>
      {conflict&&<><div className={styles.capacityFacts}><span><small>Overlapping commitments</small><strong>{conflict.overlapping_commitments}</strong></span><span><small>Proposed capacity</small><strong>{conflict.capacity_pct}%</strong></span><span><small>Parallel project limit</small><strong>{conflict.max_active_projects}</strong></span><span><small>Available days</small><strong>{conflict.estimated_available_days===null?"Not configured":conflict.estimated_available_days}</strong></span></div>{conflict.reasons.length>0&&<ul>{conflict.reasons.map((reason,index)=><li key={`${index}-${reason}`}>{reason}</li>)}</ul>}<p>Privacy: FieldLance does not reveal the names or details of this worker&apos;s other organization commitments.</p></>}
      {checkError&&<Alert tone="danger" title="Schedule check failed">{checkError}</Alert>}
    </section>
    <label className="field">Terms / deliverables<textarea name="terms" minLength={5} maxLength={3000} required defaultValue="Complete assigned field surveys according to FieldLance data-quality, consent and project rules." /></label>
    <div className={styles.actionGroup}><Button type="button" variant="tertiary" onClick={onCancel}>Cancel</Button><Button variant="primary" disabled={busy||checking||hardConflict}>{hardConflict?"Resolve schedule conflict":"Send formal offer"}</Button></div>
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
  return <article tabIndex={-1} id={`workforce-assignment-${a.id}`} className={styles.assignmentCard} data-route-focus={focused || undefined}>
    <div className={styles.assignmentHeader}><div><span>{a.organization_name || orgName || a.organization_id}</span><h4>{a.project_title || project?.title || a.survey_project_id}</h4>{a.opportunity_title && <small>{a.opportunity_title}</small>}</div><StatusBadge tone={statusTone(a.status)}>{human(a.status)}</StatusBadge></div>
    <div className={`${styles.metaGrid} ${styles.metaGridThree}`}><WorkforceMeta icon={<CalendarDays size={15} />} label="Assignment dates" value={`${shortDate(a.start_date)} – ${shortDate(a.end_date)}`} /><WorkforceMeta icon={<FileCheck2 size={15} />} label="Survey target" value={`${a.target_surveys} surveys`} /><WorkforceMeta icon={<CircleDollarSign size={15} />} label="Compensation" value={money(a)} /></div>
    <p className={styles.helper}><strong>Field Worker:</strong> {a.volunteer_name}</p>
    <p className={styles.helper}><strong>Terms:</strong> {a.terms_note}</p>
    <p className={styles.helper}><strong>Compensation source:</strong> {human(a.compensation_source)}{a.compensation_source_version ? ` v${a.compensation_source_version}` : ""}{a.compensation_note_snapshot ? ` · ${a.compensation_note_snapshot}` : ""}</p>
    {a.completion_note && <Alert tone="success" title="Completion">{a.completion_note}</Alert>}
    {a.cancellation_note && <Alert tone="neutral" title="Cancellation">{a.cancellation_note}</Alert>}
    <div className={styles.cardActions}><span className={styles.nextStep}>{assignmentNextStep(a.status)}</span><div className={styles.actionGroup}><Button variant="tertiary" type="button" onClick={onFocus}>Open assignment link</Button>
      {(mode === "ngo" || mode === "project") && a.status === "active" && <><Button variant="primary" type="button" disabled={busy} onClick={() => setComplete((v) => !v)}>Complete assignment</Button><Button variant="danger" type="button" disabled={busy} onClick={() => { const note=window.prompt("Cancellation reason:","Assignment cancelled by project administrator."); if(note) void act(() => rpc("cancel_work_assignment",{p_id:a.id,p_note:note,p_version:a.version}),"Assignment cancelled and survey access revoked."); }}>Cancel assignment</Button></>}
      {mode !== "personal" && a.status === "offered" && <Button variant="secondary" type="button" disabled={busy} onClick={() => { const note=window.prompt("Cancellation reason:","Assignment offer withdrawn by project administrator."); if(note) void act(() => rpc("cancel_work_assignment",{p_id:a.id,p_note:note,p_version:a.version}),"Assignment offer cancelled."); }}>Withdraw offer</Button>}
    </div></div>
    {complete && (mode === "ngo" || mode === "project") && <form className={styles.completionForm} onSubmit={(e) => {
      e.preventDefault();const f=new FormData(e.currentTarget);
      const feedback: Json={professionalism:Number(val(f,"professionalism")),communication:Number(val(f,"communication")),field_discipline:Number(val(f,"discipline")),data_quality:Number(val(f,"quality")),task_completion:Number(val(f,"completion"))};
      void act(() => rpc("complete_work_assignment",{p_id:a.id,p_feedback:feedback,p_note:val(f,"note"),p_version:a.version}),"Assignment completed and added to verified FieldLance work history.");
    }}><h4>Structured completion feedback</h4><div className="form-grid">{[["professionalism","Professionalism"],["communication","Communication"],["discipline","Field discipline"],["quality","Data quality"],["completion","Task completion"]].map(([name,label]) => <label className="field" key={name}>{label}<select name={name} defaultValue="5">{[1,2,3,4,5].map((n)=><option key={n} value={n}>{n} / 5</option>)}</select></label>)}</div><label className="field">Completion note<textarea name="note" minLength={5} maxLength={3000} required /></label><Button variant="primary" disabled={busy}>Confirm completion</Button></form>}
  </article>;
}

function snapshotValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" || typeof item === "number" ? String(item) : "").filter(Boolean).join(", ");
  return "";
}

function statusTone(status: string): SemanticTone {
  if (["active","completed","accepted","selected","clear"].includes(status)) return "success";
  if (["pending","shortlisted","offered","warning"].includes(status)) return "warning";
  if (["rejected","hard_conflict"].includes(status)) return "danger";
  if (["declined","withdrawn","cancelled","canceled","closed","inactive"].includes(status)) return "neutral";
  return "info";
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

function RecruitmentPages({list}:{list:{busy:boolean;more:boolean;error:string;loadMore:()=>Promise<void>;retry:()=>Promise<void>}}){return <div className={styles.pagination} aria-label="Recruitment pagination">{list.busy&&<span role="status">Loading recruitment page…</span>}{list.error&&<span role="alert">{list.error}</span>}{list.error?<Button variant="secondary" type="button" disabled={list.busy} onClick={()=>void list.retry()}>Retry recruitment page</Button>:list.more&&<Button variant="secondary" type="button" disabled={list.busy} onClick={()=>void list.loadMore()}>Load 50 more</Button>}</div>}
