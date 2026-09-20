export type NavigationGroup = { label: string; pages: readonly string[] };

export const navigationGroups: readonly NavigationGroup[] = [
  {
    label: "Overview",
    pages: ["Overview", "Task Center", "My profile", "Work experience", "Private documents"],
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
  "Task Center": "Tasks",
  "Work experience": "Verified work history",
  Invitations: "Invitations & offers",
  "Workforce payables": "Earnings",
  "E-Wallets & withdrawals": "Wallet & withdrawals",
  Notifications: "Updates",
};

export function workspacePageLabel(page: string, personal: boolean) {
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
