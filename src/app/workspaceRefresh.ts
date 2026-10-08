export const FOREGROUND_REFRESH_DEDUP_MS = 30_000;

const geographyPages = new Set([
  "Reports & Analytics",
  "My profile",
  "Volunteers",
  "Partner NGO application",
  "NGO applications",
  "Partner NGOs",
  "Geography",
  "My Field Map",
  "Workforce marketplace",
  "Available Opportunities",
  "My Applications",
  "My Assigned Surveys",
  "Recruitment",
  "Organization Settings",
  "Invitations",
  "Project team",
  "Project workspace",
  "Survey projects",
]);

const accountDirectoryPages = new Set(["Memberships", "Accounts", "Activity"]);

// Organization names are intentionally not loaded during every workspace bootstrap.
// Pages that render cross-organization labels or staff directories opt in here.
const organizationDirectoryPages = new Set([
  "Accounts",
  "Memberships",
  "Volunteers",
  "Partner NGOs",
  "Organization Settings",
  "Project funding",
  "Data sharing",
  "Workforce marketplace",
  "Available Opportunities",
  "My Applications",
  "My Assigned Surveys",
  "Recruitment",
  "Project team",
  "Project workspace",
  "Survey projects",
  "Survey templates",
  "Invitations",
]);

const membershipDirectoryPages = new Set(["Memberships"]);

export function shouldRunForegroundRefresh(
  lastRunAt: number,
  now: number,
  visibilityState: DocumentVisibilityState | string,
): boolean {
  return visibilityState === "visible" && now - lastRunAt >= FOREGROUND_REFRESH_DEDUP_MS;
}

export function workspacePageNeedsGeographies(page: string): boolean {
  return geographyPages.has(page);
}

export function workspacePageNeedsAccounts(page: string): boolean {
  return accountDirectoryPages.has(page);
}

export function workspacePageNeedsOrganizationDirectory(page: string): boolean {
  return organizationDirectoryPages.has(page);
}

export function workspacePageNeedsMembershipDirectory(page: string): boolean {
  return membershipDirectoryPages.has(page);
}

export function workspacePageNeedsFullActivity(page: string): boolean {
  return page === "Activity";
}
