import { flushActiveDraft } from "../surveys/activeDraft.ts";

// Await the registered form's latest draft/capture guard before unmounting it.
export async function protectProjectNavigation(commit: () => void): Promise<void> {
  await flushActiveDraft();
  commit();
}
