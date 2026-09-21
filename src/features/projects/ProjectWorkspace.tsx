import { useEffect, useState } from "react";
import { ProjectTeamWorkspace } from "./ProjectTeamWorkspace";
import { WorkforceMarketplace } from "../workforce/WorkforceMarketplace";
import { ProjectFundingWorkspace } from "../finance/ProjectFundingWorkspace";
import { SurveyProjects } from "../surveys/SurveyProjects";
import { ProjectGovernance } from "../governance/ProjectGovernance";
import { db } from "../../lib/supabase/client";
import type { Geo } from "../geography/model";

type Org = { id: string; name: string; status: string; logo_path?: string | null; logo_updated_at?: string | null };
type Tab = "overview" | "team" | "recruitment" | "field-work" | "responses" | "finance" | "governance" | "documents" | "activity";

const tabs: Array<{ id: Tab; label: string; hint: string }> = [
  { id: "overview", label: "Overview", hint: "Project health and delivery progress" },
  { id: "team", label: "Team", hint: "Project staff, roles, and access" },
  { id: "recruitment", label: "Recruitment", hint: "Opportunities, applications, and offers" },
  { id: "field-work", label: "Field Work", hint: "Assignments and collection operations" },
  { id: "responses", label: "Responses", hint: "Review and response queues" },
  { id: "finance", label: "Finance", hint: "Funding, payables, and closure" },
  { id: "governance", label: "Governance", hint: "Policy and collection controls" },
  { id: "documents", label: "Documents", hint: "Project evidence and working files" },
  { id: "activity", label: "Activity", hint: "Project audit trail" },
];

export function ProjectWorkspace({
  userId,
  projectId,
  organization,
  geographies,
  orgs,
  canManageTeam,
  canManageRecruitment,
  surveyManage,
  onNavigate,
}: {
  userId: string;
  projectId: string;
  organization: string | null;
  geographies: Geo[];
  orgs: Org[];
  canManageTeam: boolean;
  canManageRecruitment: boolean;
  surveyManage: boolean;
  onNavigate: (page: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [projectTitle, setProjectTitle] = useState("Project workspace");

  useEffect(() => {
    let live = true;
    void db!.from("survey_projects").select("title").eq("id", projectId).maybeSingle().then(({ data }) => {
      if (live && data?.title) setProjectTitle(data.title);
    });
    return () => { live = false; };
  }, [projectId]);

  const current = tabs.find((item) => item.id === tab) || tabs[0];
  const projectOrg = organization;
  const team = <ProjectTeamWorkspace userId={userId} organization={projectOrg} projectId={projectId} geographies={geographies} canManageTeam={canManageTeam} openOperations={() => setTab("responses")} openNotifications={() => onNavigate("Notifications")} />;

  return <section className="panel detail project-workspace" aria-label="Project workspace">
    <header className="project-workspace-header">
      <div>
        <span className="eyebrow">PROJECT WORKSPACE</span>
        <h1>{projectTitle}</h1>
        <p>One project-scoped home for delivery, recruitment, field work, finance, governance, and audit.</p>
      </div>
      <button type="button" className="secondary" onClick={() => onNavigate("Survey projects")}>Back to projects</button>
    </header>
    <nav className="project-workspace-tabs" aria-label="Project workspace sections">
      {tabs.map((item) => <button key={item.id} type="button" className={item.id === tab ? "tab active" : "tab"} aria-current={item.id === tab ? "page" : undefined} onClick={() => setTab(item.id)}>{item.label}</button>)}
    </nav>
    <p className="project-workspace-tab-hint">{current.hint}</p>
    {tab === "overview" && team}
    {tab === "team" && team}
    {tab === "recruitment" && <section className="project-workspace-section"><div className="project-workspace-subnav"><strong>Recruitment pipeline</strong><span>Opportunities · Applications · Shortlisted · Offers · Direct Invitations · Assignments</span></div><WorkforceMarketplace userId={userId} organization={projectOrg} mode="project" projectScopeId={projectId} personalView="all" geographies={geographies} orgs={orgs} /></section>}
    {tab === "field-work" && <SurveyProjects userId={userId} organization={null} projectId={projectId} manage={surveyManage} review={true} manageAssignments={canManageRecruitment} orgs={orgs as any} geographies={geographies} openRecruitment={() => setTab("recruitment")} onBackToWorkspace={() => setTab("overview")} />}
    {tab === "responses" && <SurveyProjects userId={userId} organization={null} projectId={projectId} manage={surveyManage} review={true} manageAssignments={canManageRecruitment} orgs={orgs as any} geographies={geographies} openRecruitment={() => setTab("recruitment")} onBackToWorkspace={() => setTab("overview")} />}
    {tab === "finance" && <ProjectFundingWorkspace organization={projectOrg} platform={false} orgs={orgs as any} />}
    {tab === "governance" && <ProjectGovernance manage={surveyManage} organization={projectOrg} />}
    {tab === "documents" && <section className="panel detail project-workspace-placeholder"><h2>Project documents</h2><p>Project-scoped evidence and working files will appear here. Access remains restricted to this project’s authorized members.</p><p className="notice">Use the project workspace tabs to keep documents tied to the same project context as recruitment, responses, and finance.</p></section>}
    {tab === "activity" && <section className="panel detail project-workspace-placeholder"><h2>Project activity</h2><p>Project-scoped audit events are retained by the existing audit service and will be shown here as the activity feed is consolidated.</p><button type="button" className="secondary" onClick={() => onNavigate("Activity")}>Open full activity log</button></section>}
  </section>;
}
