import { useEffect, useState, type FormEvent } from "react";
import { db, rpc } from "../../lib/supabase/client";
import { categories, Need, pending, states, T, title, val } from "./model";
import { NeedDetail } from "./NeedDetail";
import { Pager } from "./Pager";
export function NeedsPanel({
  projectId,
  personId,
  onChanged,
  refreshKey = 0,
}: {
  projectId: string;
  personId?: string;
  onChanged: () => void;
  refreshKey?: number;
}) {
  const [rows, setRows] = useState<Need[]>([]),
    [names, setNames] = useState<Record<string, string>>({}),
    [summary, setSummary] = useState<Record<string, number | string>>({}),
    [today, setToday] = useState(""),
    [responses, setResponses] = useState<T["survey_responses"]["Row"][]>([]),
    [status, setStatus] = useState(""),
    [category, setCategory] = useState(""),
    [overdue, setOverdue] = useState(false),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [rev, setRev] = useState(0),
    [chosen, setChosen] = useState<string | null>(null),
    [request, setRequest] = useState(() => crypto.randomUUID());
  useEffect(() => {
    let live = true;
    setBusy(true);
    setError("");
    async function load() {
      const s = (await rpc("project_needs_summary", {
        p_project: projectId,
        p_person: personId || null,
      })) as Record<string, number | string>;
      let q = db!
        .from("beneficiary_needs")
        .select("*")
        .eq("project_id", projectId)
        .order("follow_up_on", { ascending: true, nullsFirst: false })
        .order("id")
        .range(page * 50, page * 50 + 50);
      if (personId) q = q.eq("person_id", personId);
      if (status) q = q.eq("status", status);
      if (category) q = q.eq("category", category);
      if (overdue)
        q = q.in("status", pending).lt("follow_up_on", String(s.utc_today));
      const r = await q;
      if (r.error) throw r.error;
      const items = (r.data || []).slice(0, 50);
      const ids = [...new Set(items.map((n) => n.person_id))];
      const n = ids.length
        ? await db!
            .from("registry_persons")
            .select("id,full_name,registry_no")
            .in("id", ids)
        : { data: [], error: null };
      if (n.error) throw n.error;
      if (live) {
        setRows(items);
        setMore((r.data || []).length > 50);
        setSummary(s);
        setToday(String(s.utc_today));
        setNames(
          Object.fromEntries(
            (n.data || []).map((p) => [
              p.id,
              `${p.full_name} · BEN-${p.registry_no}`,
            ]),
          ),
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
  }, [projectId, personId, status, category, overdue, page, rev, refreshKey]);
  useEffect(() => {
    if (!personId) return;
    let live = true;
    db!
      .from("survey_responses")
      .select("*")
      .eq("person_id", personId)
      .eq("status", "approved")
      .order("reviewed_at", { ascending: false })
      .limit(50)
      .then((r) => {
        if (!live) return;
        if (r.error) setError(r.error.message);
        else setResponses(r.data || []);
      });
    return () => {
      live = false;
    };
  }, [personId, rev, refreshKey]);
  function refresh() {
    setRev((n) => n + 1);
    onChanged();
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      form = e.currentTarget;
    setBusy(true);
    setError("");
    try {
      await rpc("create_beneficiary_need", {
        p_id: request,
        p_response: val(f, "response"),
        p_category: val(f, "category"),
        p_description: val(f, "description"),
        p_priority: val(f, "priority"),
        p_follow_up: val(f, "followup") || null,
        p_reason: val(f, "reason"),
      });
      form.reset();
      setRequest(crypto.randomUUID());
      setMessage("Need recorded. Review existing needs before adding another.");
      setPage(0);
      refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <section
      className="needs-panel"
      aria-label={personId ? "Person needs" : "Project needs overview"}
    >
      <h3>{personId ? "Needs and follow-up" : "Project needs overview"}</h3>
      <p>
        Recorded needs: {summary.total ?? "—"} · People: {summary.people ?? "—"}{" "}
        · Open: {summary.open ?? "—"} · In progress:{" "}
        {summary.in_progress ?? "—"} · Met: {summary.met ?? "—"} · Needs review:{" "}
        {summary.needs_review ?? "—"} · Closed: {summary.closed ?? "—"}
      </p>
      <p>
        <strong>
          Overdue follow-ups: {summary.overdue ?? "—"} · High-priority pending:{" "}
          {summary.high_priority_pending ?? "—"}
        </strong>
      </p>
      <p>
        Counts cover all recorded needs in this{" "}
        {personId ? "person’s project record" : "project"}, independent of list
        filters. They do not measure all community needs or deduplicated people
        across projects.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <div className="form-grid">
        <label className="field">
          Status
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All statuses</option>
            {states.map((s) => (
              <option key={s} value={s}>
                {title(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Category
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="checklabel">
        <input
          type="checkbox"
          checked={overdue}
          onChange={(e) => {
            setOverdue(e.target.checked);
            setPage(0);
          }}
        />
        Overdue pending follow-ups only (UTC)
      </label>
      {busy && <p role="status">Loading needs…</p>}
      {!busy && !rows.length && <p>No needs match these filters.</p>}
      {rows.map((n) => (
        <article className="document-row" key={n.id}>
          <strong>{n.description}</strong>
          <p>{names[n.person_id] || n.person_id}</p>
          <p>
            {n.category} · {n.priority} priority · {title(n.status)} ·
            Follow-up: {n.follow_up_on || "Not scheduled"}
            {n.follow_up_on &&
            n.follow_up_on < today &&
            pending.includes(n.status)
              ? " — overdue"
              : ""}
          </p>
          <button className="secondary" onClick={() => setChosen(n.id)}>
            Review need / linked assistance
          </button>
        </article>
      ))}
      <Pager page={page} more={more} busy={busy} onChange={setPage} />
      {chosen && (
        <NeedDetail
          key={chosen}
          id={chosen}
          refreshKey={`${rev}-${refreshKey}`}
          close={() => setChosen(null)}
          changed={refresh}
        />
      )}
      {personId && (
        <details className="survey-question">
          <summary>Record assessed need</summary>
          <p>
            Choose an approved source survey. Check existing needs first;
            another request can create a separate need in the same category.
          </p>
          <form onSubmit={create}>
            <fieldset disabled={busy}>
              <label className="field">
                Source survey (latest 50 approved)
                <select name="response" required>
                  <option value="">Choose approved response</option>
                  {responses.map((r) => (
                    <option key={r.id} value={r.id}>
                      {new Date(r.created_at).toLocaleDateString()} · {r.id} · v
                      {r.version}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-grid">
                <label className="field">
                  Category
                  <select name="category">
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Priority
                  <select name="priority" defaultValue="medium">
                    {["low", "medium", "high"].map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Follow-up date (optional)
                  <input name="followup" type="date" />
                </label>
              </div>
              <label className="field">
                Assessed need
                <textarea
                  name="description"
                  minLength={5}
                  maxLength={1000}
                  required
                />
              </label>
              <label className="field">
                Assessment evidence / reason
                <textarea
                  name="reason"
                  minLength={5}
                  maxLength={1000}
                  required
                />
              </label>
              <p>
                If a save is uncertain, retry this form unchanged. After closing
                or refreshing, check the needs list before creating another
                record.
              </p>
              <button className="primary">Record need</button>
            </fieldset>
          </form>
        </details>
      )}
    </section>
  );
}
