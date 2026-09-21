export function workspaceTeamPermission(surveyManage: boolean, ownsWorkspaceProject: boolean): boolean {
  return surveyManage || ownsWorkspaceProject;
}
