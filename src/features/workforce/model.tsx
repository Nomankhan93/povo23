import { type Database } from "../../lib/supabase/database.types";
export type Experience =
  Database["public"]["Tables"]["volunteer_experiences"]["Row"];
export type Opportunity =
  Database["public"]["Tables"]["work_opportunities"]["Row"];
export type Invitation =
  Database["public"]["Tables"]["work_invitations"]["Row"];
export type Org = { id: string; name: string; status: string };
export const text = (f: FormData, k: string) => String(f.get(k) || "");

export type WorkApplication = Database["public"]["Tables"]["work_applications"]["Row"];
export type WorkAssignment = Database["public"]["Tables"]["work_assignments"]["Row"];
