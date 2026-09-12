import { useRef, useState } from "react";
import { db } from "../../lib/supabase/client";
import type { Database } from "../../lib/supabase/database.types";
type Args = Database["public"]["Functions"]["save_survey_response"]["Args"];
/** A request survives uncertain replies while this form remains mounted. No PII is persisted locally. */
export function useSurveySave(onSaved: () => void) {
  const request = useRef<Args | null>(null),
    inFlight = useRef(false);
  const [saving, setSaving] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState("");
  async function send(args?: Omit<Args, "p_request_id">) {
    if (inFlight.current) return;
    if (!request.current) {
      if (!args) return;
      request.current = structuredClone({
        ...args,
        p_request_id: crypto.randomUUID(),
      });
    }
    inFlight.current = true;
    setSaving(true);
    setError("");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      if (!db) throw Error("Supabase is not configured");
      const result = await db
        .rpc("save_survey_response", request.current)
        .abortSignal(controller.signal);
      if (result.error) {
        // SQL validation/permission/constraint errors mean this transaction was rolled back.
        const definitive = /^(P0001|22\w{3}|23\w{3}|42501|40001|40P01)$/.test(
          result.error.code || "",
        );
        if (definitive) {
          request.current = null;
          setUncertain(false);
        } else setUncertain(true);
        throw result.error;
      }
      request.current = null;
      setUncertain(false);
      onSaved();
    } catch (e) {
      if (request.current) setUncertain(true);
      setError((e as Error).message || "No confirmed response received.");
    } finally {
      clearTimeout(timer);
      inFlight.current = false;
      setSaving(false);
    }
  }
  return { send, saving, uncertain, error };
}
