import { useEffect, useState, type FormEvent } from "react";
import { db, rpc } from "../../lib/supabase/client";
import { type Json } from "../../lib/supabase/database.types";
import { Question, Template } from "./model";
import { templateLibrary, copyQuestions, dependencyErrors } from "./templateLibrary";
import { TemplatePreview } from "./TemplatePreview";
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
  const [tab,setTab]=useState<'mine'|'library'>('mine'),[draftId,setDraftId]=useState<string>(()=>crypto.randomUUID()),[version,setVersion]=useState(0),[source,setSource]=useState<Json>({}),[dirty,setDirty]=useState(false),[preview,setPreview]=useState(false);
  const [drafts,setDrafts]=useState<{id:string;name:string;questions:Json;source:Json;version:number;published_id:string|null}[]>([]);
  useEffect(()=>{const leave=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave)},[dirty]);
  useEffect(()=>{let live=true;db!.from('survey_template_drafts').select('*').order('updated_at',{ascending:false}).limit(100).then(r=>{if(!live)return;if(r.error)setError(r.error.message);else setDrafts(r.data||[])});return()=>{live=false}},[rev]);
  function openDraft(title:string,questions:Question[],origin:Json,id:string=crypto.randomUUID(),v=0){
    if(dirty&&!window.confirm('Discard unsaved changes and open this draft?'))return;
    setName(title);setQs(structuredClone(questions));setSource(origin);setDraftId(id);setVersion(v);setDirty(v===0);setPreview(false);setTab('mine');setError('');setMessage('');
  }
  async function saveDraft(){
    setBusy(true);setError('');try{const v=await rpc('save_template_draft',{p_id:draftId,p_name:name,p_questions:qs as unknown as Json,p_source:source,p_version:version});setVersion(v);setDirty(false);setMessage('Draft saved.');setRev(n=>n+1);}catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  function move(i:number,delta:number){const next=[...qs];[next[i],next[i+delta]]=[next[i+delta],next[i]];const errors=dependencyErrors(next);if(errors.length){setError('Move blocked: '+errors.join(' '));return;}setQs(next);setDirty(true);}
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
      if(dirty||!version)throw new Error('Save this draft before publishing.');
      const errors=dependencyErrors(qs);if(errors.length)throw new Error(errors.join(' '));
      await rpc('publish_template_draft',{p_id:draftId,p_version:version});
      setDraftId(crypto.randomUUID());setVersion(0);setSource({});setDirty(false);
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
    { setDirty(true);setQs((q) => q.map((v, n) => (n === i ? { ...v, ...patch } : v))); };
  return (
    <section className="panel detail">
      <h2>Survey templates</h2>
      <div className="actions"><button type="button" disabled={busy} aria-pressed={tab==='mine'} onClick={()=>setTab('mine')}>My templates</button><button type="button" disabled={busy} aria-pressed={tab==='library'} onClick={()=>setTab('library')}>Template library</button></div>
      {tab==='library'&&<div><p>Read-only starter templates. Use template creates your own editable draft. Review wording, required fields and project consent before publishing.</p>{templateLibrary.map(t=><article className="document-row" key={t.id}><h3>{t.name}</h3><p>{t.description} · {t.questions.length} questions · Library v{t.version}</p><details><summary>View questions</summary><ol>{t.questions.map(q=><li key={q.id}>{q.label} ({q.type})</li>)}</ol></details><button type="button" disabled={busy} onClick={()=>openDraft(t.name,copyQuestions(t.questions),{library_id:t.id,library_version:t.version})}>Use template</button></article>)}</div>}
      <div hidden={tab!=='mine'}>
      <h3>Saved drafts and publication recovery</h3><p>Your latest 100 drafts. Save before leaving this screen. Drafts are private to their author.</p>
      {drafts.map(d=><article className="document-row" key={d.id}><strong>{d.name||'Untitled draft'}</strong><span> · {d.published_id?'Published':'Draft'} · revision {d.version}</span>{!d.published_id&&<button type="button" disabled={busy} onClick={()=>openDraft(d.name,d.questions as unknown as Question[],d.source,d.id,d.version)}>Open saved draft</button>}</article>)}
      <button type="button" disabled={busy} onClick={()=>openDraft('',[],{})}>New blank draft</button>
      <p role="status">{dirty?'Unsaved changes':version?'Saved draft':'New draft'} · Published versions cannot be edited.</p>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <form onSubmit={publish} onChange={()=>setDirty(true)}>
<fieldset disabled={busy}>
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
              onClick={() => {if(qs.some(other=>other.when?.question===q.id||other.after===q.id)){setError('Remove blocked: another question depends on this question. Clear its condition/date comparison first.');return;}setQs(items=>items.filter((_,n)=>n!==i));setDirty(true);}}
            >
              Remove question
            </button>
            <button type="button" disabled={qs.length>=50} onClick={()=>{setQs(items=>[...items.slice(0,i+1),{...structuredClone(q),id:'q_'+crypto.randomUUID().replaceAll('-','')},...items.slice(i+1)]);setDirty(true)}}>Duplicate question</button>
            <button type="button" disabled={i===0} onClick={()=>move(i,-1)}>Move up</button>
            <button type="button" disabled={i===qs.length-1} onClick={()=>move(i,1)}>Move down</button>
          </fieldset>
        ))}
        <div className="actions">
          <button
            className="secondary"
            type="button"
            disabled={qs.length >= 50 || busy}
            onClick={() => {setDirty(true);
              setQs((q) => [
                ...q,
                {
                  id: "q_" + crypto.randomUUID().replaceAll("-", ""),
                  label: "",
                  type: "text",
                  required: false,
                },
              ]);}
            }
          >
            Add question
          </button>
          <button type="button" onClick={()=>void saveDraft()}>Save draft</button>
          <button type="button" onClick={()=>setPreview(p=>!p)}>Preview form</button>
          <button className="primary" disabled={busy || !qs.length || dirty || !version}>
            Publish immutable version
          </button>
        </div>
      </fieldset></form>
      {preview&&<TemplatePreview questions={qs}/>}
      <h3>Published versions</h3>
      {rows.map((t) => (
        <article className="document-row" key={t.id}>
          <strong>
            {t.name} · v{t.version}
          </strong>
          <p>{(t.questions as unknown as Question[]).length} questions</p>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => openDraft(t.name,t.questions as unknown as Question[],{published_template_id:t.id})}
          >
            Use as next-version draft
          </button>
        </article>
      ))}
      <Pager page={page} more={more} busy={busy} change={setPage} />
      </div>
    </section>
  );
}
