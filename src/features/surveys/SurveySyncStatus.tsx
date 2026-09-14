import { useCallback, useEffect, useRef, useState } from "react";
import {
  attentionSurveyCopies, inspectAttentionSurvey, recoverAttentionSurvey, retryAttentionSurvey, discardAttentionSurvey,
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
  const [copies, setCopies] = useState<Awaited<ReturnType<typeof attentionSurveyCopies>>>([]);
  const [preview, setPreview] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const syncingRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setSummary(await surveyQueueSummary(userId));
      setCopies(await attentionSurveyCopies(userId));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [userId]);

  const sync = useCallback(async (force=false) => {
    if (!navigator.onLine || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      setSummary(await syncSurveyQueue(userId,force));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [userId]);

  useEffect(() => {
    setCopies([]); setPreview({}); setNotice("");
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
          <button className="secondary" disabled={!online || syncing || !summary.pending} onClick={() => void sync(true)}>
            Sync now
          </button>

        </div>
        {notice && <p role="status">{notice}</p>}
        {copies.map(copy => <article key={copy.id} className="document-row">
          <strong>Project {copy.projectId}</strong>
          <p>{copy.responseId ? `Response ${copy.responseId}` : "New survey"} · {new Date(copy.createdAt).toLocaleString()}</p>
          <p>{copy.error}</p>
          {copy.recoveredAt && <p>Recovered for editing. Review the saved draft; original retry is disabled.</p>}
          <button className="secondary" disabled={syncing} onClick={() => {
            void inspectAttentionSurvey(userId,copy.id).then(args => setPreview(p=>({...p,[copy.id]:JSON.stringify(args,null,2)}))).catch(e=>setError(e.message));
          }}>View saved answers</button>
          {preview[copy.id] && <pre className="survey-json">{preview[copy.id]}</pre>}
          <button className="secondary" disabled={syncing || Boolean(copy.recoveredAt)} onClick={() => {
            void retryAttentionSurvey(userId,copy.id).then(refresh).catch(e=>setError(e.message));
          }}>Retry original request</button>
          {copy.failureKind === "rejected" && !copy.recoveredAt && <button className="secondary" disabled={syncing} onClick={() => {
            void recoverAttentionSurvey(userId,copy.id).then(result => setNotice(`Recovery draft saved. Close any open survey form, then open project ${result.projectId} and ${result.responseId ? `response ${result.responseId}` : "Start survey"}. Review the recovered answers against the current record before saving. The failed copy remains here.`)).then(refresh).catch(e=>setError(e.message));
          }}>Recover for editing</button>}
          <button className="secondary" disabled={syncing} onClick={() => {
            if (!window.confirm("Permanently discard this failed device copy? Check that its answers have been recovered first.")) return;
            void discardAttentionSurvey(userId,copy.id).then(()=>{setPreview(p=>{const next={...p};delete next[copy.id];return next;});return refresh();}).catch(e=>setError(e.message));
          }}>Discard this copy</button>
        </article>)}
        <small>Pending saves retain their original request ID. Only confirmed rejections can be recovered for editing. Recovery never overwrites an existing draft.</small>
      </div>
    </details>
  );
}
