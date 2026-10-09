import { Building2, CalendarDays, ChevronLeft, UserRound } from "lucide-react";
import { Button, StatusBadge, type SemanticTone } from "../../components/ui/FieldLanceUI";

export type ProjectLifecycleStage = "setup" | "recruitment" | "field-delivery" | "review" | "completion";

export type ProjectWorkspaceIdentity = {
  title: string;
  status?: string | null;
  organizationId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  recruitmentStatus?: string | null;
  projectClosureState?: string | null;
  collectionClosedAt?: string | null;
  operationalCompletedAt?: string | null;
  fullyClosedAt?: string | null;
};

const lifecycle: readonly { id: ProjectLifecycleStage; label: string }[] = [
  { id: "setup", label: "Setup" },
  { id: "recruitment", label: "Recruitment" },
  { id: "field-delivery", label: "Field Delivery" },
  { id: "review", label: "Review" },
  { id: "completion", label: "Completion" },
];

function displayValue(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function projectStatusTone(status?: string | null): SemanticTone {
  if (status === "active") return "success";
  if (status === "closed") return "neutral";
  return "info";
}

function localCalendarDateKey(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function deriveProjectLifecycleStage(project: ProjectWorkspaceIdentity | null, today = localCalendarDateKey()): ProjectLifecycleStage | null {
  if (!project) return null;
  if (project.fullyClosedAt || project.projectClosureState === "fully_closed") return "completion";
  if (
    project.collectionClosedAt ||
    project.operationalCompletedAt ||
    project.status === "closed" ||
    ["collection_closed", "operational_completed", "financially_reconciled"].includes(project.projectClosureState || "")
  ) return "review";
  if (project.status === "active" && project.startDate && project.endDate && today >= project.startDate && today <= project.endDate) return "field-delivery";
  if (project.status === "active" && project.startDate && today < project.startDate && project.recruitmentStatus === "open") return "recruitment";
  if (project.status === "active" && project.startDate && today < project.startDate && project.recruitmentStatus === "closed") return "setup";
  return null;
}

export function ProjectLifecycleStrip({ stage }: { stage: ProjectLifecycleStage }) {
  const activeIndex = lifecycle.findIndex((item) => item.id === stage);
  return <div className="project-lifecycle" aria-label={`Project lifecycle: ${lifecycle[activeIndex]?.label || "current stage"}`}>
    <ol>
      {lifecycle.map((item, index) => {
        const state = index < activeIndex ? "complete" : index === activeIndex ? "current" : "upcoming";
        return <li key={item.id} className={state} aria-current={state === "current" ? "step" : undefined}>
          <span className="project-lifecycle-marker" aria-hidden="true">{index + 1}</span>
          <span>{item.label}</span>
        </li>;
      })}
    </ol>
  </div>;
}

export function ProjectWorkspaceHeader({
  project,
  organizationName,
  projectRole,
  lifecycleStage,
  navigating,
  onBack,
}: {
  project: ProjectWorkspaceIdentity;
  organizationName?: string | null;
  projectRole?: string | null;
  lifecycleStage?: ProjectLifecycleStage | null;
  navigating?: boolean;
  onBack: () => void;
}) {
  return <>
    <header className="project-identity-header">
      <div className="project-identity-main">
        <div className="project-identity-title-row">
          <h2 title={project.title}>{project.title}</h2>
          {project.status && <StatusBadge tone={projectStatusTone(project.status)}>{displayValue(project.status)}</StatusBadge>}
        </div>
        <div className="project-identity-meta" aria-label="Project details">
          {organizationName && <span><Building2 size={15} aria-hidden="true" />{organizationName}</span>}
          {(project.startDate || project.endDate) && <span><CalendarDays size={15} aria-hidden="true" />{project.startDate || "—"} → {project.endDate || "—"}</span>}
          {projectRole && <span><UserRound size={15} aria-hidden="true" />{displayValue(projectRole)}</span>}
        </div>
      </div>
      <Button variant="secondary" disabled={navigating} onClick={onBack} className="project-identity-back">
        <ChevronLeft size={17} aria-hidden="true" />
        Back to projects
      </Button>
    </header>
    {lifecycleStage && <ProjectLifecycleStrip stage={lifecycleStage} />}
  </>;
}
