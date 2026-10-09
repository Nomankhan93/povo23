import { useEffect, useState } from "react";
import { db } from "../../lib/supabase/client";
import { Alert, Button, StatusBadge } from "../../components/ui/FieldLanceUI";
import { EmptyState } from "../../components/ui/WorkflowOverview";
import styles from "./SurveyReviewQueue.module.css";

type Row = { id: string; project_id: string; status: string; created_at: string };

function reviewTone(status: string) {
  return status === "correction_required" ? "warning" as const : "info" as const;
}

function reviewLabel(status: string) {
  return status === "correction_required" ? "Correction required" : status === "submitted" ? "Pending review" : status.replaceAll("_", " ");
}

export function SurveyReviewQueue({ onOpen }: { onOpen: (projectId: string, responseId: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]),
    [titles, setTitles] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setBusy(true);
    setError("");
    setRows([]);
    void (async () => {
      const result = await db!
        .from("survey_responses")
        .select("id,project_id,status,created_at")
        .in("status", ["submitted", "correction_required"])
        .order("created_at")
        .order("id")
        .range(page * 50, page * 50 + 50);
      if (result.error) throw result.error;
      const records = result.data || [],
        ids = [...new Set(records.map((row) => row.project_id))];
      const projects = ids.length
        ? await db!.from("survey_projects").select("id,title").in("id", ids)
        : { data: [], error: null };
      if (projects.error) throw projects.error;
      if (live) {
        setRows(records.slice(0, 50));
        setMore(records.length > 50);
        setTitles(Object.fromEntries((projects.data || []).map((row) => [row.id, row.title])));
      }
    })()
      .catch(() => {
        if (live) setError("Survey review queue could not be loaded. Retry to continue.");
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [page, revision]);

  return (
    <section className={styles.queue} aria-labelledby="survey-review-queue-heading">
      <header className={styles.header}>
        <div>
          <h2 id="survey-review-queue-heading">Survey response review</h2>
          <p>Review submitted survey work or follow responses awaiting correction. Identity verification is a separate process.</p>
        </div>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => setRevision((v) => v + 1)}>
          Refresh
        </Button>
      </header>

      {busy && <p role="status">Loading survey review queue…</p>}
      {error && (
        <Alert
          title="Survey review queue unavailable"
          tone="danger"
          action={<Button type="button" variant="secondary" onClick={() => setRevision((v) => v + 1)}>Retry survey review</Button>}
        >
          {error}
        </Alert>
      )}

      {!busy && !error && rows.length > 0 && (
        <div className={styles.list}>
          {rows.map((row) => (
            <article className={styles.item} key={row.id}>
              <div className={styles.itemHeading}>
                <h3>{titles[row.project_id] || "Survey project"}</h3>
                <StatusBadge tone={reviewTone(row.status)}>{reviewLabel(row.status)}</StatusBadge>
              </div>
              <div className={styles.meta}>
                <span>Response {row.id}</span>
                <span>Created {new Date(row.created_at).toLocaleString()}</span>
              </div>
              <div className={styles.itemActions}>
                <Button type="button" variant="primary" onClick={() => onOpen(row.project_id, row.id)}>
                  Review response
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      {!busy && !error && !rows.length && <EmptyState>No survey responses need review in your scope.</EmptyState>}

      <nav className={styles.pagination} aria-label="Survey review pagination">
        <Button type="button" variant="secondary" disabled={busy || page === 0} onClick={() => setPage((v) => v - 1)}>
          Previous
        </Button>
        <span className={styles.pageLabel} aria-live="polite">Page {page + 1}</span>
        <Button type="button" variant="secondary" disabled={busy || !more} onClick={() => setPage((v) => v + 1)}>
          Next
        </Button>
      </nav>
    </section>
  );
}
