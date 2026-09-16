export type WorkspaceEntryIntent = "volunteer" | "ngo" | "poem";

const KEY = "poem-workspace-entry-intent";

export function rememberWorkspaceEntryIntent(intent: WorkspaceEntryIntent) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, intent);
}

export function readWorkspaceEntryIntent(): WorkspaceEntryIntent | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(KEY);
  return value === "volunteer" || value === "ngo" || value === "poem"
    ? value
    : null;
}

export function consumeWorkspaceEntryIntent(): WorkspaceEntryIntent | null {
  const value = readWorkspaceEntryIntent();
  if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
  return value;
}
