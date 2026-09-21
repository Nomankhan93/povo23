export type NavigationGroup = { label: string; pages: readonly string[] };

export const navigationGroups: readonly NavigationGroup[] = [
  {
    label: "Overview",
    pages: ["Overview", "Access status", "Task Center", "My profile", "Work experience", "Private documents"],
  },
  {
    label: "Work & earnings",
    pages: [
      "Available Opportunities",
      "My Applications",
      "My Assigned Surveys",
      "Invitations",
      "Workforce payables",
      "E-Wallets & withdrawals",
    ],
  },
  {
    label: "People & recruitment",
    pages: [
      "Volunteers",
      "Partner NGO application",
      "NGO applications",
      "Partner NGOs",
      "Workforce marketplace",
      "Recruitment",
    ],
  },
  {
    label: "Field operations",
    pages: [
      "Project workspace",
      "Project team",
      "Survey projects",
      "Survey templates",
      "Verification",
      "Canonical registry",
      "Beneficiary cases",
      "Assistance ledger",
      "Project governance",
      "Data sharing",
      "Project funding",
    ],
  },
  {
    label: "Administration",
    pages: [
      "Memberships",
      "Accounts",
      "Geography",
      "Withdrawal operations",
      "E-Wallet sandbox",
      "Notifications",
      "Activity",
    ],
  },
];

export const workspaceLabels = {
  personal: "Field Worker",
  organization: "Organization",
  staff: "FieldLance Staff",
  project: "Project",
} as const;

export const personalNavigationLabels: Readonly<Record<string, string>> = {
  Overview: "Home",
  "My profile": "My profile",
  "Task Center": "Tasks",
  "Work experience": "Verified work history",
  Invitations: "Invitations & offers",
  "Workforce payables": "Earnings",
  "E-Wallets & withdrawals": "Wallet & withdrawals",
  Notifications: "Updates",
};

export function workspacePageLabel(page: string, personal: boolean) {
  if (page === "Partner NGO application") return "Organization application";
  if (page === "Partner NGOs") return "Organizations";
  if (page === "Volunteers") return "Field Workers";
  if (page === "Activity" && personal) return "Account activity";
  return personal ? personalNavigationLabels[page] || page : page;
}

export const organizationNavigationLabels: Readonly<Record<string, string>> = {
  Overview: "Home",
  "Task Center": "Tasks & SLA",
  Volunteers: "Field Workers",
  "Survey projects": "Projects",
  "Project team": "Team & access",
  "Workforce marketplace": "Recruitment",
  Invitations: "Direct invitations",
  "Workforce payables": "Field Worker payables",
  "Project funding": "Project finance",
  "Beneficiary cases": "Cases",
  "Assistance ledger": "Assistance",
  "Project governance": "Governance",
  Notifications: "Updates & communication",
};

export function organizationPageLabel(page: string) {
  return organizationNavigationLabels[page] || page;
}

export const staffNavigationLabels: Readonly<Record<string, string>> = {
  Overview: "Operations home",
  "Task Center": "Tasks & escalations",
  Volunteers: "Field Workers",
  "NGO applications": "Organization applications",
  "Partner NGOs": "Organizations",
  "Survey projects": "Projects",
  Verification: "Verification queue",
  "Project governance": "Governance",
  "Canonical registry": "Beneficiary registry",
  "Beneficiary cases": "Cases",
  "Assistance ledger": "Assistance",
  "Data sharing": "Controlled sharing",
  "Workforce marketplace": "Recruitment oversight",
  "Project funding": "Project finance",
  "Withdrawal operations": "Payout operations",
  "E-Wallet sandbox": "Wallet sandbox",
  Accounts: "Accounts & roles",
  Notifications: "Communication center",
  Activity: "Audit trail",
};

export function staffPageLabel(page: string) {
  return staffNavigationLabels[page] || page;
}

export type WorkspaceKind = 'personal' | 'organization' | 'staff' | 'project' | 'onboarding' | 'access';
const overview = ['Overview','Project workspace','Access status','Task Center','Notifications'];
const impact = ['Canonical registry','Beneficiary cases','Assistance ledger','Data sharing'];
const workspaceGroups: Record<WorkspaceKind, readonly NavigationGroup[]> = {
  personal: [
    {label:'Overview',pages:overview},
    {label:'Find work',pages:['Available Opportunities','My Applications','Invitations','My Assigned Surveys','Survey projects']},
    {label:'Career',pages:['Work experience','Workforce payables','E-Wallets & withdrawals']},
    {label:'Profile',pages:['My profile','Verification','Private documents']},
    {label:'More',pages:['Partner NGOs','Activity']},
  ],
  organization: [
    {label:'Overview',pages:overview},
    {label:'Work',pages:['Survey projects','Workforce marketplace','Invitations','Volunteers','Project team','Survey templates']},
    {label:'Finance',pages:['Workforce payables','Project funding']},
    {label:'Governance',pages:['Project governance','Verification','Activity']},
    {label:'Impact operations',pages:impact},
  ],
  staff: [
    {label:'Overview',pages:overview},
    {label:'Organizations & people',pages:['Partner NGOs','NGO applications','Volunteers','Verification']},
    {label:'Field delivery',pages:['Survey projects','Workforce marketplace','Survey templates']},
    {label:'Finance',pages:['Project funding','Withdrawal operations']},
    {label:'Governance',pages:['Project governance','Memberships','Accounts','Activity']},
    {label:'Impact operations',pages:impact},
    {label:'System',pages:['Geography','E-Wallet sandbox']},
  ],
  project: [
    {label:'Overview',pages:overview},
    {label:'Delivery',pages:['Survey projects','Recruitment','Project team']},
    {label:'Impact operations',pages:impact},
    {label:'Activity',pages:['Activity']},
  ],
  onboarding: [{label:'Organization',pages:['Partner NGO application','Notifications']}],
  access: [{label:'Account',pages:['Access status','Notifications']}],
};

/** Presentation only: caller supplies the authorized page list. Never adds access. */
export function getNavigationGroups(kind: WorkspaceKind, allowed: readonly string[]): NavigationGroup[] {
  const remaining = new Set(allowed);
  const result: NavigationGroup[] = [];
  for (const group of workspaceGroups[kind]) {
    const pages = group.pages.filter(page => remaining.delete(page));
    if (pages.length) result.push({label:group.label,pages});
  }
  if (remaining.size) result.push({label:'Other tools',pages:[...remaining]});
  return result;
}

export function readSidebarCollapsed(): boolean {
  try { return localStorage.getItem('fieldlance-sidebar-collapsed') === 'true'; } catch { return false; }
}
export function saveSidebarCollapsed(collapsed: boolean) {
  try { localStorage.setItem('fieldlance-sidebar-collapsed', String(collapsed)); } catch { /* Optional preference. */ }
}
