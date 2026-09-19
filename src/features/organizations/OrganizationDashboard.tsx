import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  FileCheck2,
  HeartHandshake,
  RefreshCw,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";
import { db } from "../../lib/supabase/client";
import type { Database } from "../../lib/supabase/database.types";
import { Badge, human } from "../../shared/ui/FormFields";
import { OrganizationLogoImage } from "./OrganizationLogo";

type Tables = Database["public"]["Tables"];
type Organization = Tables["organizations"]["Row"];
type Project = Tables["survey_projects"]["Row"];
type Opportunity = Tables["work_opportunities"]["Row"];
type Application = Tables["work_applications"]["Row"];
type Assignment = Tables["work_assignments"]["Row"];
type CaseRow = Tables["beneficiary_cases"]["Row"];
type Response = Tables["survey_responses"]["Row"];
type Assistance = Tables["assistance_entries"]["Row"];
type Payable = Tables["work_payable_units"]["Row"];

type OrganizationDashboardProps = {
  organization: Organization;
  unread: number;
  onNavigate: (page: string) => void;
};

const dateLabel = (value: string | null | undefined) => {
  if (!value) return "—";
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  return new Intl.DateTimeFormat("en-PK", { day: "numeric", month: "short", year: "numeric" }).format(new Date(normalized));
};

function Metric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string | number; detail: string }) {
  return (
    <article className="organization-metric">
      <span className="organization-metric-icon">{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </article>
  );
}

function CompactState({ value }: { value: string }) {
  const tone = ["active", "completed", "approved", "recorded", "published"].includes(value)
    ? "success"
    : ["pending", "submitted", "shortlisted", "selected", "offered"].includes(value)
      ? "warning"
      : "neutral";
  return <span className={`organization-state ${tone}`}>{human(value)}</span>;
}

export function OrganizationDashboard({ organization, unread, onNavigate }: OrganizationDashboardProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [assistance, setAssistance] = useState<Assistance[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [programCount, setProgramCount] = useState(0);
  const [areaCount, setAreaCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");

    const loadBase = async () => {
      const results = await Promise.allSettled([
        db!.from("survey_projects").select("*").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(100),
        db!.from("work_opportunities").select("*").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(150),
        db!.from("work_applications").select("*").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(250),
        db!.from("work_assignments").select("*").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(250),
        db!.from("beneficiary_cases").select("*").eq("organization_id", organization.id).order("updated_at", { ascending: false }).limit(250),
        db!.from("organization_programs").select("name").eq("organization_id", organization.id),
        db!.from("organization_areas").select("geography_id").eq("organization_id", organization.id),
      ]);
      if (!live) return;

      const issues: string[] = [];
      const readRows = <T,>(result: PromiseSettledResult<{ data: T[] | null; error: { message: string } | null }>, label: string): T[] => {
        if (result.status === "rejected" || result.value.error) {
          issues.push(label);
          return [];
        }
        return result.value.data || [];
      };

      const nextProjects = readRows<Project>(results[0] as never, "projects");
      const nextOpportunities = readRows<Opportunity>(results[1] as never, "opportunities");
      const nextApplications = readRows<Application>(results[2] as never, "applications");
      const nextAssignments = readRows<Assignment>(results[3] as never, "assignments");
      const nextCases = readRows<CaseRow>(results[4] as never, "cases");
      const programs = readRows<{ name: string }>(results[5] as never, "programs");
      const areas = readRows<{ geography_id: string }>(results[6] as never, "operating areas");

      setProjects(nextProjects);
      setOpportunities(nextOpportunities);
      setApplications(nextApplications);
      setAssignments(nextAssignments);
      setCases(nextCases);
      setProgramCount(programs.length);
      setAreaCount(areas.length);

      const projectIds = nextProjects.map((item) => item.id);
      const assignmentIds = nextAssignments.map((item) => item.id);
      const detailResults = await Promise.allSettled([
        projectIds.length
          ? db!.from("survey_responses").select("*").in("project_id", projectIds).order("created_at", { ascending: false }).limit(500)
          : Promise.resolve({ data: [] as Response[], error: null }),
        projectIds.length
          ? db!.from("assistance_entries").select("*").in("project_id", projectIds).order("created_at", { ascending: false }).limit(500)
          : Promise.resolve({ data: [] as Assistance[], error: null }),
        assignmentIds.length
          ? db!.from("work_payable_units").select("*").in("assignment_id", assignmentIds).order("created_at", { ascending: false }).limit(500)
          : Promise.resolve({ data: [] as Payable[], error: null }),
      ]);
      if (!live) return;
      setResponses(readRows<Response>(detailResults[0] as never, "survey responses"));
      setAssistance(readRows<Assistance>(detailResults[1] as never, "assistance ledger"));
      setPayables(readRows<Payable>(detailResults[2] as never, "payables"));
      if (issues.length) setError(`Some organization dashboard data could not be refreshed: ${[...new Set(issues)].join(", ")}. Open the related workspace for full details.`);
    };

    void loadBase().catch((cause) => {
      if (!live) return;
      setError(cause instanceof Error ? cause.message : "Organization dashboard could not be loaded.");
    }).finally(() => {
      if (live) setLoading(false);
    });

    return () => {
      live = false;
    };
  }, [organization.id, revision]);

  const activeProjects = useMemo(() => projects.filter((item) => item.status === "active"), [projects]);
  const openOpportunities = useMemo(
    () => opportunities.filter((item) => item.publication_state === "published" && item.status === "open" && item.applications_open),
    [opportunities],
  );
  const pendingApplications = useMemo(() => applications.filter((item) => item.status === "pending"), [applications]);
  const selectedApplications = useMemo(() => applications.filter((item) => item.status === "selected"), [applications]);
  const offeredAssignments = useMemo(() => assignments.filter((item) => item.status === "offered"), [assignments]);
  const activeAssignments = useMemo(() => assignments.filter((item) => item.status === "active"), [assignments]);
  const activeWorkerCount = useMemo(() => new Set(activeAssignments.map((item) => item.user_id)).size, [activeAssignments]);
  const submittedSurveys = useMemo(() => responses.filter((item) => item.status === "submitted").length, [responses]);
  const approvedSurveys = useMemo(() => responses.filter((item) => item.status === "approved").length, [responses]);
  const activeCases = useMemo(() => cases.filter((item) => !["closed", "cancelled"].includes(item.status)), [cases]);
  const recordedAssistance = useMemo(() => assistance.filter((item) => item.status === "recorded").length, [assistance]);
  const eligiblePayables = useMemo(() => payables.filter((item) => item.eligible).length, [payables]);
  const dueFollowUps = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return activeCases.filter((item) => item.follow_up_on && item.follow_up_on <= today).length;
  }, [activeCases]);

  const nextAction = pendingApplications.length
    ? {
        eyebrow: "RECRUITMENT QUEUE",
        title: `${pendingApplications.length} new Field Worker application${pendingApplications.length === 1 ? "" : "s"} need review`,
        copy: "Review application-scoped profile snapshots, shortlist candidates and keep selection decisions moving.",
        button: "Review applications",
        page: "Workforce marketplace",
      }
    : selectedApplications.length
      ? {
          eyebrow: "SELECTION READY",
          title: `${selectedApplications.length} selected candidate${selectedApplications.length === 1 ? " is" : "s are"} ready for a formal offer`,
          copy: "Send assignment offers through the existing recruitment workflow. Survey access remains inactive until the Field Worker accepts.",
          button: "Send offers",
          page: "Workforce marketplace",
        }
      : dueFollowUps
        ? {
            eyebrow: "CASE FOLLOW-UP",
            title: `${dueFollowUps} beneficiary follow-up${dueFollowUps === 1 ? " is" : "s are"} due`,
            copy: "Open the case workspace to record follow-up outcomes and keep unresolved needs visible.",
            button: "Open cases",
            page: "Beneficiary cases",
          }
        : activeProjects.length && !openOpportunities.length
          ? {
              eyebrow: "BUILD YOUR FIELD TEAM",
              title: "Your active projects have no open recruitment opportunities",
              copy: "Publish an opportunity so eligible Field Workers can discover the work and apply without permanent profile sharing.",
              button: "Open recruitment",
              page: "Workforce marketplace",
            }
          : !activeProjects.length
            ? {
                eyebrow: "START DELIVERY",
                title: "Create or activate a project to begin field operations",
                copy: "Projects connect recruitment, surveys, beneficiary operations, workforce assignments and project finance.",
                button: "Manage projects",
                page: "Survey projects",
              }
            : {
                eyebrow: "OPERATIONS HEALTHY",
                title: `${activeProjects.length} active project${activeProjects.length === 1 ? "" : "s"} are ready for coordinated delivery`,
                copy: "Use the organization workspace to keep recruitment, survey delivery, cases, assistance and payables aligned.",
                button: "Review projects",
                page: "Survey projects",
              };

  return (
    <section className="organization-dashboard" aria-label="Organization daily workspace">
      <section className="organization-hero">
        <div className="organization-hero-identity">
          <OrganizationLogoImage name={organization.name} path={organization.logo_path || null} updatedAt={organization.logo_updated_at || null} size="review" />
          <div>
            <span className="eyebrow">ORGANIZATION HOME</span>
            <div className="organization-title-row"><h2>{organization.name}</h2><Badge value={organization.status} /></div>
            <p>Coordinate projects, recruitment, Field Workers, surveys, beneficiary operations and finance from one accountable workspace.</p>
            <div className="organization-identity-meta">
              <span><strong>Registration</strong>{organization.registration_number || "Not recorded"}</span>
              <span><strong>Contact</strong>{organization.contact_person || organization.email || "Not recorded"}</span>
              <span><strong>Coverage</strong>{areaCount} operating area{areaCount === 1 ? "" : "s"} · {programCount} program{programCount === 1 ? "" : "s"}</span>
            </div>
          </div>
        </div>
        <div className="organization-hero-actions">
          <button className="primary" onClick={() => onNavigate("Survey projects")}><BriefcaseBusiness size={16} /> Manage projects</button>
          <button className="secondary" onClick={() => onNavigate("Workforce marketplace")}><Users size={16} /> Recruitment</button>
          <button className="organization-refresh" disabled={loading} onClick={() => setRevision((value) => value + 1)} aria-label="Refresh organization dashboard"><RefreshCw size={15} className={loading ? "organization-spin" : ""} /> Refresh</button>
        </div>
      </section>

      {error && <p className="notice" role="status">{error}</p>}

      <div className="organization-metric-grid" aria-label="Organization workspace metrics">
        <Metric icon={<BriefcaseBusiness size={18} />} label="Active projects" value={activeProjects.length} detail={`${projects.length} projects visible`} />
        <Metric icon={<Send size={18} />} label="Open opportunities" value={openOpportunities.length} detail={`${applications.length} total applications`} />
        <Metric icon={<FileCheck2 size={18} />} label="New applications" value={pendingApplications.length} detail={`${selectedApplications.length} selected for offer`} />
        <Metric icon={<Users size={18} />} label="Active Field Workers" value={activeWorkerCount} detail={`${offeredAssignments.length} offers awaiting response`} />
        <Metric icon={<ClipboardCheck size={18} />} label="Submitted surveys" value={submittedSurveys} detail={`${approvedSurveys} approved responses`} />
        <Metric icon={<HeartHandshake size={18} />} label="Active cases" value={activeCases.length} detail={`${dueFollowUps} follow-ups due`} />
      </div>

      <section className="organization-next-action">
        <div><span className="eyebrow">{nextAction.eyebrow}</span><h3>{nextAction.title}</h3><p>{nextAction.copy}</p></div>
        <button className="primary" onClick={() => onNavigate(nextAction.page)}>{nextAction.button} <ArrowRight size={14} /></button>
      </section>

      <div className="organization-dashboard-grid">
        <section className="organization-card">
          <div className="organization-card-heading"><div><span className="eyebrow">PROJECT DELIVERY</span><h3>Active projects</h3></div><button className="link" onClick={() => onNavigate("Survey projects")}>View all</button></div>
          <div className="organization-compact-list">
            {projects.slice(0, 4).map((project) => (
              <article key={project.id}>
                <div><strong>{project.title}</strong><p>{dateLabel(project.start_date)} – {dateLabel(project.end_date)} · target {project.target}</p></div>
                <CompactState value={project.status} />
              </article>
            ))}
            {!projects.length && <div className="organization-empty"><BriefcaseBusiness size={20} /><div><strong>No projects yet</strong><p>Create a project to connect recruitment and field delivery.</p></div></div>}
          </div>
        </section>

        <section className="organization-card">
          <div className="organization-card-heading"><div><span className="eyebrow">RECRUITMENT PIPELINE</span><h3>Recent applications</h3></div><button className="link" onClick={() => onNavigate("Workforce marketplace")}>Open recruitment</button></div>
          <div className="organization-compact-list">
            {applications.slice(0, 4).map((application) => (
              <article key={application.id}>
                <div><strong>{application.volunteer_name}</strong><p>{application.project_title} · {dateLabel(application.created_at)}</p></div>
                <CompactState value={application.status} />
              </article>
            ))}
            {!applications.length && <div className="organization-empty"><Users size={20} /><div><strong>No applications yet</strong><p>Published opportunities will feed the organization recruitment pipeline.</p></div></div>}
          </div>
        </section>

        <section className="organization-card">
          <div className="organization-card-heading"><div><span className="eyebrow">BENEFICIARY OPERATIONS</span><h3>Cases & assistance</h3></div><HeartHandshake size={20} /></div>
          <div className="organization-fact-grid">
            <div><small>Active cases</small><strong>{activeCases.length}</strong><span>{dueFollowUps} follow-ups due</span></div>
            <div><small>Assistance delivered</small><strong>{recordedAssistance}</strong><span>Recorded ledger entries</span></div>
            <div><small>Approved surveys</small><strong>{approvedSurveys}</strong><span>{responses.length} recent responses loaded</span></div>
            <div><small>Coverage</small><strong>{areaCount}</strong><span>{programCount} active program areas</span></div>
          </div>
          <div className="organization-card-actions"><button className="secondary" onClick={() => onNavigate("Beneficiary cases")}>Open cases</button><button className="secondary" onClick={() => onNavigate("Assistance ledger")}>Assistance ledger</button></div>
        </section>

        <section className="organization-card">
          <div className="organization-card-heading"><div><span className="eyebrow">WORKFORCE FINANCE</span><h3>Assignments & payables</h3></div><CircleDollarSign size={20} /></div>
          <div className="organization-fact-grid">
            <div><small>Active assignments</small><strong>{activeAssignments.length}</strong><span>{activeWorkerCount} active Field Workers</span></div>
            <div><small>Offers waiting</small><strong>{offeredAssignments.length}</strong><span>Pending Field Worker response</span></div>
            <div><small>Eligible payable units</small><strong>{eligiblePayables}</strong><span>Open payables for authorized review</span></div>
            <div><small>Unread updates</small><strong>{unread}</strong><span>Organization/account notifications</span></div>
          </div>
          <div className="organization-card-actions"><button className="secondary" onClick={() => onNavigate("Workforce payables")}>Open payables</button><button className="secondary" onClick={() => onNavigate("Project funding")}>Project finance</button></div>
        </section>

        <section className="organization-card organization-quick-access">
          <div className="organization-card-heading"><div><span className="eyebrow">QUICK ACCESS</span><h3>Run daily operations</h3></div><ShieldCheck size={20} /></div>
          <div className="organization-action-grid">
            <button onClick={() => onNavigate("Workforce marketplace")}><Users size={17} /><span><strong>Recruitment</strong><small>Opportunities, applications and assignments</small></span><ArrowRight size={14} /></button>
            <button onClick={() => onNavigate("Project team")}><Users size={17} /><span><strong>Team & access</strong><small>Project staff and operational roles</small></span><ArrowRight size={14} /></button>
            <button onClick={() => onNavigate("Survey projects")}><ClipboardCheck size={17} /><span><strong>Projects & surveys</strong><small>Delivery, collection and review</small></span><ArrowRight size={14} /></button>
            <button onClick={() => onNavigate("Beneficiary cases")}><HeartHandshake size={17} /><span><strong>Cases</strong><small>Needs, follow-up and closure</small></span><ArrowRight size={14} /></button>
            <button onClick={() => onNavigate("Data sharing")}><ShieldCheck size={17} /><span><strong>Controlled sharing</strong><small>Consent-bound coordination</small></span><ArrowRight size={14} /></button>
            <button onClick={() => onNavigate("Notifications")}><CheckCircle2 size={17} /><span><strong>Updates</strong><small>{unread ? `${unread} unread notifications` : "No unread notifications"}</small></span><ArrowRight size={14} /></button>
          </div>
        </section>
      </div>
    </section>
  );
}
