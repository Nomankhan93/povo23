export type RouteEntityKind = "opportunity" | "application" | "assignment" | "case" | "response" | "attendance_session" | "task" | null;

export type AppRoute = {
  kind: "root" | "personal" | "organization" | "staff" | "project" | "onboarding" | "access" | "reset" | "auth_callback" | "verify" | "unknown";
  scopeHint: string | null;
  page: string | null;
  organizationId: string | null;
  projectId: string | null;
  projectTab: string | null;
  entityKind: RouteEntityKind;
  entityId: string | null;
};

const pageToSlug: Readonly<Record<string, string>> = {
  Overview: "home",
  "Task Center": "tasks",
  "My profile": "profile",
  "Work experience": "work-history",
  "Reputation & Certificates": "reputation",
  "Private documents": "private-documents",
  "Available Opportunities": "opportunities",
  "My Applications": "applications",
  "My Assigned Surveys": "field",
  "My Attendance": "attendance",
  "My Timesheets": "timesheets",
  "My Field Map": "map",
  "My Schedule": "schedule",
  "My Availability": "availability",
  "My Cases": "cases",
  "My Follow-ups": "follow-ups",
  Invitations: "invitations",
  "Workforce payables": "earnings",
  "E-Wallets & withdrawals": "wallet",
  "Partner NGO application": "organization-application",
  "NGO applications": "organization-applications",
  "Partner NGOs": "organizations",
  Volunteers: "field-workers",
  "Organization Settings": "organization-settings",
  "Survey projects": "projects",
  "Project team": "team",
  "Workforce marketplace": "recruitment",
  Recruitment: "recruitment",
  "Survey templates": "survey-templates",
  Verification: "verification",
  "Survey review": "survey-review",
  "Project governance": "governance",
  "Canonical registry": "beneficiary-registry",
  "Beneficiary cases": "cases",
  "Assistance ledger": "assistance",
  "Data sharing": "data-sharing",
  "Project funding": "project-finance",
  "Withdrawal operations": "payouts",
  "E-Wallet sandbox": "wallet-sandbox",
  Memberships: "memberships",
  Accounts: "accounts",
  Geography: "geography",
  Notifications: "notifications",
  Activity: "activity",
  "Reports & Analytics": "reports",
  "Access status": "access",
};

const slugToPage = Object.fromEntries(Object.entries(pageToSlug).map(([page, slug]) => [slug, page])) as Record<string, string>;
const projectTabs = new Set(["reports", "overview", "team", "recruitment", "field-work", "map", "responses", "cases", "finance", "governance", "documents", "activity"]);

const unknownRoute = (): AppRoute => ({kind:"unknown",scopeHint:null,page:null,organizationId:null,projectId:null,projectTab:null,entityKind:null,entityId:null});

function clean(pathname: string) {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
}

function genericRoute(kind: AppRoute["kind"], scopeHint: string | null, organizationId: string | null, slug: string | undefined, entity?: string): AppRoute {
  let page = slug ? slugToPage[slug] || null : "Overview";
  if (!page) return unknownRoute();
  if(slug === "recruitment" && (kind === "organization" || kind === "staff")) page="Workforce marketplace";
  if(slug === "recruitment" && kind === "project") page="Recruitment";
  const entityKind: RouteEntityKind = page === "Beneficiary cases" && entity ? "case" : page === "Task Center" && entity ? "task" : null;
  if (entity && !entityKind) return unknownRoute();
  return {kind, scopeHint, page, organizationId, projectId:null, projectTab:null, entityKind, entityId:entityKind ? entity || null : null};
}

function projectRoute(kind: AppRoute["kind"], scopeHint: string, organizationId: string | null, projectId: string, rest: string[]): AppRoute {
  const tab = rest[0] || "overview";
  if (!projectTabs.has(tab)) return unknownRoute();
  let entityKind: RouteEntityKind = null;
  let entityId: string | null = null;
  let valid = rest.length <= 1;
  if (tab === "recruitment" && rest.length === 4 && rest[1] === "opportunities" && rest[2] && rest[3] === "applications") { entityKind = "opportunity"; entityId = rest[2]; valid = true; }
  if (tab === "recruitment" && rest.length === 3 && rest[1] === "opportunities" && rest[2]) { entityKind = "opportunity"; entityId = rest[2]; valid = true; }
  if (tab === "cases" && rest.length === 2 && rest[1]) { entityKind = "case"; entityId = rest[1]; valid = true; }
  if (tab === "responses" && rest.length === 2 && rest[1]) { entityKind = "response"; entityId = rest[1]; valid = true; }
  if (tab === "field-work" && rest.length === 3 && rest[1] === "assignments" && rest[2]) { entityKind = "assignment"; entityId = rest[2]; valid = true; }
  if (tab === "recruitment" && rest.length === 3 && rest[1] === "applications" && rest[2]) { entityKind = "application"; entityId = rest[2]; valid = true; }
  if (tab === "recruitment" && rest.length === 3 && rest[1] === "assignments" && rest[2]) { entityKind = "assignment"; entityId = rest[2]; valid = true; }
  if (!valid) return unknownRoute();
  return {kind, scopeHint, page:"Project workspace", organizationId, projectId, projectTab:tab, entityKind, entityId};
}

export function parseAppRoute(pathname = location.pathname): AppRoute {
  let parts:string[];
  try { parts=clean(pathname); } catch { return unknownRoute(); }
  if (!parts.length) return {kind:"root",scopeHint:null,page:null,organizationId:null,projectId:null,projectTab:null,entityKind:null,entityId:null};
  if (parts[0] === "reset") return parts.length === 1 ? {kind:"reset",scopeHint:null,page:null,organizationId:null,projectId:null,projectTab:null,entityKind:null,entityId:null} : unknownRoute();
  if (parts[0] === "access") return parts.length === 1 ? {kind:"access",scopeHint:"access",page:"Access status",organizationId:null,projectId:null,projectTab:null,entityKind:null,entityId:null} : unknownRoute();
  if (parts[0] === "auth" && parts[1] === "callback") return parts.length === 2 ? {kind:"auth_callback",scopeHint:null,page:null,organizationId:null,projectId:null,projectTab:null,entityKind:null,entityId:null} : unknownRoute();
  if (parts[0] === "verify") return parts.length <= 2 ? {kind:"verify",scopeHint:null,page:null,organizationId:null,projectId:null,projectTab:null,entityKind:null,entityId:parts[1]||null} : unknownRoute();
  if (parts[0] === "onboarding" && parts[1] === "organization") return parts.length === 2 ? {kind:"onboarding",scopeHint:"onboarding",page:"Partner NGO application",organizationId:null,projectId:null,projectTab:null,entityKind:null,entityId:null} : unknownRoute();
  if (parts[0] === "app") {
    if (parts.length === 1) return genericRoute("personal","personal",null,undefined);
    if (parts[1] === "work" && parts[2] === "opportunities") return parts.length === 3 ? {kind:"personal",scopeHint:"personal",page:"Available Opportunities",organizationId:null,projectId:null,projectTab:null,entityKind:null,entityId:null} : unknownRoute();
    if (parts[1] === "work" && parts[2] === "applications") return parts.length === 3 || parts.length === 4 ? {kind:"personal",scopeHint:"personal",page:"My Applications",organizationId:null,projectId:null,projectTab:null,entityKind:parts[3]?"application":null,entityId:parts[3]||null} : unknownRoute();
    if (parts[1] === "work" && parts[2] === "assignments" && parts[3] && parts[4] === "attendance") return parts.length === 5 ? {kind:"personal",scopeHint:"personal",page:"My Attendance",organizationId:null,projectId:null,projectTab:null,entityKind:"assignment",entityId:parts[3]} : unknownRoute();
    if (parts[1] === "work" && parts[2] === "assignments") return parts.length === 3 || parts.length === 4 ? {kind:"personal",scopeHint:"personal",page:"My Assigned Surveys",organizationId:null,projectId:null,projectTab:null,entityKind:parts[3]?"assignment":null,entityId:parts[3]||null} : unknownRoute();
    if (parts[1] === "work" && parts[2] === "schedule") return parts.length === 3 ? {kind:"personal",scopeHint:"personal",page:"My Schedule",organizationId:null,projectId:null,projectTab:null,entityKind:null,entityId:null} : unknownRoute();
    if (parts[1] === "work" && parts[2] === "availability") return parts.length === 3 ? {kind:"personal",scopeHint:"personal",page:"My Availability",organizationId:null,projectId:null,projectTab:null,entityKind:null,entityId:null} : unknownRoute();
    if (parts[1] === "field" && parts[2] === "projects" && parts[3] && parts[4] === "work") return parts.length === 5 ? {kind:"personal",scopeHint:"personal",page:"Survey projects",organizationId:null,projectId:parts[3],projectTab:"field-work",entityKind:null,entityId:null} : unknownRoute();
    if (parts[1] === "field" && parts[2] === "projects" && parts[3] && parts[4] === "responses") return parts.length === 5 || parts.length === 6 ? {kind:"personal",scopeHint:"personal",page:"Survey projects",organizationId:null,projectId:parts[3],projectTab:null,entityKind:parts[5]?"response":null,entityId:parts[5]||null} : unknownRoute();
    if (parts[1] === "field" && parts[2] === "attendance") return parts.length === 3 || parts.length === 4 ? {kind:"personal",scopeHint:"personal",page:"My Attendance",organizationId:null,projectId:null,projectTab:null,entityKind:parts[3]?"attendance_session":null,entityId:parts[3]||null} : unknownRoute();
    if (parts[1] === "field" && parts[2] === "cases") return parts.length === 3 || parts.length === 4 ? {kind:"personal",scopeHint:"personal",page:"My Cases",organizationId:null,projectId:null,projectTab:null,entityKind:parts[3]?"case":null,entityId:parts[3]||null} : unknownRoute();
    if (parts[1] === "field" && parts[2] === "follow-ups") return parts.length === 3 ? {kind:"personal",scopeHint:"personal",page:"My Follow-ups",organizationId:null,projectId:null,projectTab:null,entityKind:null,entityId:null} : unknownRoute();
    if (parts[1] === "field" && parts[2] === "timesheets") return parts.length === 3 ? {kind:"personal",scopeHint:"personal",page:"My Timesheets",organizationId:null,projectId:null,projectTab:null,entityKind:null,entityId:null} : unknownRoute();
    if (parts[1] === "field" && parts[2] === "map") return parts.length === 3 ? {kind:"personal",scopeHint:"personal",page:"My Field Map",organizationId:null,projectId:null,projectTab:null,entityKind:null,entityId:null} : unknownRoute();
    if (parts[1] === "field") return parts.length === 2 ? {kind:"personal",scopeHint:"personal",page:"My Assigned Surveys",organizationId:null,projectId:null,projectTab:null,entityKind:null,entityId:null} : unknownRoute();
    if (parts.length > 3) return unknownRoute();
    return genericRoute("personal","personal",null,parts[1],parts[2]);
  }
  if (parts[0] === "org" && parts[1]) {
    const organizationId = parts[1];
    if (parts.length === 2) return genericRoute("organization",organizationId,organizationId,undefined);
    if (parts[2] === "projects" && parts[3]) return projectRoute("organization",organizationId,organizationId,parts[3],parts.slice(4));
    if (parts[2] === "recruitment" && parts[3] === "opportunities" && parts[4]) {
      const valid = parts.length === 5 || (parts.length === 6 && parts[5] === "applications");
      return valid ? {kind:"organization",scopeHint:organizationId,page:"Workforce marketplace",organizationId,projectId:null,projectTab:null,entityKind:"opportunity",entityId:parts[4]} : unknownRoute();
    }
    if (parts[2] === "recruitment" && ["applications","assignments"].includes(parts[3]||"") && parts[4]) return parts.length === 5 ? {kind:"organization",scopeHint:organizationId,page:"Workforce marketplace",organizationId,projectId:null,projectTab:null,entityKind:parts[3]==="applications"?"application":"assignment",entityId:parts[4]} : unknownRoute();
    if (parts.length > 4) return unknownRoute();
    return genericRoute("organization",organizationId,organizationId,parts[2],parts[3]);
  }
  if (parts[0] === "staff") {
    if (parts.length === 1) return genericRoute("staff","poem",null,undefined);
    if (parts[1] === "projects" && parts[2]) return projectRoute("staff","poem",null,parts[2],parts.slice(3));
    if (parts[1] === "recruitment" && parts[2] === "opportunities" && parts[3]) {
      const valid = parts.length === 4 || (parts.length === 5 && parts[4] === "applications");
      return valid ? {kind:"staff",scopeHint:"poem",page:"Workforce marketplace",organizationId:null,projectId:null,projectTab:null,entityKind:"opportunity",entityId:parts[3]} : unknownRoute();
    }
    if (parts[1] === "recruitment" && ["applications","assignments"].includes(parts[2]||"") && parts[3]) return parts.length === 4 ? {kind:"staff",scopeHint:"poem",page:"Workforce marketplace",organizationId:null,projectId:null,projectTab:null,entityKind:parts[2]==="applications"?"application":"assignment",entityId:parts[3]} : unknownRoute();
    if (parts.length > 3) return unknownRoute();
    return genericRoute("staff","poem",null,parts[1],parts[2]);
  }
  if (parts[0] === "projects" && parts[1]) return projectRoute("project",`project:${parts[1]}`,null,parts[1],parts.slice(2));
  if (parts[0] === "project" && parts[1]) {
    if (parts.length === 2) return genericRoute("project",`project:${parts[1]}`,null,undefined);
    if (parts[2] === "recruitment" && ["applications","assignments"].includes(parts[3]||"") && parts[4]) return parts.length === 5 ? {kind:"project",scopeHint:`project:${parts[1]}`,page:"Recruitment",organizationId:null,projectId:null,projectTab:null,entityKind:parts[3]==="applications"?"application":"assignment",entityId:parts[4]} : unknownRoute();
    if (parts.length > 4) return unknownRoute();
    return genericRoute("project",`project:${parts[1]}`,null,parts[2],parts[3]);
  }
  return unknownRoute();
}

export type RouteTarget = {
  scope: string;
  page: string;
  projectId?: string | null;
  projectTab?: string | null;
  entityKind?: RouteEntityKind;
  entityId?: string | null;
};

function pageSlug(page: string) { return pageToSlug[page] || page.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""); }

function projectSuffix(tab = "overview", entityKind: RouteEntityKind = null, entityId: string | null = null) {
  if (tab === "recruitment" && entityKind === "opportunity" && entityId) return "/recruitment/opportunities/"+encodeURIComponent(entityId)+"/applications";
  if (tab === "cases" && entityKind === "case" && entityId) return `/cases/${encodeURIComponent(entityId)}`;
  if (tab === "responses" && entityKind === "response" && entityId) return `/responses/${encodeURIComponent(entityId)}`;
  if (tab === "field-work" && entityKind === "assignment" && entityId) return `/field-work/assignments/${encodeURIComponent(entityId)}`;
  if (tab === "recruitment" && entityKind === "application" && entityId) return `/recruitment/applications/${encodeURIComponent(entityId)}`;
  if (tab === "recruitment" && entityKind === "assignment" && entityId) return `/recruitment/assignments/${encodeURIComponent(entityId)}`;
  return `/${encodeURIComponent(tab)}`;
}

export function routePath(target: RouteTarget): string {
  const {scope,page,projectId,projectTab="overview",entityKind=null,entityId=null}=target;
  if (scope === "access") return "/access";
  if (scope === "onboarding") return "/onboarding/organization";
  if (projectId) {
    const suffix=projectSuffix(projectTab || "overview",entityKind,entityId);
    if (scope === "poem") return `/staff/projects/${encodeURIComponent(projectId)}${suffix}`;
    if (scope.startsWith("project:")) return `/projects/${encodeURIComponent(projectId)}${suffix}`;
    if (scope !== "personal") return `/org/${encodeURIComponent(scope)}/projects/${encodeURIComponent(projectId)}${suffix}`;
  }
  if (scope.startsWith("project:")) {
    const scopedProjectId=scope.slice("project:".length);
    if(page === "Project workspace") return `/projects/${encodeURIComponent(scopedProjectId)}/overview`;
    if(page === "Recruitment" && entityKind==="opportunity" && entityId) return "/projects/"+encodeURIComponent(scopedProjectId)+"/recruitment/opportunities/"+encodeURIComponent(entityId)+"/applications";
    if(page === "Recruitment" && entityId && (entityKind === "application" || entityKind === "assignment")) return `/project/${encodeURIComponent(scopedProjectId)}/recruitment/${entityKind === "application"?"applications":"assignments"}/${encodeURIComponent(entityId)}`;
    if(page === "Task Center" && entityKind === "task" && entityId) return `/project/${encodeURIComponent(scopedProjectId)}/tasks/${encodeURIComponent(entityId)}`;
    return `/project/${encodeURIComponent(scopedProjectId)}/${pageSlug(page)}` + (page === "Beneficiary cases" && entityKind === "case" && entityId ? `/${encodeURIComponent(entityId)}` : "");
  }
  if (scope === "personal") {
    if (page === "Available Opportunities") return "/app/work/opportunities";
    if (page === "My Applications") return entityKind === "application" && entityId ? `/app/work/applications/${encodeURIComponent(entityId)}` : "/app/work/applications";
    if (page === "My Assigned Surveys") return entityKind === "assignment" && entityId ? `/app/work/assignments/${encodeURIComponent(entityId)}` : "/app/field";
    if (page === "My Attendance" && entityKind === "attendance_session" && entityId) return `/app/field/attendance/${encodeURIComponent(entityId)}`;
    if (page === "My Attendance") return entityKind === "assignment" && entityId ? `/app/work/assignments/${encodeURIComponent(entityId)}/attendance` : "/app/field/attendance";
    if (page === "My Timesheets") return "/app/field/timesheets";
    if (page === "My Field Map") return "/app/field/map";
    if (page === "Survey projects" && projectId && projectTab === "field-work") return "/app/field/projects/"+encodeURIComponent(projectId)+"/work";
    if (page === "Survey projects" && projectId) return entityKind === "response" && entityId ? `/app/field/projects/${encodeURIComponent(projectId)}/responses/${encodeURIComponent(entityId)}` : `/app/field/projects/${encodeURIComponent(projectId)}/responses`;
    if (page === "My Schedule") return "/app/work/schedule";
    if (page === "My Availability") return "/app/work/availability";
    if (page === "My Cases") return entityKind === "case" && entityId ? `/app/field/cases/${encodeURIComponent(entityId)}` : "/app/field/cases";
    if (page === "My Follow-ups") return "/app/field/follow-ups";
    if (page === "Task Center" && entityKind === "task" && entityId) return `/app/tasks/${encodeURIComponent(entityId)}`;
    return `/app/${pageSlug(page)}`;
  }
  if (scope === "poem") {
    if(page === "Workforce marketplace" && entityKind==="opportunity" && entityId) return "/staff/recruitment/opportunities/"+encodeURIComponent(entityId)+"/applications";
    if(page === "Workforce marketplace" && entityId && (entityKind === "application" || entityKind === "assignment")) return `/staff/recruitment/${entityKind === "application"?"applications":"assignments"}/${encodeURIComponent(entityId)}`;
    if(page === "Task Center" && entityKind === "task" && entityId) return `/staff/tasks/${encodeURIComponent(entityId)}`;
    return `/staff/${pageSlug(page)}` + (page === "Beneficiary cases" && entityKind === "case" && entityId ? `/${encodeURIComponent(entityId)}` : "");
  }
  if(page === "Workforce marketplace" && entityKind==="opportunity" && entityId) return "/org/"+encodeURIComponent(scope)+"/recruitment/opportunities/"+encodeURIComponent(entityId)+"/applications";
  if(page === "Workforce marketplace" && entityId && (entityKind === "application" || entityKind === "assignment")) return `/org/${encodeURIComponent(scope)}/recruitment/${entityKind === "application"?"applications":"assignments"}/${encodeURIComponent(entityId)}`;
  if(page === "Task Center" && entityKind === "task" && entityId) return `/org/${encodeURIComponent(scope)}/tasks/${encodeURIComponent(entityId)}`;
  return `/org/${encodeURIComponent(scope)}/${pageSlug(page)}` + (page === "Beneficiary cases" && entityKind === "case" && entityId ? `/${encodeURIComponent(entityId)}` : "");
}

export function certificatePath(code = "") {
  return code ? `/verify/${encodeURIComponent(code)}` : "/verify";
}

export function writeRoute(target: RouteTarget, replace = false) {
  const path=routePath(target);
  if (location.pathname === path) return;
  const index=Number(history.state?.fieldlanceIndex||0);
  if (replace) history.replaceState({fieldlance:true,fieldlanceIndex:index},"",path);
  else history.pushState({fieldlance:true,fieldlanceIndex:index+1},"",path);
  window.dispatchEvent(new Event("fieldlance-route-written"));
}

export function isExplicitRoute(route: AppRoute) {
  return !["root","unknown","reset","auth_callback","verify"].includes(route.kind);
}
