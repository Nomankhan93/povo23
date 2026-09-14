import { useEffect, useState, type FormEvent } from "react";
import { db, rpc } from "../../lib/supabase/client";
import { type Json } from "../../lib/supabase/database.types";
import { Question, Template } from "./model";
import { Pager } from "./Pager";
export function SurveyTemplates() {
  const [rows, setRows] = useState<Template[]>([]),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [rev, setRev] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [name, setName] = useState(""),
    [qs, setQs] = useState<Question[]>([]);
  useEffect(() => {
    let live = true;
    setBusy(true);
    db!
      .from("survey_templates")
      .select("*")
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
  }, [page, rev]);
  async function publish(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await rpc("publish_survey_template", {
        p_name: name,
        p_questions: qs as unknown as Json,
      });
      setMessage(
        "Published. Existing versions and their projects remain unchanged.",
      );
      setQs([]);
      setName("");
      setRev((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  const update = (i: number, patch: Partial<Question>) =>
    setQs((q) => q.map((v, n) => (n === i ? { ...v, ...patch } : v)));
  return (
    <section className="panel detail">
      <h2>Publish a survey template</h2>
      <p>
        Build questions below. Publishing the same name creates the next
        version. This editor is not saved until you publish.
      </p>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <form onSubmit={publish}>
        <label className="field">
          Template name
          <input
            required
            minLength={3}
            maxLength={150}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {qs.map((q, i) => (
          <fieldset className="survey-question" key={q.id}>
            <legend>Question {i + 1}</legend>
            <label className="field">
              Label
              <input
                required
                maxLength={300}
                value={q.label}
                onChange={(e) => update(i, { label: e.target.value })}
              />
            </label>
            <label className="field">
              Answer type
              <select
                value={q.type}
                onChange={(e) =>
                  update(i, { type: e.target.value as Question["type"], min:undefined,max:undefined,after:undefined })
                }
              >
                {["text", "number", "date", "choice", "yesno", "multiple", "phone", "identity", "household", "gps", "photo", "document"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            {(q.type === "choice" || q.type === "multiple") && (
              <label className="field">
                Choices, one per line
                <textarea
                  value={q.options?.join("\n") || ""}
                  onChange={(e) =>
                    update(i, { options: e.target.value.split("\n") })
                  }
                />
              </label>
            )}
            {q.type==='number'&&<div className="actions">{(['min','max'] as const).map(key=><label className="field" key={key}>{key}<input type="number" step="any" value={q[key]??''} onChange={e=>update(i,{[key]:e.target.value===''?undefined:Number(e.target.value)})}/></label>)}</div>}
            {q.type==='date'&&<label className="field">Must be on or after<select value={q.after||''} onChange={e=>update(i,{after:e.target.value||undefined})}><option value="">No date comparison</option>{qs.slice(0,i).filter(p=>p.type==='date').map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>}
            <label className="field">Show only when<select value={q.when?.question||''} onChange={e=>{const parent=qs.find(p=>p.id===e.target.value);update(i,{when:parent?{question:parent.id,equals:parent.type==='yesno'?true:parent.options?.[0]||''}:undefined})}}><option value="">Always show</option>{qs.slice(0,i).filter(p=>p.type==='choice'||p.type==='yesno').map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
            {q.when&&<label className="field">Equals<select value={String(q.when.equals)} onChange={e=>update(i,{when:{question:q.when!.question,equals:qs.find(p=>p.id===q.when!.question)?.type==='yesno'?e.target.value==='true':e.target.value}})}>{(qs.find(p=>p.id===q.when!.question)?.type==='yesno'?['true','false']:qs.find(p=>p.id===q.when!.question)?.options||[]).map(o=><option key={o} value={o}>{o==='true'?'Yes':o==='false'?'No':o}</option>)}</select></label>}
            <label className="checklabel">
              <input
                type="checkbox"
                checked={q.required}
                onChange={(e) => update(i, { required: e.target.checked })}
              />
              Required on submission
            </label>
            <button
              className="secondary"
              type="button"
              onClick={() => setQs((items) => items.filter((_, n) => n !== i))}
            >
              Remove question
            </button>
          </fieldset>
        ))}
        <div className="actions">
          <button
            className="secondary"
            type="button"
            disabled={qs.length >= 50 || busy}
            onClick={() =>
              setQs((q) => [
                ...q,
                {
                  id: "q_" + crypto.randomUUID().replaceAll("-", ""),
                  label: "",
                  type: "text",
                  required: false,
                },
              ])
            }
          >
            Add question
          </button>
          <button className="primary" disabled={busy || !qs.length}>
            Publish immutable version
          </button>
        </div>
      </form>
      <h3>Published versions</h3>
      {rows.map((t) => (
        <article className="document-row" key={t.id}>
          <strong>
            {t.name} · v{t.version}
          </strong>
          <p>{(t.questions as unknown as Question[]).length} questions</p>
          <button
            className="secondary"
            onClick={() => {
              setName(t.name);
              setQs(structuredClone(t.questions) as unknown as Question[]);
            }}
          >
            Use as next-version draft
          </button>
        </article>
      ))}
      <Pager page={page} more={more} busy={busy} change={setPage} />
    </section>
  );
}
