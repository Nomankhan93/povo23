import { useEffect, useState } from "react";
import { Button, Alert } from "../../components/ui/FieldLanceUI";
import { db, rpc } from "../../lib/supabase/client";
import { Opportunity, text } from "./model";
import styles from "./InviteVolunteer.module.css";

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
      .not("survey_project_id", "is", null)
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
    <div className={styles.root}>
      <Button variant="tertiary" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
        Invite to opportunity
      </Button>
      {open && (
        <section className={styles.panel} aria-label={`Invite ${name} to a project opportunity`}>
          <div className={styles.heading}>
            <h4>Invite {name}</h4>
            <p>This invitation is a recruitment-interest step. It does not create an assignment or field access.</p>
          </div>
          {error && <Alert tone="danger" title="Invitation could not be sent">{error}</Alert>}
          {message && <Alert tone="success" title={message} />}
          <form
            className={styles.form}
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
              Choose project opportunity
              <select name="op" required>
                <option value="">Choose opportunity</option>
                {rows.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title} · {o.start_date}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.actions}>
              <Button variant="tertiary" type="button" disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={busy || !rows.length}>
                Send invitation
              </Button>
            </div>
          </form>
          {!busy && !rows.length && (
            <p className={styles.helper}>Publish the project first; FieldLance creates its marketplace listing automatically.</p>
          )}
          <div className={styles.pagination} aria-label="Opportunity pages">
            <Button
              variant="secondary"
              type="button"
              disabled={busy || !page}
              onClick={() => setPage((n) => n - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              type="button"
              disabled={busy || !more}
              onClick={() => setPage((n) => n + 1)}
            >
              Next
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
