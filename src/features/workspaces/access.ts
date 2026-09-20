export type WorkspaceAccess = {
  workspaces: {id: string; label: string}[];
  defaultScope: string;
  worker: boolean;
  enrollment?: string;
  intent?: string;
  applications?: {id:string;status:string;name:string;organizationId:string|null}[];
};
export function resolveWorkspace(access: WorkspaceAccess, preferred: string | null): string {
  if (preferred && access.workspaces.some(w => w.id === preferred)) return preferred;
  return access.workspaces.some(w => w.id === access.defaultScope) ? access.defaultScope : 'access';
}
export function workspaceHome(scope: string): string {
  return scope === 'onboarding' ? 'Partner NGO application' : scope === 'access' ? 'Access status' : scope.startsWith('project:') ? 'Project workspace' : 'Overview';
}
export function readPreferredWorkspace(userId: string): string | null {
  try { return localStorage.getItem(`fieldlance-workspace:${userId}`); } catch { return null; }
}
export function rememberPreferredWorkspace(userId: string, scope: string) {
  try { localStorage.setItem(`fieldlance-workspace:${userId}`, scope); } catch { /* Storage is optional. */ }
}
