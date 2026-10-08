import type { FieldMapViewStore } from "../maps/fieldMapViewState";
import type {ReportSelection} from "../analytics/model";
import type {RouteEntityKind} from "../../app/routes";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ProjectTeamWorkspace } from "./ProjectTeamWorkspace";
import { ProjectOverview } from "./ProjectOverview";
import { ProjectDocuments } from "./ProjectDocuments";
import { ProjectActivity } from "./ProjectActivity";
import { Button, MobileSectionPicker, SectionNav } from "../../components/ui/FieldLanceUI";
const WorkforceMarketplace = lazy(() => import("../workforce/WorkforceMarketplace").then(m => ({default: m.WorkforceMarketplace})));
const ProjectFundingWorkspace = lazy(() => import("../finance/ProjectFundingWorkspace").then(m => ({default: m.ProjectFundingWorkspace})));
const SurveyProjects = lazy(() => import("../surveys/SurveyProjects").then(m => ({default: m.SurveyProjects})));
const ProjectGovernance = lazy(() => import("../governance/ProjectGovernance").then(m => ({default: m.ProjectGovernance})));
import { db } from "../../lib/supabase/client";
import type { Geo } from "../geography/model";

const ReportsWorkspace = lazy(()=>import("../analytics/ReportsWorkspace").then(m=>({default:m.ReportsWorkspace})));
const AttendanceWorkspace = lazy(()=>import("../workforce/AttendanceWorkspace").then(m=>({default:m.AttendanceWorkspace})));
const FieldOperationsMap = lazy(()=>import("../maps/FieldOperationsMap").then(m=>({default:m.FieldOperationsMap})));
const BeneficiaryCasesWorkspace = lazy(() =>
  import("../cases/BeneficiaryCasesWorkspace").then((module) => ({ default: module.BeneficiaryCasesWorkspace })),
);

import { protectProjectNavigation } from "./projectNavigation";

type Org = { id: string; name: string; status: string; logo_path?: string | null; logo_updated_at?: string | null };
export type ProjectWorkspaceTab = "reports" | "overview" | "team" | "recruitment" | "field-work" | "map" | "responses" | "cases" | "finance" | "governance" | "documents" | "activity";
type Tab = ProjectWorkspaceTab;
type TabItem = { id: Tab; label: string; hint: string };

const allTabs: TabItem[] = [
  {id:"reports",label:"Reports",hint:"Filtered totals, trends and operational records"},
  { id: "overview", label: "Overview", hint: "Project health, targets, delivery signals, and next actions" },
  { id: "team", label: "Team", hint: "Project staff, roles, area scope, and operating plans" },
  { id: "recruitment", label: "Recruitment", hint: "Opportunities, applications, offers, invitations, and assignments" },
  { id: "field-work", label: "Field Work", hint: "Assignments, collection controls, and active field operations" },
  { id: "map", label: "Map", hint: "Explicit field evidence, assigned geography, GPS quality, and review signals" },
  { id: "responses", label: "Responses", hint: "Submitted responses, review queues, and registry outcomes" },
  { id: "cases", label: "Cases", hint: "Beneficiary cases, assistance requests, delivery, and follow-up" },
  { id: "finance", label: "Finance", hint: "Funding coverage, commitments, payables, and closure readiness" },
  { id: "governance", label: "Governance", hint: "Project policy versions and collection controls" },
  { id: "documents", label: "Documents", hint: "Project-scoped evidence, instructions, reports, and working files" },
  { id: "activity", label: "Activity", hint: "Project-scoped management audit trail" },
 ];

const projectTabGroups: readonly { label: string; ids: readonly Tab[] }[] = [
  { label: "Overview", ids: ["overview", "reports"] },
  { label: "Delivery", ids: ["team", "recruitment", "field-work", "map", "responses"] },
  { label: "Impact", ids: ["cases"] },
  { label: "Administration", ids: ["finance", "governance", "documents", "activity"] },
];

export function ProjectWorkspace({
  userId,
  projectId,
  organization,
  geographies,
  orgs,
  canManageTeam,
  canManageRecruitment,
  canManageProject,
  canManageFinance,
  canManageCases,
  platformFinance,
  surveyManage,
  onNavigate,
  onOpenDelegatedCase,
  mapViewStore,
  mapViewKey,
  routeTab = null,
  routeEntityKind = null,
  routeEntityId = null,
  onRouteChange,
}: {
  userId: string;
  projectId: string;
  organization: string | null;
  geographies: Geo[];
  orgs: Org[];
  canManageTeam: boolean;
  canManageRecruitment: boolean;
  canManageProject: boolean;
  canManageFinance: boolean;
  canManageCases: boolean;
  platformFinance: boolean;
  surveyManage: boolean;
  onNavigate: (page: string) => void;
  onOpenDelegatedCase?: (caseId: string) => void;
  mapViewStore?: FieldMapViewStore;
  mapViewKey?: string;
  routeTab?: ProjectWorkspaceTab | null;
  routeEntityKind?: RouteEntityKind;
  routeEntityId?: string | null;
  onRouteChange?: (tab: ProjectWorkspaceTab, entityKind?: RouteEntityKind, entityId?: string | null) => void;
}) {
  const [reportSelection,setReportSelection]=useState<ReportSelection|null>(null);
  const [tab, setTab] = useState<Tab>(routeTab && allTabs.some(item=>item.id===routeTab) ? routeTab : "overview");
  const [navigationError, setNavigationError] = useState("");
  const [navigating, setNavigating] = useState(false);
  const navigationBusy = useRef(false);
  async function navigate(commit: () => void) {
    if (navigationBusy.current) return;
    navigationBusy.current = true;
    setNavigating(true);
    setNavigationError("");
    try { await protectProjectNavigation(commit); }
    catch (error) { setNavigationError("Could not protect device draft: " + (error as Error).message); }
    finally { navigationBusy.current = false; setNavigating(false); }
  }
  function openTab(next: Tab) {
    if (next !== tab && tabs.some(item => item.id === next)) void navigate(() => {setTab(next);onRouteChange?.(next,null,null);});
    else if(next===tab) onRouteChange?.(next,null,null);
  }
  const [projectTitle, setProjectTitle] = useState("Project workspace");

  const tabs = useMemo(() => allTabs.filter((item) => {
    if (item.id === "recruitment") return canManageRecruitment;
    if (item.id === "cases") return canManageCases;
    if (item.id === "finance") return canManageFinance;
    if (item.id === "activity") return canManageProject;
    return true;
  }), [canManageRecruitment, canManageCases, canManageFinance, canManageProject]);

  useEffect(() => {
    if (!tabs.some((item) => item.id === tab)) {setTab("overview");onRouteChange?.("overview",null,null);}
  }, [tabs, tab]);

  useEffect(()=>{
    if(!routeTab || routeTab===tab || !tabs.some(item=>item.id===routeTab))return;
    setTab(routeTab);
  },[routeTab,tabs,tab]);

  useEffect(() => {
    let live = true;
    void db!.from("survey_projects").select("title").eq("id", projectId).maybeSingle().then(({ data }) => {
      if (live && data?.title) setProjectTitle(data.title);
    });
    return () => { live = false; };
  }, [projectId]);

  const current = tabs.find((item) => item.id === tab) || tabs[0];
  const groupedTabs = projectTabGroups.map(group => ({
    label: group.label,
    items: group.ids.map(id => tabs.find(item => item.id === id)).filter((item): item is TabItem => Boolean(item)).map(item => ({ id: item.id, label: item.label, disabled: navigating })),
  })).filter(group => group.items.length > 0);
  const projectOrg = organization;

  return <section className="panel detail project-workspace" aria-label="Project workspace">
    <div className="project-workspace-entity-bar">
      <div className="project-workspace-entity-copy">
        <span>Project</span><strong>{projectTitle}</strong>
      </div>
      <Button variant="secondary" disabled={navigating} onClick={() => void navigate(() => onNavigate("Survey projects"))}>Back to projects</Button>
    </div>

    <div className="project-workspace-navigation">
      <SectionNav groups={groupedTabs} activeId={tab} onChange={openTab} label="Project workspace sections" className="project-workspace-grouped-nav" />
    </div>
    <div className="project-workspace-mobile-navigation">
      <MobileSectionPicker groups={groupedTabs.map(group => ({label:group.label,items:group.items.map(item => ({id:item.id,label:String(item.label),disabled:item.disabled}))}))} activeId={tab} onChange={openTab} label="Project section" disabled={navigating} />
    </div>
    <p className="project-workspace-tab-hint">{current?.hint}</p>

    {navigationError && <p className="notice error" role="alert">{navigationError}</p>}
    <Suspense fallback={<p role="status">Loading project section…</p>}>
    {tab === "reports" && <ReportsWorkspace key={`${projectId}-${reportSelection?.kind}-${reportSelection?.status}`} organization={projectOrg} projectId={projectId} geographies={geographies} initial={reportSelection}/>}
    {tab === "overview" && <ProjectOverview
      projectId={projectId}
      geographies={geographies}
      canManageProject={canManageProject}
      canManageFinance={canManageFinance}
      onOpenTab={openTab}
      onReport={selection=>{setReportSelection(selection);openTab("reports")}}
    />}

    {tab === "team" && <ProjectTeamWorkspace
      userId={userId}
      organization={projectOrg}
      projectId={projectId}
      geographies={geographies}
      canManageTeam={canManageTeam}
      openOperations={() => openTab("responses")}
      openNotifications={() => void navigate(() => onNavigate("Notifications"))}
    />}

    {tab === "recruitment" && canManageRecruitment && <section className="project-workspace-section">
      <div className="project-workspace-subnav">
        <strong>Recruitment pipeline</strong>
        <span>Opportunities · Applications · Shortlisted · Offers · Direct Invitations · Assignments</span>
      </div>
      <WorkforceMarketplace userId={userId} organization={projectOrg} mode="project" projectScopeId={projectId} personalView="all" geographies={geographies} orgs={orgs} focusKind={routeEntityKind === "application" || routeEntityKind === "assignment" ? routeEntityKind : null} focusId={routeEntityKind==="opportunity"?null:routeEntityId} initialOpportunityId={routeEntityKind==="opportunity"?routeEntityId:null} onOpportunityChange={id=>onRouteChange?.("recruitment",id?"opportunity":null,id)} onFocusChange={(kind,id)=>onRouteChange?.("recruitment",kind,id)} />
    </section>}

    {tab === "field-work" && <section className="project-workspace-section">
      <AttendanceWorkspace userId={userId} projectId={projectId} canManage={canManageProject} view="attendance" initialAssignmentId={routeEntityKind === "assignment" ? routeEntityId : null} />
      <SurveyProjects
        userId={userId}
        organization={null}
        projectId={projectId}
        manage={surveyManage}
        review={true}
        manageAssignments={canManageRecruitment}
        orgs={orgs as any}
        geographies={geographies}
        workspaceMode="field-work"
        openRecruitment={canManageRecruitment ? () => openTab("recruitment") : undefined}
        onBackToWorkspace={() => openTab("overview")}
      />
    </section>}

    {tab === "map" && <FieldOperationsMap key={mapViewKey || projectId} viewStateStore={mapViewStore} viewStateKey={mapViewKey || projectId} projectId={projectId} geographies={geographies} onOpenSource={(row) => {
      if (!row.source_context_id) return;
      if (row.source_kind === "response") void navigate(() => { setTab("responses"); onRouteChange?.("responses","response",row.source_context_id); });
      else if (row.source_kind === "attendance") void navigate(() => { setTab("field-work"); onRouteChange?.("field-work","assignment",row.source_context_id); });
      else if (row.source_kind === "case" && canManageCases) void navigate(() => { setTab("cases"); onRouteChange?.("cases","case",row.source_context_id); });
      else if (row.source_kind === "case") void navigate(() => onOpenDelegatedCase?.(row.source_context_id));
    }} />}

    {tab === "responses" && <SurveyProjects
      userId={userId}
      organization={null}
      projectId={projectId}
      manage={surveyManage}
      review={true}
      manageAssignments={canManageRecruitment}
      orgs={orgs as any}
      geographies={geographies}
      workspaceMode="responses"
      initialResponseId={routeEntityKind === "response" ? routeEntityId : null}
      openRecruitment={canManageRecruitment ? () => openTab("recruitment") : undefined}
      onBackToWorkspace={() => openTab("overview")}
    />}

    {tab === "cases" && canManageCases && <Suspense fallback={<p role="status">Loading beneficiary cases…</p>}>
      <BeneficiaryCasesWorkspace key={`project-cases-${projectId}`} organization={null} projectId={projectId} initialCaseId={routeEntityKind === "case" ? routeEntityId : null} onSelectedCaseChange={(caseId)=>onRouteChange?.("cases",caseId?"case":null,caseId)} />
    </Suspense>}

    {tab === "finance" && canManageFinance && <ProjectFundingWorkspace userId={userId} organization={projectOrg} platform={platformFinance} orgs={orgs as any} projectId={projectId} />}
    {tab === "governance" && <ProjectGovernance manage={surveyManage} organization={projectOrg} projectId={projectId} />}
    {tab === "documents" && <ProjectDocuments projectId={projectId} canManage={canManageProject} />}
    {tab === "activity" && canManageProject && <ProjectActivity projectId={projectId} />}
    </Suspense>
  </section>;
}
