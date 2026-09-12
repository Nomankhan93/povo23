import { useState } from "react";
import { rpc } from "../../lib/supabase/client";
import type { Database } from "../../lib/supabase/database.types";
type Row = Database["public"]["Tables"]["notifications"]["Row"];
export function Notifications({
  rows,
  refresh,
}: {
  rows: Row[];
  refresh: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="panel detail">
      <h2>Notifications</h2>
      <p>Profile reviews, document decisions and membership/access changes.</p>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {rows.map((n) => (
        <article className="notification-row" key={n.id}>
          <div>
            <strong>{n.title}</strong>
            <p>{n.body}</p>
            <small>{new Date(n.created_at).toLocaleString()}</small>
          </div>
          {n.read_at ? (
            <span className="badge">Read</span>
          ) : (
            <button
              disabled={busy}
              className="secondary"
              onClick={async () => {
                setBusy(true);
                try {
                  await rpc("mark_notification_read", { p_id: n.id });
                  await refresh();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Mark read
            </button>
          )}
        </article>
      ))}
      {!rows.length && <div className="empty">No notifications yet.</div>}
      <p className="fine">
        Latest 100 notifications. Opening this page does not mark unseen items
        read.
      </p>
    </section>
  );
}
