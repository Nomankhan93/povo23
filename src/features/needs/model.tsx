import { type Database } from "../../lib/supabase/database.types";
export type T = Database["public"]["Tables"];
export type Need = T["beneficiary_needs"]["Row"];
export type Entry = T["assistance_entries"]["Row"];
export type Link = T["need_assistance_links"]["Row"];
export const val = (f: FormData, k: string) => String(f.get(k) || "").trim();
export const title = (s: string) => s.replaceAll("_", " ");
export const states = ["open", "in_progress", "met", "closed", "needs_review"];
export const categories = [
  "food",
  "education",
  "health",
  "housing",
  "livelihood",
  "other",
];
export const pending = ["open", "in_progress", "needs_review"];
