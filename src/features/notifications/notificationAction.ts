import { db, rpc } from "../../lib/supabase/client";
import type { RouteEntityKind, RouteTarget } from "../../app/routes";
import type { Database } from "../../lib/supabase/database.types";

type Row = Database["public"]["Tables"]["notifications"]["Row"];
export type NotificationCenterMode = "personal" | "organization" | "project" | "staff";

type Context = {
  mode: NotificationCenterMode;
  currentScope: string;
  organizationId?: string | null;
  projectId?: string | null;
};

const personalPages = new Set([
  "Available Opportunities",
  "My Applications",
  "My Assigned Surveys",
  "My Attendance",
  "My Timesheets",
  "My Field Map",
  "My Cases",
  "My Follow-ups",
  "My Schedule",
  "My Availability",
  "Workforce payables",
  "E-Wallets & withdrawals",
  "My profile",
  "Private documents",
  "Work experience",
  "Reputation & Certificates",
]);

function normalizedSourceKind(value: string | null) {
  if (!value) return null;
  if (["application", "work_application"].includes(value)) return "work_application";
  if (["assignment", "work_assignment"].includes(value)) return "work_assignment";
  if (["response", "survey_response"].includes(value)) return "survey_response";
  if (["case", "beneficiary_case"].includes(value)) return "beneficiary_case";
  if (["task", "operational_task"].includes(value)) return "operational_task";
  return value;
}

function exactEntity(kind: string | null): RouteEntityKind {
  if (kind === "work_application") return "application";
  if (kind === "work_assignment" || kind === "attendance") return "assignment";
  if (kind === "survey_response") return "response";
  if (kind === "beneficiary_case") return "case";
  if (kind === "operational_task") return "task";
  return null;
}

function defaultPage(kind: string | null, mode: NotificationCenterMode) {
  if (kind === "work_application") return mode === "personal" ? "My Applications" : mode === "project" ? "Recruitment" : "Workforce marketplace";
  if (kind === "work_assignment") return mode === "personal" ? "My Assigned Surveys" : mode === "project" ? "Recruitment" : "Workforce marketplace";
  if (kind === "attendance") return "My Attendance";
  if (kind === "survey_response") return mode === "personal" ? "Survey projects" : "Project workspace";
  if (kind === "beneficiary_case") return mode === "personal" ? "My Cases" : "Beneficiary cases";
  if (kind === "operational_task") return "Task Center";
  return null;
}

function targetScope(page: string, context: Context, row: Row) {
  if (personalPages.has(page)) return "personal";
  if (context.mode === "personal" && ["Task Center", "Survey projects"].includes(page)) return "personal";
  if (context.mode === "staff") return "poem";
  if (page === "Recruitment" && row.project_id) return `project:${row.project_id}`;
  if (context.mode === "project" && row.project_id) return `project:${row.project_id}`;
  if (context.mode === "project" && context.projectId) return `project:${context.projectId}`;
  if (context.mode === "organization" && row.organization_id) return row.organization_id;
  if (context.mode === "organization" && context.organizationId) return context.organizationId;
  if (row.project_id && page === "Project workspace") return `project:${row.project_id}`;
  if (row.organization_id && ["Workforce marketplace", "Beneficiary cases", "Survey projects", "Task Center"].includes(page)) return row.organization_id;
  return context.currentScope;
}

export function notificationActionTarget(row: Row, context: Context): RouteTarget | null {
  const kind = normalizedSourceKind(row.source_kind);
  const entityKind = exactEntity(kind);
  const page = row.action_page || defaultPage(kind, context.mode);
  if (!page) return null;

  const scope = targetScope(page, context, row);
  const sourceRef = row.source_ref || null;

  if (kind === "survey_response" && sourceRef && row.project_id) {
    if (scope === "personal") return { scope, page: "Survey projects", projectId: row.project_id, entityKind: "response", entityId: sourceRef };
    return { scope, page: "Project workspace", projectId: row.project_id, projectTab: "responses", entityKind: "response", entityId: sourceRef };
  }

  const scopedProjectId = row.project_id || context.projectId || null;
  if (scope.startsWith("project:") && scopedProjectId && entityKind && sourceRef) {
    if (entityKind === "application" || entityKind === "assignment") {
      return { scope, page: "Project workspace", projectId: scopedProjectId, projectTab: "recruitment", entityKind, entityId: sourceRef };
    }
    if (entityKind === "case") return { scope, page: "Project workspace", projectId: scopedProjectId, projectTab: "cases", entityKind, entityId: sourceRef };
  }

  return {
    scope,
    page,
    entityKind: entityKind && sourceRef ? entityKind : null,
    entityId: entityKind && sourceRef ? sourceRef : null,
  };
}

export async function notificationSourceVisible(row: Row): Promise<boolean> {
  const kind = normalizedSourceKind(row.source_kind);
  const ref = row.source_ref;
  if (!kind || !ref) return true;
  if (!db && kind !== "beneficiary_case") return false;

  if (kind === "work_application") {
    const result = await db!.from("work_applications").select("id").eq("id", ref).maybeSingle();
    if (result.error) throw result.error;
    return Boolean(result.data?.id);
  }
  if (kind === "work_assignment" || kind === "attendance") {
    const result = await db!.from("work_assignments").select("id").eq("id", ref).maybeSingle();
    if (result.error) throw result.error;
    return Boolean(result.data?.id);
  }
  if (kind === "survey_response") {
    const result = await db!.from("survey_responses").select("id").eq("id", ref).maybeSingle();
    if (result.error) throw result.error;
    return Boolean(result.data?.id);
  }
  if (kind === "beneficiary_case") {
    if (db) {
      const result = await db.from("beneficiary_cases").select("id").eq("id", ref).maybeSingle();
      if (result.error) throw result.error;
      if (result.data?.id) return true;
    }
    const delegated = await rpc("my_delegated_case_detail", { p_case: ref }) as Record<string, unknown> | null;
    return Boolean(delegated && Object.keys(delegated).length);
  }
  if (kind === "operational_task") {
    const result = await db!.from("operational_tasks").select("id").eq("id", ref).maybeSingle();
    if (result.error) throw result.error;
    return Boolean(result.data?.id);
  }
  return true;
}
