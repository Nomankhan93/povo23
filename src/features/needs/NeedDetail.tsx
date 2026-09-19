import { useEffect, useRef, useState, type FormEvent } from "react";
import { db, rpc } from "../../lib/supabase/client";
import { Entry, Link, Need, states, T, title, val } from "./model";
import { Pager } from "../../components/ui/Pager";
export function NeedDetail({
  id,
  close,
  changed,
  refreshKey,
}: {
  id: string;
  close: () => void;
  changed: () => void;
  refreshKey: string;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.focus();
  }, [id]);
  const [need, setNeed] = useState<Need | null>(null),
    [entries, setEntries] = useState<Entry[]>([]),
    [links, setLinks] = useState<Link[]>([]),
    [linkedEntries, setLinkedEntries] = useState<Record<string, Entry>>({}),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [linkPage, setLinkPage] = useState(0),
    [linkMore, setLinkMore] = useState(false),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [rev, setRev] = useState(0),
    [history, setHistory] = useState<T["need_revisions"]["Row"][]>([]),
    [linkHistory, setLinkHistory] = useState<T["need_link_revisions"]["Row"][]>(
      [],
    );
  useEffect(() => {
    let live = true;
    setBusy(true);
    setError("");
    setHistory([]);
    setLinkHistory([]);
    async function load() {
      const n = await db!
        .from("beneficiary_needs")
        .select("*")
        .eq("id", id)
        .single();
      if (n.error) throw n.error;
      const [e, l] = await Promise.all([
        db!
          .from("assistance_entries")
          .select("*")
          .eq("person_id", n.data.person_id)
          .eq("status", "recorded")
          .order("delivered_on", { ascending: false })
          .order("id")
          .range(page * 50, page * 50 + 50),
        db!
          .from("need_assistance_links")
          .select("*")
          .eq("need_id", id)
          .order("assistance_id")
          .range(linkPage * 50, linkPage * 50 + 50),
      ]);
      if (e.error) throw e.error;
      if (l.error) throw l.error;
      const displayed = (l.data || []).slice(0, 50);
      const a = displayed.length
        ? await db!
            .from("assistance_entries")
            .select("*")
            .in(
              "id",
              displayed.map((l) => l.assistance_id),
            )
        : { data: [], error: null };
      if (a.error) throw a.error;
      if (live) {
        setNeed(n.data);
        setEntries((e.data || []).slice(0, 50));
        setMore((e.data || []).length > 50);
        setLinks(displayed);
        setLinkMore((l.data || []).length > 50);
        setLinkedEntries(
          Object.fromEntries((a.data || []).map((a) => [a.id, a])),
        );
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
  }, [id, page, linkPage, rev, refreshKey]);
  async function act(task: () => Promise<unknown>, msg: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
      setMessage(msg);
      setRev((n) => n + 1);
      changed();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  function update(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!need) return;
    const f = new FormData(e.currentTarget);
    void act(
      () =>
        rpc("update_beneficiary_need", {
          p_id: id,
          p_description: val(f, "description"),
          p_priority: val(f, "priority"),
          p_status: val(f, "status"),
          p_follow_up: val(f, "followup") || null,
          p_reason: val(f, "reason"),
          p_version: need.version,
        }),
      "Need reviewed.",
    );
  }
  function link(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!need) return;
    const f = new FormData(e.currentTarget),
      aid = val(f, "assistance");
    void act(async () => {
      const l = await db!
        .from("need_assistance_links")
        .select("version")
        .eq("need_id", id)
        .eq("assistance_id", aid)
        .maybeSingle();
      if (l.error) throw l.error;
      await rpc("set_need_assistance_link", {
        p_need: id,
        p_assistance: aid,
        p_active: true,
        p_reason: val(f, "reason"),
        p_need_version: need.version,
        p_link_version: l.data?.version || 0,
      });
    }, "Assistance linked. Confirm the outcome separately.");
  }
  return (
    <section
      ref={panel}
      tabIndex={-1}
      className="registry-operations"
      aria-label="Need review"
    >
      <div className="panel-title">
        <h3>Review assessed need</h3>
        <button className="secondary" onClick={close}>
          Close need
        </button>
      </div>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {busy && <p role="status">Loading…</p>}
      {need && (
        <>
          <p>
            {need.category} · {title(need.status)} · v{need.version}
          </p>
          <p>Last review: {need.last_reason}</p>
          <form key={need.version} onSubmit={update}>
            <fieldset disabled={busy}>
              <label className="field">
                Description
                <textarea
                  name="description"
                  required
                  minLength={5}
                  maxLength={1000}
                  defaultValue={need.description}
                />
              </label>
              <div className="form-grid">
                <label className="field">
                  Priority
                  <select name="priority" defaultValue={need.priority}>
                    {["low", "medium", "high"].map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Status
                  <select name="status" defaultValue={need.status}>
                    {states.map((s) => (
                      <option key={s} value={s}>
                        {s === "closed"
                          ? "closed — not counted as met"
                          : title(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Follow-up date
                  <input
                    name="followup"
                    type="date"
                    defaultValue={need.follow_up_on || ""}
                  />
                </label>
              </div>
              <label className="field">
                Outcome / review reason
                <textarea
                  name="reason"
                  required
                  minLength={5}
                  maxLength={1000}
                />
              </label>
              <p>
                “Met” requires active, recorded assistance links and your
                outcome assessment. Remove voided links first. “Closed” means no
                further follow-up, not a successful outcome.
              </p>
              <button className="primary">Save review</button>
            </fieldset>
          </form>
          <h4>Linked assistance</h4>
          {!links.length && !busy && <p>No links on this page.</p>}
          {links.map((l) => {
            const a = linkedEntries[l.assistance_id];
            return (
              <article className="document-row" key={l.assistance_id}>
                <strong>{a?.description || l.assistance_id}</strong>
                <p>
                  {a?.delivered_on} ·{" "}
                  {a?.kind === "cash"
                    ? `PKR ${a.amount_pkr}`
                    : `${a?.quantity ?? ""} ${a?.unit ?? ""}`}{" "}
                  · Delivery {a?.status || "unavailable"} · Link{" "}
                  {l.active ? "active" : "removed"}
                </p>
                <p>{l.reason}</p>
                {l.active && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void act(
                        () =>
                          rpc("set_need_assistance_link", {
                            p_need: id,
                            p_assistance: l.assistance_id,
                            p_active: false,
                            p_reason: val(f, "reason"),
                            p_need_version: need.version,
                            p_link_version: l.version,
                          }),
                        "Link removed; history retained.",
                      );
                    }}
                  >
                    <label className="field">
                      Reason to remove link
                      <input
                        name="reason"
                        required
                        minLength={5}
                        maxLength={1000}
                      />
                    </label>
                    <button
                      className="secondary"
                      disabled={busy || need.status === "closed"}
                    >
                      Remove link
                    </button>
                  </form>
                )}
              </article>
            );
          })}
          <Pager
            page={linkPage}
            more={linkMore}
            busy={busy}
            onChange={setLinkPage}
          />
          <details className="survey-question">
            <summary>Link a recorded delivery</summary>
            <p>
              Choose assistance for this same person and project. Linking does
              not allocate money or prevent linking a delivery to another need.
            </p>
            <form onSubmit={link}>
              <fieldset disabled={busy || need.status === "closed"}>
                <label className="field">
                  Recorded assistance
                  <select name="assistance" required>
                    <option value="">Choose delivery</option>
                    {entries.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.delivered_on} · {a.description} ·{" "}
                        {a.kind === "cash"
                          ? `PKR ${a.amount_pkr}`
                          : `${a.quantity} ${a.unit}`}{" "}
                        · {a.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  How this delivery addresses the need
                  <textarea
                    name="reason"
                    required
                    minLength={5}
                    maxLength={1000}
                  />
                </label>
                <button className="secondary">Link delivery</button>
              </fieldset>
            </form>
            <Pager page={page} more={more} busy={busy} onChange={setPage} />
          </details>
          <details className="survey-question">
            <summary>Assessment provenance</summary>
            <p>
              Source response: {need.source_response_id} · approved version{" "}
              {need.source_response_version}
            </p>
            <p>
              Created by {need.created_by} ·{" "}
              {new Date(need.created_at).toLocaleString()}
            </p>
            <p>
              Last updated by {need.updated_by} ·{" "}
              {new Date(need.updated_at).toLocaleString()}
            </p>
            <pre className="survey-json">
              {JSON.stringify(need.identity_snapshot, null, 2)}
            </pre>
          </details>
          <button
            className="secondary"
            disabled={busy}
            onClick={async () => {
              const [h, l] = await Promise.all([
                db!
                  .from("need_revisions")
                  .select("*")
                  .eq("need_id", id)
                  .order("version", { ascending: false })
                  .limit(50),
                db!
                  .from("need_link_revisions")
                  .select("*")
                  .eq("need_id", id)
                  .order("recorded_at", { ascending: false })
                  .order("assistance_id")
                  .order("version", { ascending: false })
                  .limit(50),
              ]);
              if (h.error || l.error)
                setError(h.error?.message || l.error!.message);
              else {
                setHistory(h.data || []);
                setLinkHistory(l.data || []);
              }
            }}
          >
            Show latest 50 assessment and link revisions
          </button>
          {history.map((h) => (
            <details key={h.version}>
              <summary>
                Assessment v{h.version} ·{" "}
                {new Date(h.recorded_at).toLocaleString()}
              </summary>
              <pre className="survey-json">
                {JSON.stringify(h.snapshot, null, 2)}
              </pre>
            </details>
          ))}
          {linkHistory.map((l) => (
            <details key={l.assistance_id + "-" + l.version}>
              <summary>
                Link {l.assistance_id} · v{l.version}
              </summary>
              <pre className="survey-json">
                {JSON.stringify(l.snapshot, null, 2)}
              </pre>
            </details>
          ))}
        </>
      )}
    </section>
  );
}
