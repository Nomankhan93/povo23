import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { reportDiagnostic } from "../observability";


async function observedSupabaseFetch(input: RequestInfo | URL, init?: RequestInit) {
  try {
    const response = await fetch(input, init);
    if (response.status >= 500) {
      reportDiagnostic("database", new Error(`Supabase transport failed with status ${response.status}`), { operation: "supabase_transport", httpStatus: response.status, online: typeof navigator !== "undefined" ? navigator.onLine : false });
    }
    return response;
  } catch (error) {
    reportDiagnostic("database", error, { operation: "supabase_transport", phase: "network", online: typeof navigator !== "undefined" ? navigator.onLine : false });
    throw error;
  }
}

const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(url && key && !key.startsWith("replace-"));
export const db = configured
  ? createClient<Database>(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "implicit",
      },
      global: { fetch: observedSupabaseFetch },
    })
  : null;
type Functions = Database["public"]["Functions"];
export async function rpc<N extends keyof Functions>(
  name: N,
  args: Functions[N]["Args"],
): Promise<Functions[N]["Returns"]> {
  if (!db) {
    const error = Error("Supabase is not configured");
    reportDiagnostic("rpc", error, { operation: String(name), phase: "not_configured", online: typeof navigator !== "undefined" ? navigator.onLine : false });
    throw error;
  }
  try {
    const { data, error } = await db.rpc(name, args);
    if (error) throw error;
    return data as Functions[N]["Returns"];
  } catch (error) {
    // Intentionally log only the RPC name, never args: args can contain survey answers, IDs, finance data or PII.
    reportDiagnostic("rpc", error, { operation: String(name), phase: "request", online: typeof navigator !== "undefined" ? navigator.onLine : false });
    throw error;
  }
}
