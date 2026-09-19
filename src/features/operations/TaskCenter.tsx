import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, CircleDot, ClipboardList, Clock3, Plus, RefreshCw, UserCheck } from "lucide-react";
import { rpc } from "../../lib/supabase/client";
import { human } from "../../shared/ui/FormFields";

type Call = (name: string, args?: Record<string, unknown>) => Promise<unknown>;
const call = rpc as unknown as Call;

type TaskRow = {
  id: string;
  task_type: string;
  title: string;
  description: string;
  source_kind: string;
  source_ref: string;
  source_page: string;
  organization_id: string | null;
  project_id: string | null;
  assigned_to: string | null;
  assigned_role: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  status: "open" | "in_progress" | "completed" | "cancelled";
  due_at: string;
  escalation_level: number;
  version: number;
  created_at: string;
  updated_at: string;
  overdue: boolean;
  assignee_name: string | null;
  organization_name: string | null;
  project_title: string | null;
  sla_label: string;
};

type QueuePayload = { rows?: TaskRow[]; count?: number };
type View = "all" | "mine" | "team" | "due_today" | "overdue" | "escalated" | "completed";
type Mode = "personal" | "organization" | "staff" | "project";

type Props = {
  mode: Mode;
  organizationId?: string | null;
  projectId?: string | null;
  onNavigate: (page: string) => void;
  canCreate: boolean;
};

const dateTime = (value: string) => new Intl.DateTimeFormat("en-PK", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
const priorityOrder: Record<TaskRow["priority"], number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export function TaskCenter({ mode, organizationId = null, projectId = null, onNavigate, canCreate }: Props) {
  const [view, setView] = useState<View>(mode === "personal" ? "mine" : "team");
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    void (async () => {
      await call("refresh_operational_task_escalations", {});
      const payload = await call("operational_task_queue", {
        p_view: view,
        p_organization: organizationId,
        p_project: projectId,
        p_limit: 200,
      }) as QueuePayload;
      if (live) setRows(Array.isArray(payload?.rows) ? payload.rows : []);
    })().catch((cause) => {
      if (live) setError(cause instanceof Error ? cause.message : "Task Center could not be loaded.");
    }).finally(() => {
      if (live) setLoading(false);
    });
    return () => { live = false; };
  }, [organizationId, projectId, revision, view]);

  const metrics = useMemo(() => {
    const active = rows.filter((task) => ["open", "in_progress"].includes(task.status));
    return {
      active: active.length,
      overdue: active.filter((task) => task.overdue).length,
      escalated: active.filter((task) => task.escalation_level > 0).length,
      urgent: active.filter((task) => task.priority === "urgent").length,
    };
  }, [rows]);

  const ordered = useMemo(() => [...rows].sort((a, b) => {
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) return priorityOrder[a.priority] - priorityOrder[b.priority];
    return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
  }), [rows]);

  const act = async (task: TaskRow, action: string) => {
    setBusy(task.id + action);
    setError("");
    setNotice("");
    try {
      await call("update_operational_task", {
        p_id: task.id,
        p_version: task.version,
        p_action: action,
        p_priority: null,
        p_due_at: null,
        p_note: action === "complete" ? "Task marked complete in Task Center. Source workflow remains authoritative." : "",
      });
      setNotice(action === "complete" ? "Task completed. No source workflow decision was changed." : "Task updated.");
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Task update failed.");
    } finally {
      setBusy("");
    }
  };

  const createTask = async (form: HTMLFormElement) => {
    const data = new FormData(form);
    setBusy("create");
    setError("");
    setNotice("");
    try {
      await call("create_operational_task", {
        p_title: String(data.get("title") || ""),
        p_description: String(data.get("description") || ""),
        p_task_type: "manual",
        p_organization: organizationId,
        p_project: projectId,
        p_priority: String(data.get("priority") || "normal"),
        p_due_at: data.get("due_at") ? new Date(String(data.get("due_at"))).toISOString() : null,
        p_source_page: "Task Center",
        p_assign_to_me: Boolean(data.get("assign_to_me")),
      });
      form.reset();
      setCreateOpen(false);
      setNotice("Operational task created.");
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Task creation failed.");
    } finally {
      setBusy("");
    }
  };

  const tabs: Array<[View, string]> = mode === "personal"
    ? [["mine", "My Tasks"], ["due_today", "Due Today"], ["overdue", "Overdue"], ["escalated", "Escalated"], ["completed", "Completed"]]
    : [["team", "Team Tasks"], ["mine", "My Tasks"], ["due_today", "Due Today"], ["overdue", "Overdue"], ["escalated", "Escalated"], ["completed", "Completed"]];

  return <section className="task-center" aria-label="Tasks, SLA and Escalation Center">
    <section className="task-center-hero">
      <div><span className="eyebrow">TASKS · SLA · ESCALATIONS</span><h2>Turn operational queues into accountable action.</h2><p>Tasks point back to the authoritative workflow. Completing a task never approves a survey, organization, application, case or withdrawal by itself.</p></div>
      <div className="task-center-hero-actions">
        {canCreate && <button className="primary" onClick={() => setCreateOpen((value) => !value)}><Plus size={15} /> {createOpen ? "Close" : "Create task"}</button>}
        <button className="secondary" disabled={loading} onClick={() => setRevision((value) => value + 1)}><RefreshCw size={15} className={loading ? "task-center-spin" : ""} /> Refresh</button>
      </div>
    </section>

    {error && <div className="notice error" role="alert">{error}</div>}
    {notice && <div className="notice success" role="status">{notice}</div>}

    <section className="task-center-metrics">
      <Metric icon={<ClipboardList size={18} />} label="Active tasks" value={metrics.active} />
      <Metric icon={<Clock3 size={18} />} label="Overdue" value={metrics.overdue} />
      <Metric icon={<AlertTriangle size={18} />} label="Escalated" value={metrics.escalated} />
      <Metric icon={<CircleDot size={18} />} label="Urgent" value={metrics.urgent} />
    </section>

    {createOpen && canCreate && <form className="task-center-create" onSubmit={(event) => { event.preventDefault(); void createTask(event.currentTarget); }}>
      <div className="task-center-section-heading"><div><span className="eyebrow">MANUAL TASK</span><h3>Create operational follow-up</h3><p>Use manual tasks for coordination only. Source workflow decisions stay in their original module.</p></div></div>
      <div className="task-center-form-grid">
        <label className="field">Title<input name="title" minLength={3} maxLength={180} required /></label>
        <label className="field">Priority<select name="priority" defaultValue="normal"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
        <label className="field">Due date & time<input name="due_at" type="datetime-local" /></label>
        <label className="field task-center-checkbox"><span>Assignment</span><span><input name="assign_to_me" type="checkbox" /> Assign to me</span></label>
      </div>
      <label className="field">Description<textarea name="description" maxLength={4000} /></label>
      <button className="primary" disabled={busy === "create"}>{busy === "create" ? "Creating…" : "Create task"}</button>
    </form>}

    <nav className="task-center-tabs" aria-label="Task queue views">
      {tabs.map(([key, label]) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}>{label}</button>)}
    </nav>

    <section className="task-center-list">
      {loading && <p className="task-center-loading">Loading authorized tasks…</p>}
      {!loading && ordered.map((task) => <article className={`task-center-card ${task.overdue ? "overdue" : ""}`} key={task.id}>
        <div className="task-center-card-top">
          <div><span className="eyebrow">{task.sla_label || human(task.task_type)}</span><h3>{task.title}</h3><p>{task.description || "Operational follow-up"}</p></div>
          <div className="task-center-badges"><span className={`task-priority ${task.priority}`}>{human(task.priority)}</span><span className={`task-status ${task.status}`}>{human(task.status)}</span>{task.escalation_level > 0 && <span className="task-escalation">Escalation L{task.escalation_level}</span>}</div>
        </div>
        <div className="task-center-meta-grid">
          <Meta icon={<CalendarClock size={14} />} label={task.overdue ? "Overdue since" : "Due"} value={dateTime(task.due_at)} />
          <Meta icon={<UserCheck size={14} />} label="Assigned" value={task.assignee_name || task.assigned_role || "Unassigned team queue"} />
          <Meta icon={<CircleDot size={14} />} label="Organization" value={task.organization_name || "FieldLance"} />
          <Meta icon={<ClipboardList size={14} />} label="Project" value={task.project_title || "—"} />
        </div>
        <div className="task-center-card-actions">
          {task.source_page !== "Task Center" && <button className="secondary" onClick={() => onNavigate(task.source_page)}>Open source <ArrowRight size={13} /></button>}
          {!task.assigned_to && ["open", "in_progress"].includes(task.status) && <button className="secondary" disabled={Boolean(busy)} onClick={() => void act(task, "assign_to_me")}>Assign to me</button>}
          {task.status === "open" && <button className="secondary" disabled={Boolean(busy)} onClick={() => void act(task, "start")}>Start</button>}
          {["open", "in_progress"].includes(task.status) && <button className="primary" disabled={Boolean(busy)} onClick={() => void act(task, "complete")}><CheckCircle2 size={14} /> Complete task</button>}
          {task.status === "completed" && mode !== "personal" && <button className="secondary" disabled={Boolean(busy)} onClick={() => void act(task, "reopen")}>Reopen</button>}
        </div>
      </article>)}
      {!loading && !ordered.length && <div className="task-center-empty"><CheckCircle2 size={24} /><h3>No tasks in this view</h3><p>When an authorized workflow needs action, FieldLance will surface it here with its SLA and source link.</p></div>}
    </section>
  </section>;
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return <article className="task-center-metric"><span>{icon}</span><div><strong>{value}</strong><small>{label}</small></div></article>;
}

function Meta({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="task-center-meta"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}
