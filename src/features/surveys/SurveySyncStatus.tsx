import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearAttentionSurveyCopies,
  surveyQueueSummary,
  syncSurveyQueue,
  type SurveyQueueSummary,
} from "./offlineSurveyStore";

const empty: SurveyQueueSummary = { pending: 0, attention: 0, total: 0 };

export function SurveySyncStatus({ userId }: { userId: string }) {
  const [summary, setSummary] = useState<SurveyQueueSummary>(empty),
    [online, setOnline] = useState(navigator.onLine),
    [syncing, setSyncing] = useState(false),
    [error, setError] = useState("");
  const syncingRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setSummary(await surveyQueueSummary(userId));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [userId]);

  const sync = useCallback(async () => {
    if (!navigator.onLine || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      setSummary(await syncSurveyQueue(userId));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
    const queue = () => void refresh();
    const onOnline = () => {
      setOnline(true);
      void sync();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("poem:survey-queue-change", queue);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const timer = window.setInterval(() => {
      if (navigator.onLine) void sync();
    }, 30_000);
    if (navigator.onLine) void sync();
    return () => {
      window.removeEventListener("poem:survey-queue-change", queue);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.clearInterval(timer);
    };
  }, [refresh, sync]);

  const label = !online
    ? summary.total
      ? `Offline · ${summary.total} saved`
      : "Offline"
    : summary.attention
      ? `${summary.attention} survey${summary.attention === 1 ? "" : "s"} need attention`
      : summary.pending
        ? `${summary.pending} waiting to sync`
        : "Survey sync ready";

  return (
    <details className={`survey-sync ${online ? "" : "offline"}`}>
      <summary>{syncing ? "Syncing surveys…" : label}</summary>
      <div className="survey-sync-card">
        <strong>{online ? "Field sync" : "Working offline"}</strong>
        <p>
          {summary.pending} queued · {summary.attention} need attention. Survey payloads in the device queue are encrypted.
        </p>
        {error && <p className="error-text">{error}</p>}
        <div className="document-actions">
          <button className="secondary" disabled={!online || syncing || !summary.pending} onClick={() => void sync()}>
            Sync now
          </button>
          {summary.attention > 0 && (
            <button
              className="secondary"
              onClick={() => {
                if (!window.confirm("Discard failed device copies only after you have corrected or re-entered those surveys. Continue?")) return;
                void clearAttentionSurveyCopies(userId).then(refresh);
              }}
            >
              Discard failed copies
            </button>
          )}
        </div>
        <small>
          A server validation or version conflict is never auto-overwritten. Reopen the live record, reconcile it, then discard the failed device copy.
        </small>
      </div>
    </details>
  );
}
