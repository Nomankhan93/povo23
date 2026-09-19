import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BellRing,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardList,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  History,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  WalletCards,
} from "lucide-react";
import { db, rpc } from "../../lib/supabase/client";
import type { Database } from "../../lib/supabase/database.types";
import { Badge, human } from "../../shared/ui/FormFields";

type Tables = Database["public"]["Tables"];
type Profile = Tables["volunteer_profiles"]["Row"];
type Application = Tables["work_applications"]["Row"];
type Assignment = Tables["work_assignments"]["Row"];

type WithdrawalSummary = {
  currency: string;
  approved: string;
  paid: string;
  gross_balance: string;
  pending_withdrawals: string;
  available: string;
  verified_wallets: number;
  pin_configured: boolean;
  provider_mode: string;
};

type WorkHistoryRow = {
  id: string;
  organization_name: string;
  project_title: string;
  role_title: string;
  workflow_status: string;
  verified: boolean;
  start_date: string;
  end_date: string | null;
  approved_surveys: number;
  submitted_surveys: number;
};

type WorkHistoryPage = {
  rows: WorkHistoryRow[];
  total: number;
  page: number;
  page_size: number;
};

type AvailableResult = { rows: unknown[]; total: number };

type DashboardProps = {
  userId: string;
  profile: Profile | null;
  unread: number;
  onNavigate: (page: string) => void;
  onField: () => void;
};

const money = (value: string | number | undefined) =>
  new Intl.NumberFormat("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const dateLabel = (value: string | null | undefined) => {
  if (!value) return "—";
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  return new Intl.DateTimeFormat("en-PK", { day: "numeric", month: "short", year: "numeric" }).format(new Date(normalized));
};

const statusTone = (status: string) => {
  if (["active", "completed", "selected", "verified"].includes(status)) return "success";
  if (["offered", "pending", "shortlisted"].includes(status)) return "warning";
  if (["rejected", "declined", "cancelled", "withdrawn"].includes(status)) return "neutral";
  return "info";
};

function profileCompleteness(profile: Profile | null) {
  if (!profile) return 0;
  const details = (profile.details || {}) as Record<string, unknown>;
  const values = [
    details.full_name,
    details.phone,
    details.address,
    profile.geography_id,
    details.education,
    details.skills,
    details.languages,
    details.availability,
    details.preference,
    profile.photo_path,
  ];
  return Math.round((values.filter((value) => typeof value === "string" ? value.trim().length > 0 : Boolean(value)).length / values.length) * 100);
}

function Metric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string | number; detail: string }) {
  return (
    <article className="field-worker-metric">
      <span className="field-worker-metric-icon">{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </article>
  );
}

export function FieldWorkerDashboard({ userId, profile, unread, onNavigate, onField }: DashboardProps) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [openOpportunities, setOpenOpportunities] = useState(0);
  const [summary, setSummary] = useState<WithdrawalSummary | null>(null);
  const [history, setHistory] = useState<WorkHistoryRow[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");

    const fetchApplications = async () => {
      const result = await db!
        .from("work_applications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (result.error) throw result.error;
      return result.data || [];
    };

    const fetchAssignments = async () => {
      const result = await db!
        .from("work_assignments")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (result.error) throw result.error;
      return result.data || [];
    };

    const fetchOpportunities = async () =>
      rpc("available_work_opportunities", {
        p_page: 0,
        p_organization: null,
        p_area: null,
        p_payment: null,
        p_skill: "",
        p_work_date: null,
        p_deadline: null,
      }) as Promise<unknown>;

    const fetchSummary = async () => rpc("my_withdrawal_summary", { p_currency: "PKR" }) as Promise<unknown>;
    const fetchHistory = async () => rpc("work_experience_history", { p_user: userId, p_page: 0 }) as Promise<unknown>;

    void Promise.allSettled([
      fetchApplications(),
      fetchAssignments(),
      fetchOpportunities(),
      fetchSummary(),
      fetchHistory(),
    ]).then((results) => {
      if (!live) return;
      const issues: string[] = [];

      const [applicationResult, assignmentResult, opportunityResult, summaryResult, historyResult] = results;
      if (applicationResult.status === "fulfilled") setApplications(applicationResult.value as Application[]);
      else issues.push("applications");

      if (assignmentResult.status === "fulfilled") setAssignments(assignmentResult.value as Assignment[]);
      else issues.push("assignments");

      if (opportunityResult.status === "fulfilled") {
        const data = opportunityResult.value as AvailableResult;
        setOpenOpportunities(Number(data?.total || 0));
      } else issues.push("opportunities");

      if (summaryResult.status === "fulfilled") setSummary(summaryResult.value as WithdrawalSummary);
      else issues.push("earnings");

      if (historyResult.status === "fulfilled") {
        const data = historyResult.value as WorkHistoryPage;
        setHistory(data?.rows || []);
        setHistoryTotal(Number(data?.total || 0));
      } else issues.push("verified work history");

      if (issues.length) setError(`Some dashboard data could not be refreshed: ${issues.join(", ")}. Open the related workspace for full details.`);
      setLoading(false);
    });

    return () => {
      live = false;
    };
  }, [userId, revision]);

  const inReview = useMemo(
    () => applications.filter((item) => ["pending", "shortlisted", "selected"].includes(item.status)).length,
    [applications],
  );
  const offers = useMemo(() => assignments.filter((item) => item.status === "offered"), [assignments]);
  const active = useMemo(() => assignments.filter((item) => item.status === "active"), [assignments]);
  const completed = useMemo(() => assignments.filter((item) => item.status === "completed"), [assignments]);
  const completeness = profileCompleteness(profile);
  const details = (profile?.details || {}) as Record<string, string>;
  const firstName = details.full_name?.trim().split(/\s+/)[0] || "Field Worker";

  const currentAssignment = offers[0] || active[0] || null;
  const nextAction = profile?.status === "draft"
    ? {
        eyebrow: "COMPLETE YOUR SETUP",
        title: "Publish your Field Worker profile",
        copy: "Organizations can evaluate applications more confidently when your profile, skills and availability are complete.",
        button: "Complete profile",
        action: () => onNavigate("My profile"),
        secondary: null as null | { label: string; action: () => void },
      }
    : offers.length
      ? {
          eyebrow: "ACTION REQUIRED",
          title: `${offers.length} assignment offer${offers.length === 1 ? "" : "s"} waiting for you`,
          copy: "Review the project, dates and compensation terms. Survey access activates only after you accept the formal offer.",
          button: "Review offers",
          action: () => onNavigate("My Assigned Surveys"),
          secondary: null,
        }
      : active.length
        ? {
            eyebrow: "ACTIVE FIELD WORK",
            title: `Continue ${active[0].project_title}`,
            copy: "Your accepted assignment is active. Open assigned surveys or continue protected field work on this device.",
            button: "Open assigned surveys",
            action: () => onNavigate("My Assigned Surveys"),
            secondary: { label: "Open offline field", action: onField },
          }
        : inReview
          ? {
              eyebrow: "APPLICATIONS IN PROGRESS",
              title: `${inReview} application${inReview === 1 ? " is" : "s are"} still in recruitment`,
              copy: "Track shortlist and selection decisions while you continue exploring other published opportunities.",
              button: "Track applications",
              action: () => onNavigate("My Applications"),
              secondary: { label: "Browse opportunities", action: () => onNavigate("Available Opportunities") },
            }
          : {
              eyebrow: "FIND YOUR NEXT ASSIGNMENT",
              title: openOpportunities ? `${openOpportunities} open opportunit${openOpportunities === 1 ? "y" : "ies"} available` : "Explore FieldLance opportunities",
              copy: "Browse published field work from active organizations and apply without granting permanent access to your full private profile.",
              button: "Browse opportunities",
              action: () => onNavigate("Available Opportunities"),
              secondary: null,
            };

  const journeySteps = [
    { label: "Discover", active: openOpportunities > 0 || applications.length > 0 },
    { label: "Apply", active: applications.length > 0 },
    { label: "Selection", active: applications.some((item) => ["shortlisted", "selected"].includes(item.status)) || assignments.length > 0 },
    { label: "Assigned", active: assignments.some((item) => ["offered", "active", "completed"].includes(item.status)) },
    { label: "Complete", active: completed.length > 0 },
    { label: "Earn", active: Number(summary?.approved || 0) > 0 || Number(summary?.paid || 0) > 0 },
  ];

  return (
    <section className="field-worker-dashboard" aria-label="Field Worker daily workspace">
      <section className="field-worker-hero">
        <div className="field-worker-hero-copy">
          <span className="eyebrow">FIELD WORKER HOME</span>
          <h2>{firstName}, manage your work from one place.</h2>
          <p>Discover opportunities, track applications, respond to offers, complete assigned surveys and follow your verified earnings.</p>
          <div className="field-worker-hero-actions">
            <button className="primary" onClick={() => onNavigate("Available Opportunities")}>
              <BriefcaseBusiness size={16} /> Find work
            </button>
            <button className="secondary" onClick={onField}>Open offline field</button>
            <button className="field-worker-refresh" disabled={loading} onClick={() => setRevision((value) => value + 1)} aria-label="Refresh Field Worker dashboard">
              <RefreshCw size={15} className={loading ? "field-worker-spin" : ""} /> Refresh
            </button>
          </div>
        </div>
        <div className="field-worker-profile-summary">
          <div className="field-worker-profile-top">
            <span className="field-worker-profile-icon"><UserRound size={20} /></span>
            <div>
              <small>Profile readiness</small>
              <strong>{completeness}%</strong>
            </div>
            <Badge value={profile?.status === "verified" ? "active" : profile?.status || "draft"} />
          </div>
          <div className="field-worker-progress" aria-label={`Profile ${completeness}% complete`}>
            <span style={{ width: `${completeness}%` }} />
          </div>
          <p>{completeness >= 80 ? "Your profile has the key information organizations need for recruitment." : "Add skills, languages, availability, education and a profile photo to strengthen your applications."}</p>
          <button className="link" onClick={() => onNavigate("My profile")}>Review profile <ArrowRight size={13} /></button>
        </div>
      </section>

      {error && <p className="notice" role="status">{error}</p>}

      <div className="field-worker-metric-grid" aria-label="Field Worker workspace metrics">
        <Metric icon={<BriefcaseBusiness size={18} />} label="Open opportunities" value={openOpportunities} detail="Published work you can explore" />
        <Metric icon={<FileCheck2 size={18} />} label="Applications in review" value={inReview} detail={`${applications.length} total applications`} />
        <Metric icon={<Send size={18} />} label="Offers waiting" value={offers.length} detail="Accept before survey access activates" />
        <Metric icon={<Clock3 size={18} />} label="Active assignments" value={active.length} detail="Current accepted field work" />
        <Metric icon={<CheckCircle2 size={18} />} label="Completed work" value={completed.length} detail={`${historyTotal} FieldLance work-history records`} />
        <Metric icon={<CircleDollarSign size={18} />} label="Available earnings" value={`PKR ${money(summary?.available)}`} detail={`${summary?.verified_wallets || 0} verified payout wallet${summary?.verified_wallets === 1 ? "" : "s"}`} />
      </div>

      <section className="field-worker-next-action">
        <div>
          <span className="eyebrow">{nextAction.eyebrow}</span>
          <h3>{nextAction.title}</h3>
          <p>{nextAction.copy}</p>
        </div>
        <div className="actions">
          {nextAction.secondary && <button className="secondary" onClick={nextAction.secondary.action}>{nextAction.secondary.label}</button>}
          <button className="primary" onClick={nextAction.action}>{nextAction.button} <ArrowRight size={14} /></button>
        </div>
      </section>

      <section className="field-worker-journey" aria-label="FieldLance work lifecycle">
        {journeySteps.map((step, index) => (
          <div key={step.label} className={step.active ? "active" : ""}>
            <span>{step.active ? <CheckCircle2 size={14} /> : index + 1}</span>
            <strong>{step.label}</strong>
            {index < journeySteps.length - 1 && <ArrowRight size={13} />}
          </div>
        ))}
      </section>

      <div className="field-worker-dashboard-grid">
        <section className="field-worker-card field-worker-current-work">
          <div className="field-worker-card-heading">
            <div><span className="eyebrow">CURRENT WORK</span><h3>Assignments & offers</h3></div>
            <button className="link" onClick={() => onNavigate("My Assigned Surveys")}>View all</button>
          </div>
          {currentAssignment ? (
            <article className="field-worker-focus-row">
              <div className="field-worker-focus-icon">{currentAssignment.status === "offered" ? <Send size={19} /> : <BriefcaseBusiness size={19} />}</div>
              <div>
                <div className="field-worker-row-title"><strong>{currentAssignment.project_title}</strong><Badge value={currentAssignment.status} /></div>
                <p>{currentAssignment.organization_name}</p>
                <small>{dateLabel(currentAssignment.start_date)} – {dateLabel(currentAssignment.end_date)} · {currentAssignment.work_mode === "paid" ? `${currentAssignment.currency} ${Number(currentAssignment.rate || 0).toLocaleString()} · ${human(currentAssignment.compensation_type)}` : "Volunteer / unpaid"}</small>
              </div>
              <button className="secondary" onClick={() => onNavigate("My Assigned Surveys")}>{currentAssignment.status === "offered" ? "Review offer" : "Open work"}</button>
            </article>
          ) : (
            <div className="field-worker-empty">
              <BriefcaseBusiness size={22} />
              <div><strong>No active assignment yet</strong><p>Apply to published opportunities. Accepted offers appear here and in My Assigned Surveys.</p></div>
              <button className="secondary" onClick={() => onNavigate("Available Opportunities")}>Browse opportunities</button>
            </div>
          )}
        </section>

        <section className="field-worker-card">
          <div className="field-worker-card-heading">
            <div><span className="eyebrow">APPLICATION PIPELINE</span><h3>Recent applications</h3></div>
            <button className="link" onClick={() => onNavigate("My Applications")}>View all</button>
          </div>
          <div className="field-worker-compact-list">
            {applications.slice(0, 3).map((application) => (
              <article key={application.id}>
                <div>
                  <strong>{application.opportunity_title || application.project_title}</strong>
                  <p>{application.organization_name} · {dateLabel(application.created_at)}</p>
                </div>
                <span className={`field-worker-state ${statusTone(application.status)}`}>{human(application.status)}</span>
              </article>
            ))}
            {!applications.length && <div className="field-worker-empty compact"><FileCheck2 size={20} /><p>No applications yet. Your application history will appear here.</p></div>}
          </div>
        </section>

        <section className="field-worker-card">
          <div className="field-worker-card-heading">
            <div><span className="eyebrow">EARNINGS & PAYOUT</span><h3>Your PKR balance</h3></div>
            <WalletCards size={20} />
          </div>
          <div className="field-worker-money-grid">
            <div><small>Approved</small><strong>PKR {money(summary?.approved)}</strong></div>
            <div><small>Available</small><strong>PKR {money(summary?.available)}</strong></div>
            <div><small>Paid</small><strong>PKR {money(summary?.paid)}</strong></div>
            <div><small>Pending withdrawal</small><strong>PKR {money(summary?.pending_withdrawals)}</strong></div>
          </div>
          <div className="field-worker-card-actions">
            <button className="secondary" onClick={() => onNavigate("Workforce payables")}>Earnings detail</button>
            <button className="primary" onClick={() => onNavigate("E-Wallets & withdrawals")}>Wallet & withdrawal</button>
          </div>
        </section>

        <section className="field-worker-card">
          <div className="field-worker-card-heading">
            <div><span className="eyebrow">VERIFIED EXPERIENCE</span><h3>FieldLance work history</h3></div>
            <BadgeCheck size={20} />
          </div>
          <div className="field-worker-compact-list">
            {history.slice(0, 3).map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.project_title}</strong>
                  <p>{item.organization_name} · {item.role_title || "Field Surveyor"}</p>
                </div>
                <span className={`field-worker-state ${item.verified ? "success" : "info"}`}>{item.verified ? "Verified" : human(item.workflow_status)}</span>
              </article>
            ))}
            {!history.length && <div className="field-worker-empty compact"><History size={20} /><p>Completed and reviewed FieldLance work will build your verified history automatically.</p></div>}
          </div>
          <button className="link" onClick={() => onNavigate("Work experience")}>Open verified work history <ArrowRight size={13} /></button>
        </section>

        <section className="field-worker-card field-worker-attention">
          <div className="field-worker-card-heading">
            <div><span className="eyebrow">ACCOUNT READINESS</span><h3>Stay ready for field work</h3></div>
            <ShieldCheck size={20} />
          </div>
          <div className="field-worker-readiness-list">
            <button onClick={() => onNavigate("My profile")}><UserRound size={17} /><span><strong>Profile</strong><small>{completeness}% complete</small></span><ArrowRight size={14} /></button>
            <button onClick={() => onNavigate("Task Center")}><ClipboardList size={17} /><span><strong>Tasks</strong><small>Due work, SLA and escalations</small></span><ArrowRight size={14} /></button>
            <button onClick={() => onNavigate("Notifications")}><BellRing size={17} /><span><strong>Notifications</strong><small>{unread ? `${unread} unread` : "You're up to date"}</small></span><ArrowRight size={14} /></button>
            <button onClick={() => onNavigate("Private documents")}><ShieldCheck size={17} /><span><strong>Private documents</strong><small>Manage protected verification files</small></span><ArrowRight size={14} /></button>
            <button onClick={onField}><Sparkles size={17} /><span><strong>Offline field</strong><small>Drafts, queue and synchronization</small></span><ArrowRight size={14} /></button>
          </div>
        </section>
      </div>
    </section>
  );
}
