import {useEffect,useState,type FormEvent} from 'react';
import {rpc,db} from '../../lib/supabase/client';
import {human} from '../../shared/ui/FormFields';
import {geographyPath,type Geo} from '../geography/model';
import {reportCSV,reportLabels,type OperationalReport,type ReportSelection} from './model';

type Props={organization:string|null;projectId?:string|null;geographies:Geo[];initial?:ReportSelection|null};
type Filters={organization:string;project:string;geo:string;from:string;to:string;kind:string;status:string};
export function ReportsWorkspace({organization,projectId=null,geographies,initial=null}:Props){
 const defaults:Filters={organization:organization||'',project:projectId||'',geo:'',from:'',to:'',kind:initial?.kind||'responses',status:initial?.status||''};
 const [draft,setDraft]=useState(defaults),[filters,setFilters]=useState(defaults),[offset,setOffset]=useState(0),[revision,setRevision]=useState(0);
 const [data,setData]=useState<OperationalReport|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true),[exporting,setExporting]=useState(false),[notice,setNotice]=useState('');
 const [allowed,setAllowed]=useState<string[]>([]),[projects,setProjects]=useState<{id:string;title:string;organization_id:string}[]>([]),[orgs,setOrgs]=useState<{id:string;name:string}[]>([]);
 const [choiceQuery,setChoiceQuery]=useState('');
 const args={p_org:organization||filters.organization||null,p_project:projectId||filters.project||null,p_geo:filters.geo||null,p_from:filters.from||null,p_to:filters.to||null,p_kind:filters.kind||null,p_status:filters.status||null};
 useEffect(()=>{let live=true;setAllowed([]);setData(null);setBusy(true);setError('');
   rpc('operational_report',{p_org:organization||filters.organization||null,p_project:projectId||filters.project||null}).then(value=>{if(!live)return;const kinds=(value as unknown as OperationalReport).allowed_kinds;setAllowed(kinds);if(!kinds.includes(filters.kind)){const kind=kinds[0]||'';setDraft(d=>({...d,kind,status:''}));setFilters(d=>({...d,kind,status:''}))}}).catch(e=>{if(live){setError(e.message);setAllowed([]);setData(null);setBusy(false)}});
   return()=>{live=false};
 },[organization,projectId,filters.organization,filters.project]);
 useEffect(()=>{let live=true;const timer=setTimeout(()=>{
   let query=db!.from('survey_projects').select('id,title,organization_id').order('title').limit(100);
   if(organization||draft.organization)query=query.eq('organization_id',organization||draft.organization);
   if(projectId)query=query.eq('id',projectId);else if(choiceQuery)query=query.ilike('title',`%${choiceQuery}%`);
   void query.then(r=>{if(live){if(r.error)setError(r.error.message);else setProjects(r.data||[])}});
   if(!organization&&!projectId)void db!.from('organizations').select('id,name').order('name').limit(100).ilike('name',`%${choiceQuery}%`).then(r=>{if(live){if(r.error)setError(r.error.message);else setOrgs(r.data||[])}});
 },250);return()=>{live=false;clearTimeout(timer)}},[organization,projectId,draft.organization,choiceQuery]);
 useEffect(()=>{let live=true;if(!allowed.length)return;setBusy(true);setError('');setData(null);setNotice('');
   rpc('operational_report',{...args,p_offset:offset}).then(value=>{if(live)setData(value as unknown as OperationalReport)}).catch(e=>live&&setError(e.message)).finally(()=>live&&setBusy(false));
   return()=>{live=false};
 },[organization,projectId,filters,offset,revision,allowed]);
 function apply(e:FormEvent){e.preventDefault();setOffset(0);setFilters({...draft});setRevision(n=>n+1)}
 async function exportRows(){setExporting(true);setError('');try{const result=await rpc('operational_report',{...args,p_export:true}) as unknown as OperationalReport;const url=URL.createObjectURL(new Blob([reportCSV(result.rows)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`fieldlance-${filters.kind}-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice(`${result.total} records exported. Export request recorded in audit history.`)}catch(e){setError((e as Error).message)}finally{setExporting(false)}}
 const statuses=data?Object.keys(data.counts).filter(key=>key.startsWith(filters.kind+'.')).map(key=>key.slice(filters.kind.length+1)):[];
 const maxTrend=Math.max(1,...(data?.trend||[]).map(t=>t.n));
 return <section className="panel detail analytics-workspace"><header className="project-section-header"><div><span className="eyebrow">OPERATIONS & IMPACT</span><h1>Reports & Analytics</h1><p>Authorized records, accurate totals and monthly activity across your current workspace.</p></div></header>
 <form className="analytics-filters" onSubmit={apply}>
 {!projectId&&<label className="field">Find project / organization<input value={choiceQuery} onChange={e=>setChoiceQuery(e.target.value)} placeholder="Search names to refine the first 100 choices"/></label>}
 {!organization&&!projectId&&<label className="field">Organization<select value={draft.organization} onChange={e=>setDraft({...draft,organization:e.target.value,project:''})}><option value="">All authorized organizations</option>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
 {!projectId&&<label className="field">Project<select value={draft.project} onChange={e=>setDraft({...draft,project:e.target.value})}><option value="">All authorized projects</option>{projects.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>}
 <label className="field">Report<select value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value,status:''})}>{allowed.map(k=><option key={k} value={k}>{reportLabels[k]||human(k)}</option>)}</select></label>
 <label className="field">Geography<select value={draft.geo} onChange={e=>setDraft({...draft,geo:e.target.value})}><option value="">All authorized areas</option>{geographies.map(g=><option key={g.id} value={g.id}>{geographyPath(g.id,geographies).map(x=>x.name).join(' / ')}</option>)}</select></label>
 <label className="field">From (UTC)<input type="date" min="1900-01-01" max="2200-01-01" value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/></label>
 <label className="field">Through (UTC)<input type="date" min={draft.from||'1900-01-01'} max="2200-01-01" value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></label>
 <label className="field">Status<select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value})}><option value="">All statuses</option>{draft.status&&!statuses.includes(draft.status)&&<option value={draft.status}>{({__active:'Active cases',__progress:'Applications in progress',__review:'Responses needing review',__due:'Follow-up due'} as Record<string,string>)[draft.status]||human(draft.status)}</option>}{(draft.kind===filters.kind?statuses:[]).map(s=><option key={s} value={s}>{human(s)}</option>)}{draft.kind==='cases'&&draft.status!=='__due'&&<option value="__due">Follow-up due</option>}</select></label>
 <button className="primary" disabled={exporting}>Apply filters</button>
 </form>
 <p className="fine">Dates include the whole UTC day and select records created in that period (profiles use last update). Statuses show their current state, not historical transitions. Response geography uses collection area; recruitment, assistance and finance use project area. Project filters stay fixed when opened inside a project.</p>
 {error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="notice success" role="status">{notice}</p>}{busy&&<p role="status">Loading report…</p>}
 {data&&<><div className="analytics-summary"><strong>{data.total.toLocaleString()} matching records</strong><span>Updated {new Date(data.as_of).toLocaleString()}</span><button className="secondary" disabled={busy||exporting||data.total>5000} onClick={()=>void exportRows()}>{exporting?'Preparing CSV…':'Export filtered CSV'}</button></div>{data.total>5000&&<p>Narrow your filters to 5,000 records or fewer to export.</p>}
 <nav className="analytics-statuses" aria-label="Report status totals">{statuses.map(s=><button className="secondary" key={s} onClick={()=>{setOffset(0);setFilters({...filters,status:s});setDraft({...filters,status:s})}}>{human(s)} <strong>{data.counts[`${filters.kind}.${s}`]}</strong></button>)}</nav>
 {filters.kind==='applications'&&<p>Recruitment states: pending → shortlisted → selected. Offers and accepted work are reported separately under Assignments; these are current-state counts, not a historical conversion rate.</p>}
 {!!data.money.length&&<section><h2>Amounts by currency and event</h2>{data.money.map(m=><p key={m.currency+m.state}><strong>{m.currency} {m.amount}</strong> · {human(m.state)}</p>)}<p className="fine">Payable journal movements; these totals are not wallet balances or available project funding.</p></section>}
 <details className="analytics-trends" open><summary>Monthly records by current status</summary>{data.trend.map(t=><div key={t.month+t.state}><span>{t.month} · {human(t.state)}</span><meter min={0} max={maxTrend} value={t.n}/><strong>{t.n}</strong></div>)}{!data.trend.length&&<p>No activity matches these filters.</p>}</details>
 <div className="analytics-table"><table><thead><tr><th>Record</th><th>Organization / Project</th><th>Area</th><th>Status</th><th>Created (UTC)</th>{filters.kind==='finance'&&<th>Amount</th>}</tr></thead><tbody>{data.rows.map(row=><tr key={row.id}><td><strong>{row.label}</strong><details><summary>Reference</summary><code>{row.id}</code>{row.due_on&&<p>Follow-up due {row.due_on}</p>}</details></td><td>{row.organization_name||'—'}<br/>{row.project_name||'—'}</td><td>{row.geography_name||'—'}</td><td>{human(row.status)}</td><td>{new Date(row.created_at).toISOString().slice(0,10)}</td>{filters.kind==='finance'&&<td>{row.currency} {row.amount}</td>}</tr>)}</tbody></table></div>
 {!data.rows.length&&<p>No records match these filters.</p>}<div className="actions"><button disabled={busy||offset===0} onClick={()=>setOffset(n=>Math.max(0,n-50))}>Previous</button><span>{data.total?`${offset+1}–${Math.min(offset+50,data.total)} of ${data.total}`:'0 records'}</span><button disabled={busy||offset+50>=data.total} onClick={()=>setOffset(n=>n+50)}>Next</button></div><p className="fine">Exports contain operational references and labels, not survey answers, beneficiary identity fields or private files.</p></>}
 </section>;
}
