import { useEffect, useRef, useState, type FormEvent } from "react";
import { db, rpc } from "../../lib/supabase/client";
import { type Database } from "../../lib/supabase/database.types";
import { AssistancePanel } from "../assistance/AssistancePanel";
import { NeedsPanel } from "../needs/NeedsPanel";
export type T = Database["public"]["Tables"];
export type Person = T["registry_persons"]["Row"];
export type Entry = T["assistance_entries"]["Row"];
export type Candidate = {
  id: string;
  registry_no: number;
  full_name: string;
  birth_date: string | null;
  household_id: string;
  version: number;
  signals: string[];
  status: string | null;
  reason: string | null;
  decision_version: number | null;
  stale: boolean;
};
export const text = (f: FormData, k: string) => String(f.get(k) || "").trim();
export const ben = (n: number) => "FL-BEN-" + String(n).padStart(8, "0");
export const label = (s: string) => s.replaceAll("_", " ");
export function RegistryOperations({
  personId,
  close,
  changed,
  refreshKey = 0,
}: {
  personId: string;
  close: () => void;
  changed: () => void;
  refreshKey?: number;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.focus();
  }, [personId]);
  const [person, setPerson] = useState<Person | null>(null),
    [history, setHistory] = useState<T["registry_person_revisions"]["Row"][]>(
      [],
    ),
    [candidates, setCandidates] = useState<Candidate[]>([]),
    [houses, setHouses] = useState<T["registry_households"]["Row"][]>([]),
    [houseQuery, setHouseQuery] = useState(""),
    [matchHistory, setMatchHistory] = useState<
      T["registry_match_revisions"]["Row"][]
    >([]),
    [matchOpen, setMatchOpen] = useState(""),
    [rev, setRev] = useState(0),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [correction, setCorrection] = useState(false);
  useEffect(() => {
    let live = true;
    setBusy(true);
    setError("");
    setMatchOpen("");
    setMatchHistory([]);
    async function load() {
      const results = await Promise.all([
        db!.from("registry_persons").select("*").eq("id", personId).single(),
        db!
          .from("registry_person_revisions")
          .select("*")
          .eq("person_id", personId)
          .order("version", { ascending: false })
          .limit(50),
      ]);
      for (const r of results) if (r.error) throw r.error;
      const matches = await rpc("registry_match_candidates", {
        p_person: personId,
      });
      if (live) {
        setPerson(results[0].data);
        setHistory(results[1].data || []);
        setCandidates(matches as unknown as Candidate[]);
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
  }, [personId, rev, refreshKey]);
  useEffect(() => {
    if (!person || !correction) return;
    let live = true;
    db!
      .from("registry_households")
      .select("*")
      .eq("project_id", person.project_id)
      .ilike(
        "label",
        "%" + houseQuery.replaceAll("%", "").replaceAll("_", "") + "%",
      )
      .order("label")
      .order("id")
      .limit(50)
      .then((r) => {
        if (!live) return;
        if (r.error) setError(r.error.message);
        else setHouses(r.data || []);
      });
    return () => {
      live = false;
    };
  }, [person?.project_id, houseQuery, correction]);
  async function act(
    task: () => Promise<unknown>,
    msg: string,
    done?: () => void,
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
      done?.();
      setMessage(msg);
      setRev((n) => n + 1);
      changed();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  function correct(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!person) return;
    const f = new FormData(e.currentTarget);
    void act(
      () =>
        rpc("correct_registry_person", {
          p_id: person.id,
          p_name: text(f, "name"),
          p_birth: text(f, "birth") || null,
          p_household: text(f, "household"),
          p_reason: text(f, "reason"),
          p_version: person.version,
        }),
      "Identity corrected; earlier survey and assistance snapshots remain unchanged.",
      () => setCorrection(false),
    );
  }
  async function showHistory(c: Candidate) {
    setError("");
    setMatchOpen("");
    const [a, b] = [personId, c.id].sort();
    const r = await db!
      .from("registry_match_revisions")
      .select("*")
      .eq("person_a", a)
      .eq("person_b", b)
      .order("version", { ascending: false })
      .limit(50);
    if (r.error) setError(r.error.message);
    else {
      setMatchHistory(r.data || []);
      setMatchOpen(c.id);
    }
  }
  return (
    <section
      ref={panel}
      tabIndex={-1}
      className="registry-operations"
      aria-label="Registry review and assistance"
    >
      <div className="panel-title">
        <h3>
          {person
            ? `${ben(person.registry_no)} · ${person.full_name}`
            : "Registry record"}
        </h3>
        <button className="secondary" onClick={close}>
          Close record
        </button>
      </div>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {busy && <p role="status">Loading record…</p>}
      {person && (
        <>
          <p>
            {person.birth_date || "Birth date unknown"} · Identity provisional ·
            Revision {person.version}
          </p>
          <details
            className="survey-question"
            open={correction}
            onToggle={(e) => setCorrection(e.currentTarget.open)}
          >
            <summary>Correct identity details</summary>
            <form key={person.version} onSubmit={correct}>
              <fieldset disabled={busy}>
                <div className="form-grid">
                  <label className="field">
                    Full name
                    <input
                      name="name"
                      required
                      minLength={2}
                      maxLength={200}
                      defaultValue={person.full_name}
                    />
                  </label>
                  <label className="field">
                    Birth date (blank if unknown)
                    <input
                      name="birth"
                      type="date"
                      defaultValue={person.birth_date || ""}
                    />
                  </label>
                </div>
                <label className="field">
                  Find household in this project (first 50 matches)
                  <input
                    value={houseQuery}
                    onChange={(e) => setHouseQuery(e.target.value)}
                    maxLength={100}
                  />
                </label>
                <label className="field">
                  Household
                  <select name="household" defaultValue={person.household_id}>
                    <option value={person.household_id}>
                      Current household
                    </option>
                    {houses
                      .filter((h) => h.id !== person.household_id)
                      .map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.label}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field">
                  Correction reason
                  <textarea
                    name="reason"
                    minLength={5}
                    maxLength={1000}
                    required
                  />
                </label>
                <button className="primary">Save correction</button>
              </fieldset>
            </form>
          </details>
          <details className="survey-question">
            <summary>Identity history · latest 50 revisions</summary>
            {history.map((h) => (
              <details key={h.version}>
                <summary>
                  v{h.version} · {h.reason} ·{" "}
                  {new Date(h.recorded_at).toLocaleString()}
                </summary>
                <pre className="survey-json">
                  {JSON.stringify(h.snapshot, null, 2)}
                </pre>
                <p>Recorded by: {h.actor_id || "Upgrade baseline"}</p>
              </details>
            ))}
          </details>
          <NeedsPanel
            refreshKey={rev + refreshKey}
            projectId={person.project_id}
            personId={person.id}
            onChanged={() => {
              setRev((n) => n + 1);
              changed();
            }}
          />
          <h3>Possible identity matches</h3>
          <p>
            Compare the evidence before deciding. A shared household or birth
            date alone does not establish identity. Decisions do not merge
            records or combine assistance histories.
          </p>
          {!busy && !candidates.length && (
            <p>
              No candidates found by the current rules. This does not establish
              that the person is unique.
            </p>
          )}
          {candidates.length > 50 && (
            <p role="status">
              Showing the first 50 candidates. Additional candidates exist; use
              registry search to inspect other records.
            </p>
          )}
          {candidates.slice(0, 50).map((c) => (
            <article className="survey-question" key={c.id}>
              <h4>
                {ben(c.registry_no)} · {c.full_name}
              </h4>
              <p>{c.birth_date || "Birth date unknown"}</p>
              <p>{c.signals.join(" · ") || "Previously reviewed pair"}</p>
              <p>
                Decision: {c.status ? label(c.status) : "Not reviewed"}
                {c.stale ? " — identity changed; review again" : ""}
              </p>
              {c.reason && <p>{c.reason}</p>}
              <form
                key={`${c.decision_version}-${c.version}-${person.version}`}
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act(
                    () =>
                      rpc("review_registry_match", {
                        p_person: personId,
                        p_other: c.id,
                        p_status: text(f, "status"),
                        p_reason: text(f, "reason"),
                        p_person_version: person.version,
                        p_other_version: c.version,
                        p_version: c.decision_version || 0,
                      }),
                    "Match decision saved. Both records remain separate.",
                  );
                }}
              >
                <fieldset disabled={busy}>
                  <label className="field">
                    Decision
                    <select
                      name="status"
                      defaultValue={
                        c.stale ? "needs_review" : c.status || "needs_review"
                      }
                    >
                      <option value="needs_review">Needs review</option>
                      <option value="different_people">Different people</option>
                      <option value="same_person">
                        Same person — flag only
                      </option>
                    </select>
                  </label>
                  <label className="field">
                    Evidence / reason
                    <textarea
                      name="reason"
                      minLength={5}
                      maxLength={1000}
                      required
                    />
                  </label>
                  <button className="secondary">Save decision</button>
                </fieldset>
              </form>
              {c.decision_version && (
                <button
                  className="link"
                  disabled={busy}
                  onClick={() => void showHistory(c)}
                >
                  Show decision history
                </button>
              )}
              {matchOpen === c.id &&
                matchHistory.map((h) => (
                  <details key={h.version}>
                    <summary>
                      Decision v{h.version} ·{" "}
                      {new Date(h.recorded_at).toLocaleString()}
                    </summary>
                    <pre className="survey-json">
                      {JSON.stringify(h.snapshot, null, 2)}
                    </pre>
                  </details>
                ))}
            </article>
          ))}
          <AssistancePanel
            personId={personId}
            refreshKey={rev + refreshKey}
            changed={changed}
          />
        </>
      )}
    </section>
  );
}
