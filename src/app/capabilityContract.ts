// UI capability/navigation contract only. PostgreSQL RLS and guarded RPC authorization remain authoritative.
export type NavigationWorkspaceKind = 'personal' | 'organization' | 'staff' | 'project' | 'onboarding' | 'access';
export type ProjectWorkspaceRole = 'project_manager' | 'area_focal_person' | string | null | undefined;

const staffRoles = new Set(['admin', 'super_admin', 'volunteer_manager', 'ngo_manager', 'auditor', 'survey_manager']);
const fieldWorkerReviewRoles = new Set(['admin', 'super_admin', 'volunteer_manager']);
const organizationReviewRoles = new Set(['admin', 'super_admin', 'ngo_manager']);
const surveyManagementRoles = new Set(['admin', 'super_admin', 'survey_manager']);
const financeManagementRoles = new Set(['admin', 'super_admin']);
const platformOperationsRoles = new Set(['admin', 'super_admin']);

export type CapabilityContract = {
  staffWorkspace: boolean;
  superAdmin: boolean;
  reviewFieldWorkers: boolean;
  reviewOrganizations: boolean;
  manageSurveys: boolean;
  manageFinance: boolean;
  manageMemberships: boolean;
  manageAccounts: boolean;
  manageGeography: boolean;
  managePlatformOperations: boolean;
  projectManager: boolean;
  areaFocalPerson: boolean;
  manageCases: boolean;
  manageAssistance: boolean;
  manageWorkspaceProject: boolean;
  manageWorkspaceTeam: boolean;
  manageWorkspaceFinance: boolean;
  manageProjectAssignments: boolean;
};

export function hasStaffWorkspaceAccess(platformRole: string | null | undefined): boolean {
  return Boolean(platformRole && staffRoles.has(platformRole));
}

export function getCapabilityContract(input: {
  platformRole: string | null | undefined;
  staffWorkspace: boolean;
  organizationWorkspace: boolean;
  projectWorkspace: boolean;
  projectRole?: ProjectWorkspaceRole;
  ownsWorkspaceProject: boolean;
}): CapabilityContract {
  const role = input.platformRole || '';
  const staffWorkspace = input.staffWorkspace && hasStaffWorkspaceAccess(role);
  const reviewFieldWorkers = staffWorkspace && fieldWorkerReviewRoles.has(role);
  const reviewOrganizations = staffWorkspace && organizationReviewRoles.has(role);
  const manageSurveys = staffWorkspace && surveyManagementRoles.has(role);
  const manageFinance = staffWorkspace && financeManagementRoles.has(role);
  const managePlatformOperations = staffWorkspace && platformOperationsRoles.has(role);
  const projectManager = input.projectWorkspace && input.projectRole === 'project_manager';
  const areaFocalPerson = input.projectWorkspace && input.projectRole === 'area_focal_person';
  const organizationOrSurveyManager = manageSurveys || input.organizationWorkspace;

  return {
    staffWorkspace,
    superAdmin: staffWorkspace && role === 'super_admin',
    reviewFieldWorkers,
    reviewOrganizations,
    manageSurveys,
    manageFinance,
    manageMemberships: managePlatformOperations,
    manageAccounts: staffWorkspace && role === 'super_admin',
    manageGeography: reviewOrganizations,
    managePlatformOperations,
    projectManager,
    areaFocalPerson,
    manageCases: organizationOrSurveyManager || projectManager,
    manageAssistance: organizationOrSurveyManager || projectManager,
    manageWorkspaceProject: manageSurveys || input.ownsWorkspaceProject || projectManager,
    manageWorkspaceTeam: manageSurveys || input.ownsWorkspaceProject,
    manageWorkspaceFinance: manageFinance || input.ownsWorkspaceProject,
    manageProjectAssignments: manageSurveys || input.organizationWorkspace || projectManager,
  };
}

const personalPages = [
  'Overview',
  'Task Center',
  'My profile',
  'Work experience',
  'Reputation & Certificates',
  'Private documents',
  'Partner NGOs',
  'Survey projects',
  'Verification',
  'Available Opportunities',
  'My Applications',
  'My Assigned Surveys',
  'My Attendance',
  'My Timesheets',
  'My Field Map',
  'My Schedule',
  'My Availability',
  'My Cases',
  'My Follow-ups',
  'Invitations',
  'Workforce payables',
  'E-Wallets & withdrawals',
  'Notifications',
  'Activity',
] as const;

const organizationPages = [
  'Reports & Analytics',
  'Reputation & Certificates',
  'Organization Settings',
  'Overview',
  'Task Center',
  'Survey projects',
  'Project team',
  'Workforce marketplace',
  'Volunteers',
  'Invitations',
  'Survey templates',
  'Project governance',
  'Beneficiary cases',
  'Assistance ledger',
  'Data sharing',
  'Workforce payables',
  'Project funding',
  'Notifications',
  'Activity',
] as const;

export function getAuthorizedNavigationPages(input: {
  kind: NavigationWorkspaceKind;
  capabilities: CapabilityContract;
  projectRole?: ProjectWorkspaceRole;
  dev?: boolean;
}): string[] {
  if (input.kind === 'onboarding') return ['Partner NGO application', 'Notifications'];
  if (input.kind === 'access') return ['Access status', 'Notifications'];
  if (input.kind === 'personal') return [...personalPages];
  if (input.kind === 'organization') return [...organizationPages];

  if (input.kind === 'project') {
    const pages = ['Project workspace', 'Reports & Analytics', 'Task Center', 'Survey projects'];
    if (input.projectRole === 'project_manager') pages.push('Recruitment', 'Beneficiary cases', 'Assistance ledger');
    else if (input.projectRole === 'area_focal_person') pages.push('Beneficiary cases');
    pages.push('Notifications', 'Activity');
    return pages;
  }

  const pages = ['Reports & Analytics', 'Overview', 'Task Center'];
  if (input.capabilities.reviewFieldWorkers) pages.push('Volunteers', 'Reputation & Certificates');
  if (input.capabilities.reviewOrganizations) pages.push('NGO applications', 'Organization Settings');
  pages.push('Partner NGOs', 'Survey projects', 'Verification');
  if (input.capabilities.manageSurveys) {
    pages.push(
      'Survey review',
      'Project governance',
      'Survey templates',
      'Canonical registry',
      'Beneficiary cases',
      'Assistance ledger',
      'Data sharing',
      'Workforce marketplace',
    );
  }
  if (input.capabilities.manageFinance) {
    pages.push('Project funding', 'Withdrawal operations');
    if (input.dev) pages.push('E-Wallet sandbox');
  }
  if (input.capabilities.manageMemberships) pages.push('Memberships');
  if (input.capabilities.manageAccounts) pages.push('Accounts');
  if (input.capabilities.manageGeography) pages.push('Geography');
  pages.push('Notifications', 'Activity');
  return pages;
}
