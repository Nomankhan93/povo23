import { useRef, useState } from "react";
import { db } from "../../lib/supabase/client";
import type { Database } from "../../lib/supabase/database.types";
import {
  definitiveSurveySaveError,
  enqueueSurveySave,
  markQueuedSurveyAttention,
  markQueuedSurveyPending,
  removeQueuedSurveySave,
} from "./offlineSurveyStore";

type Args = Database["public"]["Functions"]["save_survey_response"]["Args"];

/**
 * Survey saves use a write-ahead encrypted device queue. The same request UUID
 * is reused until the server confirms the transaction, including after reloads.
 */
export function useSurveySave(
  ownerId: string,
  onSaved: () => void | Promise<void>,
  onQueued: () => void | Promise<void>,
) {
  const request = useRef<Args | null>(null),
    inFlight = useRef(false);
  const [saving, setSaving] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [queued, setQueued] = useState(false),
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
    const current = request.current;
    const requestId = current.p_request_id;
    if (!requestId) throw new Error("Survey request ID is required");
    inFlight.current = true;
    setSaving(true);
    setError("");
    setQueued(false);
    let durable = false;
    try {
      try {
        await enqueueSurveySave(ownerId, current);
        durable = true;
      } catch (storageError) {
        if (!navigator.onLine) throw storageError;
      }

      if (!navigator.onLine) {
        request.current = null;
        setUncertain(false);
        setQueued(true);
        await onQueued();
        return;
      }

      if (!db) throw Error("Supabase is not configured");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      try {
        const result = await db
          .rpc("save_survey_response", current)
          .abortSignal(controller.signal);
        if (result.error) {
          if (definitiveSurveySaveError(result.error)) {
            if (durable)
              await markQueuedSurveyAttention(ownerId, requestId, result.error.message);
            request.current = null;
            setUncertain(false);
            throw result.error;
          }
          if (durable) {
            await markQueuedSurveyPending(ownerId, requestId, result.error.message);
            request.current = null;
            setUncertain(false);
            setQueued(true);
            await onQueued();
            return;
          }
          setUncertain(true);
          throw result.error;
        }
        if (durable) await removeQueuedSurveySave(ownerId, requestId);
        request.current = null;
        setUncertain(false);
        await onSaved();
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      if (durable && request.current) {
        await markQueuedSurveyPending(ownerId, requestId, (e as Error).message || "No confirmed response received.");
        request.current = null;
        setUncertain(false);
        setQueued(true);
        await onQueued();
      } else if (request.current) {
        setUncertain(true);
      }
      setError((e as Error).message || "No confirmed response received.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }
  return { send, saving, uncertain, queued, error };
}
