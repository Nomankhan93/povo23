export type NavigationGroup = { label: string; pages: readonly string[] };

export const navigationGroups: readonly NavigationGroup[] = [
  {
    label: "Overview",
    pages: ["Overview", "My profile", "Work experience", "Private documents"],
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
