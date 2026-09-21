import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, ClipboardCheck, Coins, MapPin, Users } from "lucide-react";
import { db, rpc } from "../../lib/supabase/client";
import type { Database } from "../../lib/supabase/database.types";
import { geographyPath, type Geo } from "../geography/model";
import { Badge, human } from "../../shared/ui/FormFields";

type Project = Database["public"]["Tables"]["survey_projects"]["Row"];
type StaffRow = { id: string; user_id: string; name: string | null; role: string; status: string };
type FundingAssurance = { reserved_balance: number; pending_offer_commitment: number; active_assignment_commitment: number; coverage_available: number; shortfall: number; paid_offer_gate: boolean; project_closure_state: string };
type Summary = {
  project: Project | null;
  submitted: number;
  approved: number;
  correction: number;
  rejected: number;
  activeAssignments: number | null;
  openOpportunities: number | null;
  applications: number | null;
  cases: number | null;
  staff: StaffRow[];
  funding: FundingAssurance | null;
};

const empty: Summary = { project: null, submitted: 0, approved: 0, correction: 0, rejected: 0, activeAssignments: null, openOpportunities: null, applications: null, cases: null, staff: [], funding: null };

export function ProjectOverview({
  projectId,
  geographies,
  canManageProject,
  canManageFinance,
  onOpenTab,
}: {
  projectId: string;
  geographies: Geo[];
  canManageProject: boolean;
  canManageFinance: boolean;
  onOpenTab: (tab: "team" | "recruitment" | "field-work" | "responses" | "cases" | "finance" | "governance" | "documents" | "activity") => void;
}) {
  const [summary, setSummary] = useState<Summary>(empty);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setBusy(true);
    setError("");
    (async () => {
      const project = await db!.from("survey_projects").select("*").eq("id", projectId).single();
      if (project.error) throw project.error;
      const responseCounts = await Promise.all(["submitted", "approved", "correction_required", "rejected"].map((status) =>
        db!.from("survey_responses").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("status", status),
      ));
      for (const result of responseCounts) if (result.error) throw result.error;
      const staff = await rpc("project_staff_roster", { p_project: projectId }) as unknown as StaffRow[];

      let activeAssignments: number | null = null;
      let openOpportunities: number | null = null;
      let applications: number | null = null;
      let cases: number | null = null;
      if (canManageProject) {
        const managed = await Promise.all([
          db!.from("work_assignments").select("id", { count: "exact", head: true }).eq("survey_project_id", projectId).in("status", ["offered", "active"]),
          db!.from("work_opportunities").select("id", { count: "exact", head: true }).eq("survey_project_id", projectId).eq("status", "open"),
          db!.from("work_applications").select("id", { count: "exact", head: true }).eq("survey_project_id", projectId).in("status", ["pending", "shortlisted"]),
          db!.from("beneficiary_cases").select("id", { count: "exact", head: true }).eq("project_id", projectId).neq("status", "closed"),
        ]);
        for (const result of managed) if (result.error) throw result.error;
        activeAssignments = managed[0].count || 0;
        openOpportunities = managed[1].count || 0;
        applications = managed[2].count || 0;
        cases = managed[3].count || 0;
      }

      let funding: FundingAssurance | null = null;
      if (canManageFinance) {
        funding = await rpc("project_funding_assurance", { p_project: projectId, p_currency: project.data.compensation_currency }) as unknown as FundingAssurance;
      }

      if (!live) return;
      setSummary({
        project: project.data,
        submitted: responseCounts[0].count || 0,
        approved: responseCounts[1].count || 0,
        correction: responseCounts[2].count || 0,
        rejected: responseCounts[3].count || 0,
        activeAssignments,
        openOpportunities,
        applications,
        cases,
        staff: staff || [],
        funding,
      });
    })().catch((e) => live && setError((e as Error).message)).finally(() => live && setBusy(false));
    return () => { live = false; };
  }, [projectId, canManageProject, canManageFinance]);

  const project = summary.project;
  const completion = project?.target ? Math.min(100, Math.round((summary.approved / project.target) * 100)) : 0;
  const area = useMemo(() => project ? geographyPath(project.geography_id, geographies).map((item) => item.name).join(" / ") : "", [project, geographies]);
  const nextAction = summary.submitted > 0
    ? { title: `${summary.submitted} response${summary.submitted === 1 ? "" : "s"} awaiting review`, copy: "Clear the review queue before it becomes a delivery bottleneck.", tab: "responses" as const, label: "Review responses" }
    : project?.recruitment_status === "open" && canManageProject && (project.required_volunteers || 0) > (summary.activeAssignments || 0)
      ? { title: "Recruitment is open", copy: "Review applications and convert suitable candidates into formal assignments.", tab: "recruitment" as const, label: "Open recruitment" }
      : project?.status === "active" && summary.approved < (project?.target || 0)
        ? { title: "Field collection remains active", copy: "Continue collection and monitor assigned Field Workers against the response target.", tab: "field-work" as const, label: "Open field work" }
        : { title: "Review project controls", copy: "Check governance, documents and closure readiness before the project is finalized.", tab: "governance" as const, label: "Review governance" };

  return (
    <section className="project-overview" aria-label="Project overview">
      {error && <p className="notice error" role="alert">{error}</p>}
      {busy && <p role="status">Loading project overview…</p>}
      {project && <>
        <section className="project-command-card">
          <div>
            <span className="eyebrow">DELIVERY STATUS</span>
            <div className="project-command-title"><h2>{project.title}</h2><Badge value={project.status} /></div>
            <p>{project.purpose}</p>
            <div className="project-command-meta">
              <span><CalendarDays size={15}/>{project.start_date} → {project.end_date}</span>
              <span><MapPin size={15}/>{area || "Project area"}</span>
              <span><Users size={15}/>{human(project.work_mode)} · {human(project.compensation_type)}</span>
            </div>
          </div>
          <div className="project-progress-card">
            <span>{completion}%</span>
            <strong>{summary.approved.toLocaleString()} / {project.target.toLocaleString()}</strong>
            <small>approved responses</small>
            <progress max={project.target || 1} value={summary.approved}/>
          </div>
        </section>

        <div className="project-metric-grid">
          <button type="button" className="project-metric" onClick={() => onOpenTab("responses")}><ClipboardCheck/><span><small>Pending review</small><strong>{summary.submitted}</strong><em>{summary.correction} need correction</em></span></button>
          <button type="button" className="project-metric" onClick={() => onOpenTab("team")}><Users/><span><small>Project staff</small><strong>{summary.staff.filter((row) => row.status === "active").length}</strong><em>current visible roster</em></span></button>
          {canManageProject && <button type="button" className="project-metric" onClick={() => onOpenTab("field-work")}><MapPin/><span><small>Field assignments</small><strong>{summary.activeAssignments ?? 0}</strong><em>offered or active</em></span></button>}
          {canManageProject && <button type="button" className="project-metric" onClick={() => onOpenTab("recruitment")}><Users/><span><small>Recruitment</small><strong>{summary.applications ?? 0}</strong><em>{summary.openOpportunities ?? 0} open opportunities</em></span></button>}
          {canManageProject && <button type="button" className="project-metric" onClick={() => onOpenTab("cases")}><ClipboardCheck/><span><small>Open cases</small><strong>{summary.cases ?? 0}</strong><em>project-scoped impact work</em></span></button>}
          {canManageFinance && <button type="button" className="project-metric" onClick={() => onOpenTab("finance")}><Coins/><span><small>Funding coverage</small><strong>{summary.funding?.shortfall ? "Attention" : "Covered"}</strong><em>{summary.funding ? `${project.compensation_currency} ${Number(summary.funding.coverage_available || 0).toLocaleString()} available` : "Loading finance"}</em></span></button>}
        </div>

        <section className="project-next-action">
          <div><span className="eyebrow">NEXT ACTION</span><h3>{nextAction.title}</h3><p>{nextAction.copy}</p></div>
          <button type="button" className="primary" onClick={() => onOpenTab(nextAction.tab)}>{nextAction.label}<ArrowRight size={16}/></button>
        </section>

        <div className="project-overview-columns">
          <section className="project-overview-card"><h3>Response health</h3><dl><div><dt>Approved</dt><dd>{summary.approved}</dd></div><div><dt>Pending review</dt><dd>{summary.submitted}</dd></div><div><dt>Correction required</dt><dd>{summary.correction}</dd></div><div><dt>Rejected</dt><dd>{summary.rejected}</dd></div></dl><button className="link" type="button" onClick={() => onOpenTab("responses")}>Open response queue →</button></section>
          <section className="project-overview-card"><h3>Project controls</h3><dl><div><dt>Recruitment</dt><dd>{human(project.recruitment_status)}</dd></div><div><dt>Required Field Workers</dt><dd>{project.required_volunteers ?? "Not set"}</dd></div><div><dt>Governance</dt><dd>Policy v{project.governance_version}</dd></div><div><dt>Closure</dt><dd>{human(project.project_closure_state)}</dd></div></dl><div className="project-card-links"><button className="link" type="button" onClick={() => onOpenTab("governance")}>Governance</button><button className="link" type="button" onClick={() => onOpenTab("documents")}>Documents</button>{canManageProject && <button className="link" type="button" onClick={() => onOpenTab("activity")}>Activity</button>}</div></section>
        </div>
      </>}
    </section>
  );
}
