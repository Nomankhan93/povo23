import { useEffect, useState, type FormEvent } from "react";
import { db, rpc } from "../../lib/supabase/client";
import type { Database } from "../../lib/supabase/database.types";
type Entry = Database["public"]["Tables"]["assistance_entries"]["Row"];
const text = (f: FormData, k: string) => String(f.get(k) || "").trim();
export function AssistancePanel({
  personId,
  changed,
  refreshKey,
}: {
  personId: string;
  changed: () => void;
  refreshKey: number;
}) {
  const [entries, setEntries] = useState<Entry[]>([]),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [rev, setRev] = useState(0),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [kind, setKind] = useState("cash"),
    [requestId, setRequestId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    let live = true;
    setBusy(true);
    db!
      .from("assistance_entries")
      .select("*")
      .eq("person_id", personId)
      .order("delivered_on", { ascending: false })
      .order("id")
      .range(page * 50, page * 50 + 50)
      .then((r) => {
        if (!live) return;
        if (r.error) setError(r.error.message);
        else {
          setEntries((r.data || []).slice(0, 50));
          setMore((r.data || []).length > 50);
        }
        setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [personId, page, rev, refreshKey]);
  async function act(
    task: () => Promise<unknown>,
    msg: string,
    done?: () => void,
  ) {
    setBusy(true);
    setError("");
    try {
      await task();
      done?.();
      setMessage(msg);
      setRev((n) => n + 1);
      changed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function record(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      form = e.currentTarget;
    void act(
      () =>
        rpc("record_assistance", {
          p_id: requestId,
          p_person: personId,
          p_kind: kind,
          p_category: text(f, "category"),
          p_program: text(f, "program"),
          p_description: text(f, "description"),
          p_amount: kind === "cash" ? Number(text(f, "amount")) : null,
          p_quantity: kind !== "cash" ? Number(text(f, "quantity")) : null,
          p_unit: kind !== "cash" ? text(f, "unit") : null,
          p_delivered: text(f, "delivered"),
          p_funding: text(f, "funding"),
          p_evidence: text(f, "evidence"),
          p_next: text(f, "next") || null,
        }),
      "Assistance recorded.",
      () => {
        form.reset();
        setRequestId(crypto.randomUUID());
        setKind("cash");
        setPage(0);
      },
    );
  }
  return (
    <section aria-label="Assistance">
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>} <h3>Assistance timeline</h3>
      <p>
        Recorded deliveries for this person in this project. Voided entries
        remain in history. Use this form only for genuine unplanned/historical
        support; a ready controlled distribution plan must be delivered from
        Beneficiary cases so duplicate-support review and plan linkage are preserved.
      </p>
      {!busy && !entries.length && <p>No assistance entries on this page.</p>}
      {entries.map((a) => (
        <article className="document-row" key={a.id}>
          <h4>{a.description}</h4>
          <p>
            <strong>
              {a.kind === "cash"
                ? `PKR ${Number(a.amount_pkr).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                : `${a.quantity} ${a.unit}`}
            </strong>{" "}
            · {a.category} · {a.status}
          </p>
          <p>
            {a.delivered_on} · {a.program} · Funded by {a.funding_source}
          </p>
          <p>Evidence reference: {a.evidence_reference}</p>
          {a.next_eligible_on && (
            <p>
              Next eligibility date: {a.next_eligible_on} (recorded guidance)
            </p>
          )}
          <details>
            <summary>Record and identity snapshot</summary>
            <p>
              Recorded by {a.created_by} ·{" "}
              {new Date(a.created_at).toLocaleString()} · Reference {a.id}
            </p>
            <pre className="survey-json">
              {JSON.stringify(a.identity_snapshot, null, 2)}
            </pre>
          </details>
          {a.status === "void" ? (
            <p>
              Voided: {a.void_reason} ·{" "}
              {a.voided_at && new Date(a.voided_at).toLocaleString()} ·{" "}
              {a.voided_by}
            </p>
          ) : (
            <details>
              <summary>Void incorrect entry</summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act(
                    () =>
                      rpc("void_assistance", {
                        p_id: a.id,
                        p_reason: text(f, "reason"),
                        p_version: a.version,
                      }),
                    "Entry voided. Its original details remain in history.",
                  );
                }}
              >
                <label className="field">
                  Reason
                  <textarea
                    name="reason"
                    required
                    minLength={5}
                    maxLength={1000}
                  />
                </label>
                <button className="secondary" disabled={busy}>
                  Void entry
                </button>
              </form>
            </details>
          )}
        </article>
      ))}
      <div className="actions">
        <button
          className="secondary"
          disabled={busy || page === 0}
          onClick={() => setPage((n) => n - 1)}
        >
          Previous
        </button>
        <span>Page {page + 1}</span>
        <button
          className="secondary"
          disabled={busy || !more}
          onClick={() => setPage((n) => n + 1)}
        >
          Next 50
        </button>
      </div>
      <details className="survey-question">
        <summary>Record unplanned / historical assistance</summary>
        <form onSubmit={record}>
          <fieldset disabled={busy}>
            <div className="form-grid">
              <label className="field">
                Type
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="cash">Cash (PKR)</option>
                  <option value="goods">Goods</option>
                  <option value="service">Service</option>
                </select>
              </label>
              <label className="field">
                Category
                <select name="category">
                  {[
                    "food",
                    "education",
                    "health",
                    "housing",
                    "livelihood",
                    "other",
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Program
                <input name="program" required minLength={2} maxLength={150} />
              </label>
              {kind === "cash" ? (
                <label className="field">
                  Amount in PKR
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    max="1000000000"
                    step="0.01"
                    required
                  />
                </label>
              ) : (
                <>
                  <label className="field">
                    Quantity
                    <input
                      name="quantity"
                      type="number"
                      min="0.001"
                      max="1000000"
                      step="0.001"
                      required
                    />
                  </label>
                  <label className="field">
                    Unit (e.g. packages, sessions)
                    <input name="unit" required maxLength={30} />
                  </label>
                </>
              )}
              <label className="field">
                Delivery date
                <input name="delivered" type="date" required />
              </label>
              <label className="field">
                Next eligibility date (optional)
                <input name="next" type="date" />
              </label>
              <label className="field">
                Funding source
                <input name="funding" required minLength={2} maxLength={200} />
              </label>
              <label className="field">
                Evidence reference
                <input
                  name="evidence"
                  required
                  minLength={3}
                  maxLength={500}
                  placeholder="Receipt or distribution register reference"
                />
              </label>
            </div>
            <label className="field">
              Delivered item / description
              <textarea
                name="description"
                required
                minLength={3}
                maxLength={1000}
              />
            </label>
            <p>
              Check this timeline and possible matches first. After an uncertain
              save, retry the same form without editing; the request reference
              prevents a second entry while this form stays open.
            </p>
            <button className="primary">Record delivery</button>
          </fieldset>
        </form>
      </details>
    </section>
  );
}
