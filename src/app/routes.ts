export type RouteEntityKind = "application" | "assignment" | "case" | null;

export type AppRoute = {
  kind: "root" | "personal" | "organization" | "staff" | "project" | "onboarding" | "access" | "reset" | "unknown";
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

function clean(pathname: string) {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
}

function genericRoute(kind: AppRoute["kind"], scopeHint: string | null, organizationId: string | null, slug: string | undefined, entity?: string): AppRoute {
  let page = slug ? slugToPage[slug] || null : "Overview";
  if(slug === "recruitment" && (kind === "organization" || kind === "staff")) page="Workforce marketplace";
  if(slug === "recruitment" && kind === "project") page="Recruitment";
  const entityKind: RouteEntityKind = page === "Beneficiary cases" && entity ? "case" : null;
  return {kind, scopeHint, page, organizationId, projectId:null, projectTab:null, entityKind, entityId:entityKind ? entity || null : null};
}

function projectRoute(kind: AppRoute["kind"], scopeHint: string, organizationId: string | null, projectId: string, rest: string[]): AppRoute {
  const tab = rest[0] || "overview";
  let entityKind: RouteEntityKind = null;
  let entityId: string | null = null;
  if (tab === "cases" && rest[1]) { entityKind = "case"; entityId = rest[1]; }
  if (tab === "recruitment" && rest[1] === "applications" && rest[2]) { entityKind = "application"; entityId = rest[2]; }
  if (tab === "recruitment" && rest[1] === "assignments" && rest[2]) { entityKind = "assignment"; entityId = rest[2]; }
  return {kind, scopeHint, page:"Project workspace", organizationId, projectId, projectTab:tab, entityKind, entityId};
}

export function parseAppRoute(pathname = location.pathname): AppRoute {
  const parts = clean(pathname);
  if (!parts.length) return {kind:"root",scopeHint:null,page:null,organizationId:null,projectId:null,projectTab:null,entityKind:null,entityId:null};
  if (parts[0] === "reset") return {kind:"reset",scopeHint:null,page:null,organizationId:null,projectId:null,projectTab:null,entityKind:null,entityId:null};
  if (parts[0] === "access") return {kind:"access",scopeHint:"access",page:"Access status",organizationId:null,projectId:null,projectTab:null,entityKind:null,entityId:null};
  if (parts[0] === "onboarding" && parts[1] === "organization") return {kind:"onboarding",scopeHint:"onboarding",page:"Partner NGO application",organizationId:null,projectId:null,projectTab:null,entityKind:null,entityId:null};
  if (parts[0] === "app") {
    if (parts[1] === "work" && parts[2] === "opportunities") return {kind:"personal",scopeHint:"personal",page:"Available Opportunities",organizationId:null,projectId:null,projectTab:null,entityKind:null,entityId:null};
    if (parts[1] === "work" && parts[2] === "applications") return {kind:"personal",scopeHint:"personal",page:"My Applications",organizationId:null,projectId:null,projectTab:null,entityKind:parts[3]?"application":null,entityId:parts[3]||null};
    if (parts[1] === "work" && parts[2] === "assignments" && parts[3] && parts[4] === "attendance") return {kind:"personal",scopeHint:"personal",page:"My Attendance",organizationId:null,projectId:null,projectTab:null,entityKind:"assignment",entityId:parts[3]};
    if (parts[1] === "work" && parts[2] === "assignments") return {kind:"personal",scopeHint:"personal",page:"My Assigned Surveys",organizationId:null,projectId:null,projectTab:null,entityKind:parts[3]?"assignment":null,entityId:parts[3]||null};
    if (parts[1] === "work" && parts[2] === "schedule") return {kind:"personal",scopeHint:"personal",page:"My Schedule",organizationId:null,projectId:null,projectTab:null,entityKind:null,entityId:null};
    if (parts[1] === "work" && parts[2] === "availability") return {kind:"personal",scopeHint:"personal",page:"My Availability",organizationId:null,projectId:null,projectTab:null,entityKind:null,entityId:null};
    if (parts[1] === "field" && parts[2] === "attendance") return {kind:"personal",scopeHint:"personal",page:"My Attendance",organizationId:null,projectId:null,projectTab:null,entityKind:null,entityId:null};
    if (parts[1] === "field" && parts[2] === "cases") return {kind:"personal",scopeHint:"personal",page:"My Cases",organizationId:null,projectId:null,projectTab:null,entityKind:parts[3]?"case":null,entityId:parts[3]||null};
    if (parts[1] === "field" && parts[2] === "follow-ups") return {kind:"personal",scopeHint:"personal",page:"My Follow-ups",organizationId:null,projectId:null,projectTab:null,entityKind:null,entityId:null};
    if (parts[1] === "field" && parts[2] === "timesheets") return {kind:"personal",scopeHint:"personal",page:"My Timesheets",organizationId:null,projectId:null,projectTab:null,entityKind:null,entityId:null};
    if (parts[1] === "field") return {kind:"personal",scopeHint:"personal",page:"My Assigned Surveys",organizationId:null,projectId:null,projectTab:null,entityKind:null,entityId:null};
    return genericRoute("personal","personal",null,parts[1],parts[2]);
  }
  if (parts[0] === "org" && parts[1]) {
    const organizationId = parts[1];
    if (parts[2] === "projects" && parts[3]) return projectRoute("organization",organizationId,organizationId,parts[3],parts.slice(4));
    if (parts[2] === "recruitment" && ["applications","assignments"].includes(parts[3]||"") && parts[4]) return {kind:"organization",scopeHint:organizationId,page:"Workforce marketplace",organizationId,projectId:null,projectTab:null,entityKind:parts[3]==="applications"?"application":"assignment",entityId:parts[4]};
    return genericRoute("organization",organizationId,organizationId,parts[2],parts[3]);
  }
  if (parts[0] === "staff") {
    if (parts[1] === "projects" && parts[2]) return projectRoute("staff","poem",null,parts[2],parts.slice(3));
    if (parts[1] === "recruitment" && ["applications","assignments"].includes(parts[2]||"") && parts[3]) return {kind:"staff",scopeHint:"poem",page:"Workforce marketplace",organizationId:null,projectId:null,projectTab:null,entityKind:parts[2]==="applications"?"application":"assignment",entityId:parts[3]};
    return genericRoute("staff","poem",null,parts[1],parts[2]);
  }
  if (parts[0] === "projects" && parts[1]) return projectRoute("project",`project:${parts[1]}`,null,parts[1],parts.slice(2));
  if (parts[0] === "project" && parts[1]) {
    if (parts[2] === "recruitment" && ["applications","assignments"].includes(parts[3]||"") && parts[4]) return {kind:"project",scopeHint:`project:${parts[1]}`,page:"Recruitment",organizationId:null,projectId:null,projectTab:null,entityKind:parts[3]==="applications"?"application":"assignment",entityId:parts[4]};
    return genericRoute("project",`project:${parts[1]}`,null,parts[2],parts[3]);
  }
  return {kind:"unknown",scopeHint:null,page:null,organizationId:null,projectId:null,projectTab:null,entityKind:null,entityId:null};
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
  if (tab === "cases" && entityKind === "case" && entityId) return `/cases/${encodeURIComponent(entityId)}`;
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
    if(page === "Recruitment" && entityId && (entityKind === "application" || entityKind === "assignment")) return `/project/${encodeURIComponent(scopedProjectId)}/recruitment/${entityKind === "application"?"applications":"assignments"}/${encodeURIComponent(entityId)}`;
    return `/project/${encodeURIComponent(scopedProjectId)}/${pageSlug(page)}` + (page === "Beneficiary cases" && entityKind === "case" && entityId ? `/${encodeURIComponent(entityId)}` : "");
  }
  if (scope === "personal") {
    if (page === "Available Opportunities") return "/app/work/opportunities";
    if (page === "My Applications") return entityKind === "application" && entityId ? `/app/work/applications/${encodeURIComponent(entityId)}` : "/app/work/applications";
    if (page === "My Assigned Surveys") return entityKind === "assignment" && entityId ? `/app/work/assignments/${encodeURIComponent(entityId)}` : "/app/field";
    if (page === "My Attendance") return entityKind === "assignment" && entityId ? `/app/work/assignments/${encodeURIComponent(entityId)}/attendance` : "/app/field/attendance";
    if (page === "My Timesheets") return "/app/field/timesheets";
    if (page === "My Schedule") return "/app/work/schedule";
    if (page === "My Availability") return "/app/work/availability";
    if (page === "My Cases") return entityKind === "case" && entityId ? `/app/field/cases/${encodeURIComponent(entityId)}` : "/app/field/cases";
    if (page === "My Follow-ups") return "/app/field/follow-ups";
    return `/app/${pageSlug(page)}`;
  }
  if (scope === "poem") {
    if(page === "Workforce marketplace" && entityId && (entityKind === "application" || entityKind === "assignment")) return `/staff/recruitment/${entityKind === "application"?"applications":"assignments"}/${encodeURIComponent(entityId)}`;
    return `/staff/${pageSlug(page)}` + (page === "Beneficiary cases" && entityKind === "case" && entityId ? `/${encodeURIComponent(entityId)}` : "");
  }
  if(page === "Workforce marketplace" && entityId && (entityKind === "application" || entityKind === "assignment")) return `/org/${encodeURIComponent(scope)}/recruitment/${entityKind === "application"?"applications":"assignments"}/${encodeURIComponent(entityId)}`;
  return `/org/${encodeURIComponent(scope)}/${pageSlug(page)}` + (page === "Beneficiary cases" && entityKind === "case" && entityId ? `/${encodeURIComponent(entityId)}` : "");
}

export function writeRoute(target: RouteTarget, replace = false) {
  const path=routePath(target);
  if (location.pathname === path) return;
  if (replace) history.replaceState({fieldlance:true},"",path);
  else history.pushState({fieldlance:true},"",path);
}

export function isExplicitRoute(route: AppRoute) {
  return !["root","unknown","reset"].includes(route.kind);
}
