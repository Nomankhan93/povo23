import { useEffect, useState } from "react";
import { db, rpc } from "../../lib/supabase/client";
import { Opportunity, text } from "./model";
export function InviteVolunteer({
  organization,
  userId,
  name,
}: {
  organization: string;
  userId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<Opportunity[]>([]),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (!open) return;
    let live = true;
    setBusy(true);
    setRows([]);
    db!
      .from("work_opportunities")
      .select("*")
      .eq("organization_id", organization)
      .eq("status", "open")
      .gt("reply_by", new Date().toISOString())
      .order("created_at", { ascending: false })
      .order("id")
      .range(page * 50, page * 50 + 50)
      .then((r) => {
        if (!live) return;
        if (r.error) setError(r.error.message);
        else {
          setRows((r.data || []).slice(0, 50));
          setMore((r.data || []).length > 50);
        }
        setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [open, organization, page]);
  return (
    <div>
      <button className="link" onClick={() => setOpen(!open)}>
        Invite to opportunity
      </button>
      {open && (
        <div className="invite-inline">
          {error && <p role="alert">{error}</p>}
          {message && <p role="status">{message}</p>}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setError("");
              setMessage("");
              try {
                await rpc("send_work_invitation", {
                  p_opportunity: text(f, "op"),
                  p_user: userId,
                });
                setMessage("Invitation sent.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field">
              Invite {name}
              <select name="op" required>
                <option value="">Choose opportunity</option>
                {rows.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title} · {o.start_date}
                  </option>
                ))}
              </select>
            </label>
            <button className="secondary" disabled={busy || !rows.length}>
              Send invitation
            </button>
          </form>
          {!busy && !rows.length && (
            <p>Create an open opportunity in Invitations first.</p>
          )}
          <div className="actions">
            <button
              className="secondary"
              disabled={busy || !page}
              onClick={() => setPage((n) => n - 1)}
            >
              Previous
            </button>
            <button
              className="secondary"
              disabled={busy || !more}
              onClick={() => setPage((n) => n + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
