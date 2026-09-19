import {useCallback,useEffect,useState} from 'react';
import {Badge} from '../../shared/ui/FormFields';
import {EmptyState} from '../../components/ui/WorkflowOverview';
import {rpc} from '../../lib/supabase/client';

type Call=(name:string,args?:Record<string,unknown>)=>Promise<unknown>;
const call=rpc as unknown as Call;
const money=(value:string|number|null)=>value===null?'—':new Intl.NumberFormat('en-PK',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value));
const title=(value:string)=>value.replaceAll('_',' ');

type LedgerRow={
  id:string;organization_id:string;organization_name:string;project_id:string;project_title:string;person_id:string;beneficiary_name:string;registry_no:number;
  kind:'cash'|'goods'|'service';category:string;program:string;description:string;amount_pkr:string|null;quantity:string|null;unit:string|null;
  delivered_on:string;funding_source:string;evidence_reference:string;next_eligible_on:string|null;status:'recorded'|'void';version:number;created_by:string;created_at:string;
  void_reason:string|null;voided_at:string|null;planned_delivery:boolean;distribution_plan_id:string|null;distribution_plan_no:number|null;request_id:string|null;request_no:number|null;
  case_id:string|null;case_no:number|null;delivery_link_status:string|null;duplicate_override_used:boolean;
};
type Ledger={rows:LedgerRow[];summary:Record<string,number>;limit:number};

export function AssistanceLedgerWorkspace({organization=null,projectId=null}:{organization?:string|null;projectId?:string|null}){
  const [data,setData]=useState<Ledger>({rows:[],summary:{},limit:100});
  const [status,setStatus]=useState('');
  const [category,setCategory]=useState('');
  const [from,setFrom]=useState('');
  const [to,setTo]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  const refresh=useCallback(()=>setRevision(v=>v+1),[]);

  useEffect(()=>{
    let live=true;setLoading(true);setError('');
    call('assistance_ledger',{p_organization:organization,p_project:projectId,p_status:status||null,p_category:category||null,p_from:from||null,p_to:to||null,p_limit:100})
      .then(result=>{if(live)setData(result as Ledger)})
      .catch(e=>{if(live)setError((e as Error).message)})
      .finally(()=>{if(live)setLoading(false)});
    return()=>{live=false};
  },[organization,projectId,status,category,from,to,revision]);

  return <section className="registry-operations" aria-label="Assistance ledger">
    <div className="panel-title"><div><span className="eyebrow">DELIVERED SUPPORT</span><h2>Assistance ledger</h2><p>Authoritative delivered-assistance records. Planned deliveries are linked back to their distribution plan; historical/unplanned records remain visible without being rewritten.</p></div><Badge value="2.19.2"/></div>
    <div className="notice"><strong>Ledger means delivered.</strong> A distribution plan is not delivery until a guarded 2.19.2 action creates an <code>assistance_entries</code> record. Worker payables, project finance and beneficiary support are separate systems.</div>
    {error&&<p className="notice error" role="alert">{error}</p>}
    <div className="stats">
      <article className="stat"><div>Total</div><b>{data.summary.total??0}</b></article>
      <article className="stat"><div>Recorded</div><b>{data.summary.recorded??0}</b></article>
      <article className="stat"><div>Planned deliveries</div><b>{data.summary.planned??0}</b></article>
      <article className="stat"><div>Unplanned / historical</div><b>{data.summary.unplanned??0}</b></article>
      <article className="stat"><div>Voided</div><b>{data.summary.void??0}</b></article>
    </div>
    <section className="panel detail">
      <div className="panel-title"><h3>Ledger filters</h3><button className="secondary" disabled={loading} onClick={refresh}>Refresh</button></div>
      <div className="form-grid">
        <label className="field">Status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All</option><option value="recorded">Recorded</option><option value="void">Void</option></select></label>
        <label className="field">Category<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">All</option>{['food','education','health','housing','livelihood','other'].map(v=><option key={v} value={v}>{title(v)}</option>)}</select></label>
        <label className="field">From<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
        <label className="field">To<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
      </div>
      {loading&&<p role="status">Loading assistance ledger…</p>}
      {!loading&&!data.rows.length&&<EmptyState>No assistance entries match this authorized scope/filter.</EmptyState>}
      {data.rows.map(row=><article className="document-row" key={row.id}>
        <div className="panel-title"><div><strong>{row.description}</strong><p>{row.beneficiary_name} · BEN-{row.registry_no} · {row.project_title}</p></div><Badge value={row.status}/></div>
        <p><strong>{row.kind==='cash'?`PKR ${money(row.amount_pkr)}`:`${row.quantity} ${row.unit}`}</strong> · {title(row.category)} · {row.program} · delivered {row.delivered_on}</p>
        <p>Funded by {row.funding_source} · Evidence: {row.evidence_reference}{row.next_eligible_on?` · Next eligible: ${row.next_eligible_on}`:''}</p>
        {row.planned_delivery?<p>Controlled delivery: DP-{row.distribution_plan_no} · AR-{row.request_no} · CASE-{row.case_no}{row.duplicate_override_used?' · duplicate-control override recorded':''}</p>:<p>Source: unplanned / historical assistance record.</p>}
        {row.status==='void'&&<p>Voided: {row.void_reason||'reason unavailable'}{row.voided_at?` · ${new Date(row.voided_at).toLocaleString()}`:''}</p>}
      </article>)}
    </section>
  </section>;
}
