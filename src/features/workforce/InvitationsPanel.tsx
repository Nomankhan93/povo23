import { useEffect, useState, type FormEvent } from "react";
import { db, rpc } from "../../lib/supabase/client";
import { geographyPath, type Geo } from "../geography/model";
import { Invitation, Opportunity, Org, text } from "./model";
export function InvitationsPanel({
  userId,
  organization,
  orgs,
  geographies,
}: {
  userId: string;
  organization: string | null;
  orgs: Org[];
  geographies: Geo[];
}) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]),
    [invitations, setInvitations] = useState<Invitation[]>([]),
    [create, setCreate] = useState(false),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [revision, setRevision] = useState(0),
    [page, setPage] = useState(0),
    [opPage, setOpPage] = useState(0),
    [more, setMore] = useState(false),
    [opMore, setOpMore] = useState(false),
    [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    let live = true;
    setBusy(true);
    setError("");
    setInvitations([]);
    setOpportunities([]);
    async function load() {
      let q = db!
        .from("work_invitations")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id")
        .range(page * 50, page * 50 + 50);
      q = organization
        ? q.eq("organization_id", organization)
        : q.eq("user_id", userId);
      const i = await q;
      if (i.error) throw i.error;
      const list = (i.data || []).slice(0, 50);
      let ops: Opportunity[] = [];
      let om = false;
      if (organization) {
        const o = await db!
          .from("work_opportunities")
          .select("*")
          .eq("organization_id", organization)
          .order("created_at", { ascending: false })
          .order("id")
          .range(opPage * 50, opPage * 50 + 50);
        if (o.error) throw o.error;
        ops = (o.data || []).slice(0, 50);
        om = (o.data || []).length > 50;
      }
      const missing = [...new Set(list.map((i) => i.opportunity_id))].filter(
        (id) => !ops.some((o) => o.id === id),
      );
      let linked: Opportunity[] = [];
      if (missing.length) {
        const r = await db!
          .from("work_opportunities")
          .select("*")
          .in("id", missing);
        if (r.error) throw r.error;
        linked = r.data || [];
      }
      if (live) {
        setInvitations(list);
        setMore((i.data || []).length > 50);
        setOpportunities([...ops, ...linked]);
        setOpMore(om);
        setPrimaryIds(ops.map((o) => o.id));
      }
    }
    load()
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [organization, userId, revision, page, opPage]);
  const [primaryIds, setPrimaryIds] = useState<string[]>([]);
  async function act(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setCreate(false);
      setMessage(success);
      setRevision((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  function newOpportunity(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    act(
      () =>
        rpc("create_opportunity", {
          p_org: organization,
          p_title: text(f, "title"),
          p_description: text(f, "description"),
          p_geography: text(f, "geo"),
          p_start: text(f, "start"),
          p_end: text(f, "end"),
          p_reply_by: new Date(text(f, "reply")).toISOString(),
          p_payment: text(f, "payment"),
          p_payment_note: text(f, "note"),
        }),
      "Opportunity created. Its details are fixed; close it and create another if terms change.",
    );
  }
  return (
    <section className="panel detail">
      <div className="panel-title">
        <h2>
          {organization ? "NGO opportunities & invitations" : "My invitations"}
        </h2>
        {organization && (
          <span>Project-linked opportunities are created in Workforce marketplace.</span>
        )}
      </div>
      <p>
        Invitations remain an interest/response channel. Formal survey-project
        assignment terms and field access are managed in Workforce marketplace.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {create && (
        <form onSubmit={newOpportunity}>
          <div className="form-grid">
            <label className="field">
              Title
              <input name="title" required minLength={3} maxLength={150} />
            </label>
            <label className="field">
              Work area
              <select name="geo" required>
                <option value="">Select area</option>
                {geographies
                  .filter((g) =>
                    geographyPath(g.id, geographies).every((n) => n.active),
                  )
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {geographyPath(g.id, geographies)
                        .map((n) => n.name)
                        .join(" / ")}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              Start date
              <input type="date" name="start" required />
            </label>
            <label className="field">
              End date
              <input type="date" name="end" required />
            </label>
            <label className="field">
              Reply deadline (your local time)
              <input type="datetime-local" name="reply" required />
            </label>
            <label className="field">
              Payment preference
              <select name="payment">
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
              </select>
            </label>
          </div>
          <label className="field">
            Expected tasks
            <textarea
              name="description"
              minLength={10}
              maxLength={4000}
              required
            />
          </label>
          <label className="field">
            Proposed payment / expense details
            <textarea name="note" maxLength={1000} />
          </label>
          <button className="primary" disabled={busy}>
            Create opportunity
          </button>
        </form>
      )}
      {busy && <p role="status">Loading…</p>}
      {organization && (
        <>
          <h3>Your opportunities</h3>
          {opportunities
            .filter((o) => primaryIds.includes(o.id))
            .map((o) => (
              <article className="document-row" key={o.id}>
                <h3>{o.title}</h3>
                <OpportunityDetails o={o} geographies={geographies} />
                <p>
                  Status:{" "}
                  {o.status === "open" && Date.parse(o.reply_by) <= clock
                    ? "Reply deadline passed"
                    : o.status}
                </p>
                {o.status === "open" && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Close this opportunity and cancel all pending invitations? Accepted responses remain in history.",
                        )
                      )
                        act(
                          () => rpc("close_opportunity", { p_id: o.id }),
                          "Opportunity closed.",
                        );
                    }}
                  >
                    Close opportunity
                  </button>
                )}
              </article>
            ))}
          <div className="actions">
            <button
              className="secondary"
              disabled={busy || !opPage}
              onClick={() => setOpPage((n) => n - 1)}
            >
              Previous opportunities
            </button>
            <button
              className="secondary"
              disabled={busy || !opMore}
              onClick={() => setOpPage((n) => n + 1)}
            >
              Next 50 opportunities
            </button>
          </div>
          <p>
            To invite someone, open Volunteers, shortlist them, then use Invite
            to opportunity on their directory row.
          </p>
        </>
      )}
      <h3>Invitation history</h3>
      {invitations.map((i) => {
        const o = opportunities.find((o) => o.id === i.opportunity_id);
        const expired = !!o && Date.parse(o.reply_by) <= clock;
        const active =
          i.status === "pending" && o?.status === "open" && !expired;
        return (
          <article className="document-row" key={i.id}>
            <h3>{o?.title || "Opportunity unavailable"}</h3>
            <p>
              {organization
                ? i.volunteer_name
                : orgs.find((n) => n.id === i.organization_id)?.name ||
                  "Partner NGO"}
            </p>
            <span className="badge">
              {i.status === "pending" && expired ? "expired" : i.status}
            </span>
            {o && <OpportunityDetails o={o} geographies={geographies} />}
            <div className="actions">
              {active && !organization && (
                <>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      act(
                        () =>
                          rpc("respond_work_invitation", {
                            p_id: i.id,
                            p_status: "accepted",
                            p_version: i.version,
                          }),
                        "Invitation accepted. NGO notified.",
                      )
                    }
                  >
                    Accept invitation
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      act(
                        () =>
                          rpc("respond_work_invitation", {
                            p_id: i.id,
                            p_status: "declined",
                            p_version: i.version,
                          }),
                        "Invitation declined.",
                      )
                    }
                  >
                    Decline
                  </button>
                </>
              )}
              {organization && i.status === "pending" && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    act(
                      () =>
                        rpc("cancel_work_invitation", {
                          p_id: i.id,
                          p_version: i.version,
                        }),
                      "Invitation cancelled.",
                    )
                  }
                >
                  Cancel invitation
                </button>
              )}
            </div>
          </article>
        );
      })}
      {!busy && !invitations.length && <p>No invitations on this page.</p>}
      <div className="actions">
        <button
          className="secondary"
          disabled={busy || !page}
          onClick={() => setPage((n) => n - 1)}
        >
          Previous invitations
        </button>
        <button
          className="secondary"
          disabled={busy || !more}
          onClick={() => setPage((n) => n + 1)}
        >
          Next 50 invitations
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => setRevision((n) => n + 1)}
        >
          Refresh
        </button>
      </div>
    </section>
  );
}
export function OpportunityDetails({
  o,
  geographies,
}: {
  o: Opportunity;
  geographies: Geo[];
}) {
  return (
    <>
      <p>
        {geographyPath(o.geography_id, geographies)
          .map((n) => n.name)
          .join(" / ")}{" "}
        · {o.start_date} – {o.end_date}
      </p>
      <p className="preserve-lines">{o.description}</p>
      <p>
        {o.payment_type} · {o.payment_note || "No additional terms"}
      </p>
      <p>Reply by {new Date(o.reply_by).toLocaleString()}</p>
    </>
  );
}
