// Session-memory UI preferences only; never cache evidence or authorization results here.
export type FieldMapViewState = {
  from: string; to: string; worker: string; geo: string; status: string; quality: string;
  reviewOnly: boolean;
  layers: Record<"survey" | "attendance_check_in" | "attendance_check_out" | "case_follow_up", boolean>;
  loadedPages: number;
  selectedEvidenceId: string | null;
};
export type FieldMapViewStore = Map<string, FieldMapViewState>;
