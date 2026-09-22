import {useOperationalSummary} from "../analytics/useOperationalSummary";
import type {ReportSelection} from "../analytics/model";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  HeartHandshake,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  Users,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { db, rpc } from "../../lib/supabase/client";
import type { Database } from "../../lib/supabase/database.types";
import { human } from "../../shared/ui/FormFields";

type Tables = Database["public"]["Tables"];
type Organization = Tables["organizations"]["Row"];
type OrganizationApplication = Tables["partner_ngo_applications"]["Row"];
type VolunteerProfile = Tables["volunteer_profiles"]["Row"];
type Project = Tables["survey_projects"]["Row"];
type WorkApplication = Tables["work_applications"]["Row"];
type WorkAssignment = Tables["work_assignments"]["Row"];
type SurveyResponse = Tables["survey_responses"]["Row"];
type CaseRow = Tables["beneficiary_cases"]["Row"];
type Assistance = Tables["assistance_entries"]["Row"];

type FinanceQueueRow = { id: string; status: string; amount: string; currency: string; provider: string; user_name: string; requested_at: string };
type FinanceQueue = { rows: FinanceQueueRow[]; count: number };
type FinanceReconciliation = { matched: number; needs_review: number };
type Call = (name: string, args?: Record<string, unknown>) => Promise<unknown>;
const call = rpc as unknown as Call;

type Props = {
  platformRole: string;
  unread: number;
  canReviewFieldWorkers: boolean;
  canReviewOrganizations: boolean;
  canManageSurveys: boolean;
  canManageFinance: boolean;
  superAdmin: boolean;
  onNavigate: (page: string) => void;
  onReport: (selection: ReportSelection) => void;
};

const dateLabel = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat("en-PK", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value))
  : "—";

function Metric({ icon, label, value, detail, onClick }: { icon: ReactNode; label: string; value: string | number; detail: string; onClick:()=>void }) {
  return <button type="button" className="staff-ops-metric" onClick={onClick}><span className="staff-ops-metric-icon">{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></button>;
}

function State({ value }: { value: string }) {
  const tone = ["active", "approved", "verified", "completed", "succeeded", "recorded"].includes(value)
    ? "success"
    : ["pending", "submitted", "requested", "processing", "offered"].includes(value)
      ? "warning"
      : "neutral";
  return <span className={`staff-ops-state ${tone}`}>{human(value)}</span>;
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="staff-ops-empty"><ShieldCheck size={19} /><span>{children}</span></div>;
}

export function FieldLanceStaffDashboard({
  platformRole,
  unread,
  canReviewFieldWorkers,
  canReviewOrganizations,
  canManageSurveys,
  canManageFinance,
  superAdmin,
  onNavigate,
  onReport,
}: Props) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationApplications, setOrganizationApplications] = useState<OrganizationApplication[]>([]);
  const [profiles, setProfiles] = useState<VolunteerProfile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workApplications, setWorkApplications] = useState<WorkApplication[]>([]);
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [assistance, setAssistance] = useState<Assistance[]>([]);
  const [financeQueue, setFinanceQueue] = useState<FinanceQueue | null>(null);
  const [financeReconciliation, setFinanceReconciliation] = useState<FinanceReconciliation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const analytics=useOperationalSummary(null,null,revision);
  const n=analytics.count;

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");

    const run = async () => {
      const results = await Promise.allSettled([
        db!.from("organizations").select("*").order("created_at", { ascending: false }).limit(8),
        canReviewOrganizations
          ? db!.from("partner_ngo_applications").select("*").order("submitted_at", { ascending: false, nullsFirst: false }).limit(8)
          : Promise.resolve({ data: [] as OrganizationApplication[], error: null }),
        canReviewFieldWorkers
          ? db!.from("volunteer_profiles").select("*").order("updated_at", { ascending: false }).limit(8)
          : Promise.resolve({ data: [] as VolunteerProfile[], error: null }),
        db!.from("survey_projects").select("*").order("created_at", { ascending: false }).limit(8),
        canManageSurveys
          ? db!.from("work_applications").select("*").order("created_at", { ascending: false }).limit(8)
          : Promise.resolve({ data: [] as WorkApplication[], error: null }),
        canManageSurveys
          ? db!.from("work_assignments").select("*").order("created_at", { ascending: false }).limit(8)
          : Promise.resolve({ data: [] as WorkAssignment[], error: null }),
        canManageSurveys
          ? db!.from("survey_responses").select("*").order("created_at", { ascending: false }).limit(8)
          : Promise.resolve({ data: [] as SurveyResponse[], error: null }),
        canManageSurveys
          ? db!.from("beneficiary_cases").select("*").order("updated_at", { ascending: false }).limit(8)
          : Promise.resolve({ data: [] as CaseRow[], error: null }),
        canManageSurveys
          ? db!.from("assistance_entries").select("*").order("created_at", { ascending: false }).limit(8)
          : Promise.resolve({ data: [] as Assistance[], error: null }),
        canManageFinance ? call("admin_e_wallet_operations_queue", { p_status: null, p_provider: null, p_limit: 200 }) : Promise.resolve(null),
        canManageFinance ? call("admin_e_wallet_provider_reconciliation", { p_status: null, p_provider: null, p_limit: 200 }) : Promise.resolve(null),
      ]);
      if (!live) return;
      const issues: string[] = [];
      const rows = <T,>(result: PromiseSettledResult<{ data: T[] | null; error: { message: string } | null }>, label: string) => {
        if (result.status === "rejected" || result.value.error) {
          issues.push(label);
          return [] as T[];
        }
        return result.value.data || [];
      };
      setOrganizations(rows<Organization>(results[0] as never, "organizations"));
      setOrganizationApplications(rows<OrganizationApplication>(results[1] as never, "organization applications"));
      setProfiles(rows<VolunteerProfile>(results[2] as never, "Field Worker profiles"));
      setProjects(rows<Project>(results[3] as never, "projects"));
      setWorkApplications(rows<WorkApplication>(results[4] as never, "recruitment applications"));
      setAssignments(rows<WorkAssignment>(results[5] as never, "assignments"));
      setResponses(rows<SurveyResponse>(results[6] as never, "survey responses"));
      setCases(rows<CaseRow>(results[7] as never, "beneficiary cases"));
      setAssistance(rows<Assistance>(results[8] as never, "assistance"));
      const finance = results[9];
      const reconciliation = results[10];
      if (canManageFinance) {
        if (finance.status === "fulfilled") setFinanceQueue(finance.value as FinanceQueue);
        else issues.push("withdrawal queue");
        if (reconciliation.status === "fulfilled") setFinanceReconciliation(reconciliation.value as FinanceReconciliation);
        else issues.push("provider reconciliation");
      }
      if (issues.length) setError(`Some Staff Operations data could not be refreshed: ${[...new Set(issues)].join(", ")}. Existing workspace permissions remain authoritative.`);
    };

    void run().catch((cause) => {
      if (live) setError(cause instanceof Error ? cause.message : "FieldLance Staff Operations could not be loaded.");
    }).finally(() => {
      if (live) setLoading(false);
    });
    return () => { live = false; };
  }, [canManageFinance, canManageSurveys, canReviewFieldWorkers, canReviewOrganizations, revision]);

  const activeOrganizations = useMemo(() => organizations.filter((row) => row.status === "active"), [organizations]);
  const organizationReviewQueue = useMemo(() => organizationApplications.filter((row) => row.status === "submitted"), [organizationApplications]);
  const workerReviewQueue = useMemo(() => profiles.filter((row) => row.status === "pending"), [profiles]);
  const activeProjects = useMemo(() => projects.filter((row) => row.status === "active"), [projects]);
  const recruitmentQueue = useMemo(() => workApplications.filter((row) => ["pending", "shortlisted", "selected"].includes(row.status)), [workApplications]);
  const activeAssignments = useMemo(() => assignments.filter((row) => row.status === "active"), [assignments]);
  const assignmentOffers = useMemo(() => assignments.filter((row) => row.status === "offered"), [assignments]);
  const surveyReviewQueue = useMemo(() => responses.filter((row) => ["submitted", "correction_required"].includes(row.status)), [responses]);
  const activeCases = useMemo(() => cases.filter((row) => !["closed", "cancelled"].includes(row.status)), [cases]);
  const overdueCases = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return activeCases.filter((row) => row.follow_up_on && row.follow_up_on <= today);
  }, [activeCases]);
  const recordedAssistance = useMemo(() => assistance.filter((row) => row.status === "recorded").length, [assistance]);
  const withdrawalAttention = useMemo(() => (financeQueue?.rows || []).filter((row) => ["requested", "approved", "processing", "failed"].includes(row.status)), [financeQueue]);

  const nextAction = canReviewOrganizations && n("organization_applications","submitted")
    ? { eyebrow: "ORGANIZATION APPROVALS", title: `${n("organization_applications","submitted")} organization application${n("organization_applications","submitted") === 1 ? "" : "s"} awaiting review`, copy: "Review identity, legal evidence and organization readiness before granting an Organization workspace.", page: "NGO applications", button: "Review applications" }
    : canReviewFieldWorkers && n("profiles","pending")
      ? { eyebrow: "FIELD WORKER REVIEW", title: `${n("profiles","pending")} Field Worker profile${n("profiles","pending") === 1 ? "" : "s"} awaiting review`, copy: "Use the existing verification workflow; Staff Operations does not bypass evidence or document requirements.", page: "Volunteers", button: "Open Field Workers" }
      : canManageSurveys && (n("responses","submitted")+n("responses","correction_required"))
        ? { eyebrow: "SURVEY REVIEW QUEUE", title: `${(n("responses","submitted")+n("responses","correction_required"))} survey response${(n("responses","submitted")+n("responses","correction_required")) === 1 ? "" : "s"} need operational attention`, copy: "Open Verification to review submitted work and correction requests under existing project authorization.", page: "Verification", button: "Open verification" }
        : canManageSurveys && (n("applications","pending")+n("applications","shortlisted")+n("applications","selected"))
          ? { eyebrow: "RECRUITMENT OVERSIGHT", title: `${(n("applications","pending")+n("applications","shortlisted")+n("applications","selected"))} recruitment application${(n("applications","pending")+n("applications","shortlisted")+n("applications","selected")) === 1 ? "" : "s"} are still in progress`, copy: "Monitor organization recruitment without replacing the organization selection and offer workflow.", page: "Workforce marketplace", button: "Open recruitment" }
          : canManageFinance && (analytics.data?.withdrawal_attention||0)
            ? { eyebrow: "FINANCE OPERATIONS", title: `${(analytics.data?.withdrawal_attention||0)} withdrawal${(analytics.data?.withdrawal_attention||0) === 1 ? "" : "s"} need finance attention`, copy: "Review provider state, settlement controls and reconciliation in the existing guarded finance workspace.", page: "Withdrawal operations", button: "Open withdrawals" }
            : canManageFinance && (financeReconciliation?.needs_review || 0) > 0
              ? { eyebrow: "RECONCILIATION", title: `${financeReconciliation?.needs_review || 0} recent provider reconciliation item${financeReconciliation?.needs_review === 1 ? "" : "s"} need review`, copy: "Resolve provider ↔ payable ↔ finance drift without editing balances directly.", page: "Withdrawal operations", button: "Review reconciliation" }
              : canManageSurveys && (analytics.data?.due_cases||0)
                ? { eyebrow: "CASE FOLLOW-UP", title: `${(analytics.data?.due_cases||0)} beneficiary case follow-up${(analytics.data?.due_cases||0) === 1 ? "" : "s"} are due`, copy: "Keep unresolved needs visible and route follow-up work through the existing case workspace.", page: "Beneficiary cases", button: "Open cases" }
                : { eyebrow: "NETWORK STATUS", title: "No urgent queue is dominating Staff Operations", copy: "Use this workspace to monitor partners, Field Workers, projects, recruitment, delivery and finance while keeping decisions in their authoritative modules.", page: "Activity", button: "Review audit trail" };

  const quickActions: Array<[string, string, string, LucideIcon]> = [];
  quickActions.push(["Task Center", "Tasks & escalations", "Cross-workspace SLA and overdue action", ClipboardList]);
  if (canReviewOrganizations) quickActions.push(["NGO applications", "Organization approvals", "Review onboarding and evidence", Building2]);
  if (canReviewFieldWorkers) quickActions.push(["Volunteers", "Field Worker review", "Profiles, evidence and verification", UserCheck]);
  quickActions.push(["Survey projects", "Project network", "Projects across active organizations", BriefcaseBusiness]);
  if (canManageSurveys) {
    quickActions.push(["Workforce marketplace", "Recruitment oversight", "Applications, offers and assignments", Users]);
    quickActions.push(["Verification", "Verification queue", "Survey work requiring review", ClipboardCheck]);
    quickActions.push(["Beneficiary cases", "Cases", "Follow-up and unresolved needs", HeartHandshake]);
  }
  if (canManageFinance) {
    quickActions.push(["Withdrawal operations", "Withdrawals", "Manual/mock provider operations", WalletCards]);
    quickActions.push(["Project funding", "Project finance", "Funding and reconciliation", CircleDollarSign]);
  }
  if (superAdmin) quickActions.push(["Accounts", "Accounts & roles", "Platform access administration", ShieldCheck]);
  quickActions.push(["Activity", "Audit trail", "Recent accountable platform activity", Activity]);

  if (analytics.loading) return <section className="panel" role="status">Loading accurate operational totals…</section>;
  if (analytics.error) return <section className="panel"><p className="notice error" role="alert">{analytics.error}</p><button onClick={()=>setRevision(v=>v+1)}>Retry dashboard</button></section>;
  return <section className="staff-ops-dashboard" aria-label="FieldLance Staff Operations dashboard">
    <section className="staff-ops-hero">
      <div><span className="eyebrow">FIELDLANCE STAFF OPERATIONS</span><h2>Keep the field network accountable.</h2><p>Review queues, monitor delivery and route action to the existing guarded workspaces. Dashboard visibility never replaces RLS, RPC authority or role-specific review controls.</p><div className="staff-ops-role"><ShieldCheck size={15} /><strong>{human(platformRole)}</strong><span>{unread} unread update{unread === 1 ? "" : "s"}</span></div></div>
      <div className="staff-ops-hero-actions"><button className="primary" onClick={() => onNavigate(nextAction.page)}>Open priority queue <ArrowRight size={14} /></button><button className="staff-ops-refresh" disabled={loading} onClick={() => setRevision((value) => value + 1)}><RefreshCw size={15} className={loading ? "staff-ops-spin" : ""} /> Refresh</button></div>
    </section>

    {error && <p className="notice" role="status">{error}</p>}

    <div className="staff-ops-metric-grid" aria-label="FieldLance network metrics">
      <Metric onClick={()=>onReport({kind:"organizations",status:"active"})} icon={<Building2 size={18} />} label="Active organizations" value={n("organizations","active")} detail={`${n("organizations")} organizations visible`} />
      <Metric onClick={()=>onReport({kind:"projects",status:"active"})} icon={<BriefcaseBusiness size={18} />} label="Active projects" value={n("projects","active")} detail={`${n("projects")} projects visible`} />
      {analytics.data?.allowed_kinds.includes("applications") && <Metric onClick={()=>onReport({kind:"applications",status:"__progress"})} icon={<Users size={18} />} label="Recruitment in progress" value={(n("applications","pending")+n("applications","shortlisted")+n("applications","selected"))} detail={`${n("assignments","offered")} offers · ${n("assignments","active")} active assignments`} />}
      {analytics.data?.allowed_kinds.includes("responses") && <Metric onClick={()=>onReport({kind:"responses",status:"__review"})} icon={<ClipboardCheck size={18} />} label="Survey review queue" value={(n("responses","submitted")+n("responses","correction_required"))} detail={`${n("responses")} responses visible`} />}
      {analytics.data?.allowed_kinds.includes("cases") && <Metric onClick={()=>onReport({kind:"cases",status:"__active"})} icon={<HeartHandshake size={18} />} label="Active cases" value={(n("cases")-n("cases","closed")-n("cases","cancelled"))} detail={`${(analytics.data?.due_cases||0)} follow-ups due`} />}
      {canManageFinance && <Metric onClick={()=>onNavigate("Withdrawal operations")} icon={<CircleDollarSign size={18} />} label="Finance attention" value={canManageFinance ? (analytics.data?.withdrawal_attention||0) : "—"} detail={canManageFinance ? "All withdrawals needing attention; reconciliation in Finance" : "Role-scoped finance access"} />}
    </div>

    <section className="staff-ops-next-action"><div><span className="eyebrow">{nextAction.eyebrow}</span><h3>{nextAction.title}</h3><p>{nextAction.copy}</p></div><button className="primary" onClick={() => onNavigate(nextAction.page)}>{nextAction.button} <ArrowRight size={14} /></button></section>

    <div className="staff-ops-grid">
      <section className="staff-ops-card"><div className="staff-ops-card-heading"><div><span className="eyebrow">GOVERNANCE QUEUES</span><h3>People & organizations</h3></div><ShieldCheck size={18} /></div>
        <div className="staff-ops-fact-grid"><div><small>Organization reviews</small><strong>{canReviewOrganizations ? n("organization_applications","submitted") : "—"}</strong><span>Submitted Partner Organization applications</span></div><div><small>Field Worker reviews</small><strong>{canReviewFieldWorkers ? n("profiles","pending") : "—"}</strong><span>Profiles awaiting review</span></div></div>
        <div className="staff-ops-compact-list">
          {organizationReviewQueue.slice(0, 2).map((row) => <article key={row.id}><div><strong>{row.organization_name || "Organization application"}</strong><p>{row.representative_name || "Representative not recorded"} · {dateLabel(row.submitted_at)}</p></div><State value={row.status} /></article>)}
          {workerReviewQueue.slice(0, 2).map((row) => <article key={row.user_id}><div><strong>{String((row.details as Record<string, unknown>)?.full_name || "Field Worker")}</strong><p>Profile updated {dateLabel(row.updated_at)}</p></div><State value={row.status} /></article>)}
          {!n("organization_applications","submitted") && !n("profiles","pending") && <Empty>No visible governance review queue.</Empty>}
        </div>
        <div className="staff-ops-card-actions">{canReviewOrganizations && <button className="secondary" onClick={() => onNavigate("NGO applications")}>Organization applications</button>}{canReviewFieldWorkers && <button className="secondary" onClick={() => onNavigate("Volunteers")}>Field Workers</button>}</div>
      </section>

      <section className="staff-ops-card"><div className="staff-ops-card-heading"><div><span className="eyebrow">DELIVERY NETWORK</span><h3>Projects & field delivery</h3></div><BriefcaseBusiness size={18} /></div>
        <div className="staff-ops-fact-grid"><div><small>Active assignments</small><strong>{canManageSurveys ? n("assignments","active") : "—"}</strong><span>Accepted Field Worker assignments</span></div><div><small>Assistance recorded</small><strong>{canManageSurveys ? n("assistance","recorded") : "—"}</strong><span>Delivered assistance entries visible</span></div></div>
        <div className="staff-ops-compact-list">{projects.slice(0, 4).map((row) => <article key={row.id}><div><strong>{row.title}</strong><p>Organization {row.organization_id.slice(0, 8)} · target {row.target}</p></div><State value={row.status} /></article>)}{!n("projects") && <Empty>No projects visible in this Staff role.</Empty>}</div>
        <div className="staff-ops-card-actions"><button className="secondary" onClick={() => onNavigate("Survey projects")}>Projects</button>{canManageSurveys && <button className="secondary" onClick={() => onNavigate("Workforce marketplace")}>Recruitment</button>}</div>
      </section>

      <section className="staff-ops-card"><div className="staff-ops-card-heading"><div><span className="eyebrow">OPERATIONS PRESSURE</span><h3>Recent queues needing attention</h3></div><FileCheck2 size={18} /></div>
        <div className="staff-ops-compact-list">
          {canManageSurveys && surveyReviewQueue.slice(0, 2).map((row) => <article key={row.id}><div><strong>Survey response {row.id.slice(0, 8)}</strong><p>Project {row.project_id.slice(0, 8)} · {dateLabel(row.updated_at)}</p></div><State value={row.status} /></article>)}
          {canManageSurveys && overdueCases.slice(0, 2).map((row) => <article key={row.id}><div><strong>{row.title}</strong><p>Follow-up due {dateLabel(row.follow_up_on)}</p></div><State value={row.status} /></article>)}
          {canManageFinance && withdrawalAttention.slice(0, 2).map((row) => <article key={row.id}><div><strong>{row.currency} {Number(row.amount || 0).toLocaleString("en-PK")} · {human(row.provider)}</strong><p>{row.user_name || "Field Worker"} · {dateLabel(row.requested_at)}</p></div><State value={row.status} /></article>)}
          {!(canManageSurveys && ((n("responses","submitted")+n("responses","correction_required")) || (analytics.data?.due_cases||0))) && !(canManageFinance && (analytics.data?.withdrawal_attention||0)) && <Empty>No visible operational queue needs immediate attention.</Empty>}
        </div>
        <div className="staff-ops-card-actions">{canManageSurveys && <button className="secondary" onClick={() => onNavigate("Verification")}>Verification</button>}{canManageFinance && <button className="secondary" onClick={() => onNavigate("Withdrawal operations")}>Finance operations</button>}</div>
      </section>

      <section className="staff-ops-card staff-ops-quick-access"><div className="staff-ops-card-heading"><div><span className="eyebrow">QUICK ACCESS</span><h3>FieldLance operations</h3></div><CheckCircle2 size={18} /></div><div className="staff-ops-action-grid">{quickActions.map(([page, title, description, Icon]) => <button key={page} onClick={() => onNavigate(page)}><Icon size={17} /><span><strong>{title}</strong><small>{description}</small></span><ArrowRight size={13} /></button>)}</div></section>
    </div>
  </section>;
}
