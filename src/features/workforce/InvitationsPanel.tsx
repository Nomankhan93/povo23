import { useEffect, useState } from "react";
import { Alert, Button, StatusBadge, type SemanticTone } from "../../components/ui/FieldLanceUI";
import { db, rpc } from "../../lib/supabase/client";
import { geographyPath, type Geo } from "../geography/model";
import { Invitation, Opportunity, Org } from "./model";
import styles from "./InvitationsPanel.module.css";

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
          .is("survey_project_id", null)
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
      setMessage(success);
      setRevision((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <section className={styles.root}>
      <div className={styles.intro}>
        <span className="fl-eyebrow">DIRECT INVITATIONS</span>
        <h2>{organization ? "Invitation history" : "My invitations"}</h2>
        <p>
          Invitations are a recruitment-interest step. Accepting an invitation does not create an assignment or start field work; a formal assignment offer must still be accepted.
        </p>
      </div>
      {error && <Alert tone="danger" title="Invitation action failed">{error}</Alert>}
      {message && <Alert tone="success" title={message} />}
      {busy && <p role="status" className={styles.helper}>Loading invitations…</p>}

      {organization && (
        <section className={styles.section} aria-labelledby="invitation-opportunities-heading">
          <div className={styles.sectionHeader}>
            <div>
              <h3 id="invitation-opportunities-heading">Historical invitation-only opportunities</h3>
              <p>Project-linked marketplace opportunities are managed from Workforce marketplace. These records remain here for historical invitation workflows.</p>
            </div>
          </div>
          <div className={styles.list}>
            {opportunities
              .filter((o) => primaryIds.includes(o.id))
              .map((o) => {
                const expired = o.status === "open" && Date.parse(o.reply_by) <= clock;
                const displayStatus = expired ? "expired" : o.status;
                return (
                  <article className={styles.card} key={o.id}>
                    <div className={styles.cardHeader}>
                      <div>
                        <h4>{o.title}</h4>
                        <p>Invitation-only recruitment record</p>
                      </div>
                      <StatusBadge tone={statusTone(displayStatus)}>{displayStatus.replaceAll("_", " ")}</StatusBadge>
                    </div>
                    <OpportunityDetails o={o} geographies={geographies} />
                    {o.status === "open" && (
                      <div className={styles.actions}>
                        <Button
                          variant="secondary"
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Close this opportunity and cancel all pending invitations? Accepted responses remain in history.",
                              )
                            )
                              void act(
                                () => rpc("close_opportunity", { p_id: o.id }),
                                "Opportunity closed.",
                              );
                          }}
                        >
                          Close opportunity
                        </Button>
                      </div>
                    )}
                  </article>
                );
              })}
          </div>
          {!busy && !opportunities.filter((o) => primaryIds.includes(o.id)).length && (
            <p className={styles.empty}>No standalone invitation-only opportunities on this page.</p>
          )}
          <div className={styles.pagination} aria-label="Invitation-only opportunity pages">
            <Button
              variant="secondary"
              type="button"
              disabled={busy || !opPage}
              onClick={() => setOpPage((n) => n - 1)}
            >
              Previous opportunities
            </Button>
            <Button
              variant="secondary"
              type="button"
              disabled={busy || !opMore}
              onClick={() => setOpPage((n) => n + 1)}
            >
              Next 50 opportunities
            </Button>
          </div>
          <p className={styles.helper}>
            To invite someone, open Volunteers, shortlist them, then use Invite to opportunity on their directory row.
          </p>
        </section>
      )}

      <section className={styles.section} aria-labelledby="invitation-history-heading">
        <div className={styles.sectionHeader}>
          <div>
            <h3 id="invitation-history-heading">{organization ? "Direct invitation records" : "Invitation history"}</h3>
            <p>{organization ? "Track invitation responses without confusing them with formal assignment offers." : "Review the project invitation and respond while it remains open."}</p>
          </div>
        </div>
        <div className={styles.list}>
          {invitations.map((i) => {
            const o = opportunities.find((o) => o.id === i.opportunity_id);
            const expired = !!o && Date.parse(o.reply_by) <= clock;
            const active = i.status === "pending" && o?.status === "open" && !expired;
            const displayStatus = i.status === "pending" && expired ? "expired" : i.status;
            const counterpart = organization
              ? i.volunteer_name
              : orgs.find((n) => n.id === i.organization_id)?.name || "Partner NGO";
            return (
              <article className={styles.card} key={i.id}>
                <div className={styles.cardHeader}>
                  <div>
                    <h4>{o?.title || "Opportunity unavailable"}</h4>
                    <p>{counterpart}</p>
                  </div>
                  <StatusBadge tone={statusTone(displayStatus)}>{displayStatus.replaceAll("_", " ")}</StatusBadge>
                </div>
                {!organization && active && (
                  <p className={styles.invitationMeaning}>
                    You are being invited to express interest in this project. Accepting this invitation does not start field work; the organization must still send a formal assignment offer that you accept.
                  </p>
                )}
                {o && <OpportunityDetails o={o} geographies={geographies} />}
                <div className={styles.actions}>
                  {active && !organization && (
                    <>
                      <Button
                        variant="secondary"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void act(
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
                      </Button>
                      <Button
                        variant="primary"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void act(
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
                      </Button>
                    </>
                  )}
                  {organization && i.status === "pending" && (
                    <Button
                      variant="secondary"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void act(
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
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        {!busy && !invitations.length && <p className={styles.empty}>No invitations on this page.</p>}
        <div className={styles.pagination} aria-label="Invitation pages">
          <Button
            variant="secondary"
            type="button"
            disabled={busy || !page}
            onClick={() => setPage((n) => n - 1)}
          >
            Previous invitations
          </Button>
          <Button
            variant="secondary"
            type="button"
            disabled={busy || !more}
            onClick={() => setPage((n) => n + 1)}
          >
            Next 50 invitations
          </Button>
          <Button
            variant="tertiary"
            type="button"
            disabled={busy}
            onClick={() => setRevision((n) => n + 1)}
          >
            Refresh
          </Button>
        </div>
      </section>
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
      <div className={styles.meta}>
        <span><strong>Work area</strong>{geographyPath(o.geography_id, geographies).map((n) => n.name).join(" / ") || "Area unavailable"}</span>
        <span><strong>Dates</strong>{o.start_date} – {o.end_date}</span>
        <span><strong>Terms</strong>{o.payment_type} · {o.payment_note || "No additional terms"}</span>
        <span><strong>Reply by</strong>{new Date(o.reply_by).toLocaleString()}</span>
      </div>
      <p className={styles.description}>{o.description}</p>
    </>
  );
}

function statusTone(status: string): SemanticTone {
  if (["accepted", "active", "completed"].includes(status)) return "success";
  if (["pending", "offered"].includes(status)) return "warning";
  if (["declined", "cancelled", "canceled", "expired", "closed"].includes(status)) return "neutral";
  return "info";
}
