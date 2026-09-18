import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import {Badge} from '../../shared/ui/FormFields';
import {EmptyState} from '../../components/ui/WorkflowOverview';
import {rpc} from '../../lib/supabase/client';

type Provider='jazzcash'|'easypaisa';
type Status='requested'|'approved'|'processing'|'succeeded'|'failed'|'reversed'|'cancelled';
type Policy={currency:string;minimum_withdrawal:string;maximum_withdrawal:string;daily_limit:string;dual_control_threshold:string;manual_settlement_enabled:boolean;updated_at:string};
type WithdrawalRow={
  id:string;user_id:string;user_name:string;provider:Provider;account_title_snapshot:string;account_masked_snapshot:string;
  amount:string;currency:string;status:Status;provider_mode:'mock'|'manual';provider_reference:string;requested_at:string;
  approved_at:string|null;approved_by:string|null;processing_at:string|null;processing_by:string|null;settled_at:string|null;settled_by:string|null;
  failed_at:string|null;failed_by:string|null;failure_code:string|null;failure_message:string|null;reversed_at:string|null;reversed_by:string|null;
  cancelled_at:string|null;version:number;allocation_count:number;settlement_reference:string|null;reversal_reference:string|null;
};
type Queue={rows:WithdrawalRow[];count:number;policy:Policy;providers:Provider[];settlement_modes:string[]};
type ReconciliationRow={withdrawal_id:string;provider:Provider;amount:string;currency:string;status:Status;provider_mode:'mock'|'manual';provider_reference:string;settlement_reference:string|null;reversal_reference:string|null;allocation_total:string;allocation_count:number;payment_total:string;payment_count:number;payment_bridge_count:number;reversal_total:string;reversal_count:number;reversal_bridge_count:number;matched:boolean;issue:string|null;requested_at:string;settled_at:string|null;reversed_at:string|null};
type Reconciliation={rows:ReconciliationRow[];matched:number;needs_review:number;providers:Provider[]};
type Draft={note:string;reference:string;code:string;date:string};
type Call=(name:string,args?:Record<string,unknown>)=>Promise<unknown>;
const call=rpc as unknown as Call;
const label=(provider:string)=>provider==='jazzcash'?'JazzCash':'Easypaisa';
const money=(value:string|number)=>new Intl.NumberFormat('en-PK',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value||0));
const when=(value:string|null)=>value?new Date(value).toLocaleString():'';
const today=()=>new Date().toISOString().slice(0,10);

export function WithdrawalOperationsWorkspace(){
  const [queue,setQueue]=useState<Queue|null>(null),[reconciliation,setReconciliation]=useState<Reconciliation|null>(null);
  const [status,setStatus]=useState(''),[provider,setProvider]=useState('');
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0);
  const [drafts,setDrafts]=useState<Record<string,Draft>>({});
  const refresh=useCallback(()=>setRevision(v=>v+1),[]);
  const draft=(id:string)=>drafts[id]||{note:'',reference:'',code:'',date:today()};
  const patchDraft=(id:string,patch:Partial<Draft>)=>setDrafts(current=>({...current,[id]:{...draft(id),...patch}}));

  useEffect(()=>{let live=true;setLoading(true);setError('');void Promise.all([
    call('admin_e_wallet_operations_queue',{p_status:status||null,p_provider:provider||null,p_limit:200}),
    call('admin_e_wallet_provider_reconciliation',{p_status:status||null,p_provider:provider||null,p_limit:200}),
  ]).then(([q,r])=>{if(live){setQueue(q as Queue);setReconciliation(r as Reconciliation)}}).catch(e=>{if(live)setError((e as Error).message)}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[revision,status,provider]);

  async function run(task:()=>Promise<unknown>,message:string){setBusy(true);setError('');setNotice('');try{await task();setNotice(message);refresh()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}

  function savePolicy(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('configure_e_wallet_payout_policy',{
    p_minimum:Number(form.get('minimum')),p_maximum:Number(form.get('maximum')),p_daily:Number(form.get('daily')),p_dual_control:Number(form.get('dual_control')),p_manual_enabled:form.get('manual_enabled')==='on',
  }),'Payout policy updated.');}

  const recById=useMemo(()=>new Map((reconciliation?.rows||[]).map(row=>[row.withdrawal_id,row])),[reconciliation]);
  if(loading&&!queue)return <p role="status">Loading withdrawal operations…</p>;
  const policy=queue?.policy;
  return <section className="ewallet-workspace">
    <div className="panel-title"><div><span className="eyebrow">POEM FINANCE</span><h2>Withdrawal Operations</h2></div><Badge value="manual + mock"/></div>
    <div className="notice"><strong>Manual settlement:</strong> POEM can pay a verified JazzCash/Easypaisa wallet through the provider app/portal, then record the real external transaction reference here. The system posts the existing payable allocations and finance bridge automatically; balances are never edited manually.</div>
    {error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="notice success" role="status">{notice}</p>}

    {policy&&<section className="panel detail"><div className="panel-title"><div><span className="eyebrow">CONTROL LIMITS</span><h3>Payout policy</h3></div><Badge value={policy.manual_settlement_enabled?'manual enabled':'manual disabled'}/></div>
      <form key={policy.updated_at} onSubmit={savePolicy}><fieldset disabled={busy}><div className="form-grid">
        <label className="field">Minimum (PKR)<input name="minimum" type="number" min="1" step="0.01" defaultValue={policy.minimum_withdrawal} required/></label>
        <label className="field">Maximum per request<input name="maximum" type="number" min="1" step="0.01" defaultValue={policy.maximum_withdrawal} required/></label>
        <label className="field">Daily limit per user<input name="daily" type="number" min="1" step="0.01" defaultValue={policy.daily_limit} required/></label>
        <label className="field">Dual-control threshold<input name="dual_control" type="number" min="1" step="0.01" defaultValue={policy.dual_control_threshold} required/></label>
      </div><label className="check"><input name="manual_enabled" type="checkbox" defaultChecked={policy.manual_settlement_enabled}/> Enable manual JazzCash/Easypaisa settlement</label><div className="actions"><button className="secondary">Save payout policy</button></div></fieldset></form>
      <p>At or above the dual-control threshold, the administrator who approved the withdrawal cannot be the administrator who records settlement.</p>
    </section>}

    <section className="panel detail"><div className="panel-title"><div><span className="eyebrow">RECONCILIATION</span><h3>Provider ↔ payable ↔ finance</h3></div><Badge value={`${reconciliation?.needs_review||0} need review`}/></div>
      <div className="stats ewallet-stats"><article className="stat"><div>Matched</div><b>{reconciliation?.matched||0}</b></article><article className="stat"><div>Needs review</div><b>{reconciliation?.needs_review||0}</b></article></div>
      <p>A matched settlement has the same withdrawal allocation total, payment/reversal events and payable-to-finance bridge links.</p>
    </section>

    <section className="panel detail"><div className="panel-title"><div><span className="eyebrow">OPERATIONS QUEUE</span><h3>JazzCash & Easypaisa withdrawals</h3></div><div className="actions"><button className="secondary" disabled={busy||loading} onClick={refresh}>Refresh</button></div></div>
      <div className="form-grid">
        <label className="field">Status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{['requested','approved','processing','succeeded','failed','reversed','cancelled'].map(v=><option key={v}>{v}</option>)}</select></label>
        <label className="field">Provider<select value={provider} onChange={e=>setProvider(e.target.value)}><option value="">All providers</option><option value="jazzcash">JazzCash</option><option value="easypaisa">Easypaisa</option></select></label>
      </div>
      {!queue?.rows.length&&<EmptyState>No withdrawals match the current filters.</EmptyState>}
      {queue?.rows.map(w=>{const d=draft(w.id),rec=recById.get(w.id);return <article className="document-row" key={w.id}>
        <div className="panel-title"><div><strong>{w.currency} {money(w.amount)} · {label(w.provider)} {w.account_masked_snapshot}</strong><p>{w.user_name||w.user_id} · requested {when(w.requested_at)}</p></div><div className="actions"><Badge value={w.status}/><Badge value={w.provider_mode}/>{rec&&<Badge value={rec.matched?'matched':'review'}/>}</div></div>
        <p>POEM reference: {w.provider_reference} · {w.allocation_count} reserved payable allocation{w.allocation_count===1?'':'s'}.</p>
        {w.settlement_reference&&<p>Provider settlement reference: <strong>{w.settlement_reference}</strong></p>}{w.reversal_reference&&<p>Provider reversal reference: <strong>{w.reversal_reference}</strong></p>}
        {w.failure_message&&<p className="notice error">{w.failure_code}: {w.failure_message}</p>}{rec&&!rec.matched&&<p className="notice error">Reconciliation issue: {rec.issue}</p>}

        {w.status==='requested'&&<div className="form-grid"><label className="field">Approval note<input value={d.note} onChange={e=>patchDraft(w.id,{note:e.target.value})} placeholder="Reviewed wallet and payout request"/></label><div className="actions"><button className="primary" disabled={busy||!policy?.manual_settlement_enabled||d.note.trim().length<3} onClick={()=>void run(()=>call('approve_manual_e_wallet_withdrawal',{p_withdrawal:w.id,p_version:w.version,p_note:d.note,p_request:crypto.randomUUID()}),'Withdrawal approved for manual settlement.')}>Approve manual payout</button></div></div>}

        {w.status==='approved'&&<div className="actions"><button className="primary" disabled={busy} onClick={()=>void run(()=>call('start_manual_e_wallet_withdrawal',{p_withdrawal:w.id,p_version:w.version,p_request:crypto.randomUUID()}),'Manual provider processing started.')}>Start processing</button><button className="secondary" disabled={busy||d.note.trim().length<3||d.code.trim().length<2} onClick={()=>void run(()=>call('fail_manual_e_wallet_withdrawal',{p_withdrawal:w.id,p_code:d.code,p_note:d.note,p_request:crypto.randomUUID()}),'Withdrawal marked failed and reserved earnings released.')}>Fail</button></div>}

        {['approved','processing'].includes(w.status)&&<div className="form-grid">
          <label className="field">Failure code<input value={d.code} onChange={e=>patchDraft(w.id,{code:e.target.value.toUpperCase()})} placeholder="WALLET_UNAVAILABLE"/></label>
          <label className="field">Operator note<input value={d.note} onChange={e=>patchDraft(w.id,{note:e.target.value})} placeholder="Provider/operator note"/></label>
        </div>}

        {w.status==='processing'&&<div className="form-grid">
          <label className="field">External transaction/reference<input value={d.reference} onChange={e=>patchDraft(w.id,{reference:e.target.value})} placeholder="JazzCash / Easypaisa transaction ID"/></label>
          <label className="field">Settlement date<input type="date" max={today()} value={d.date} onChange={e=>patchDraft(w.id,{date:e.target.value})}/></label>
          <label className="field">Settlement note<input value={d.note} onChange={e=>patchDraft(w.id,{note:e.target.value})} placeholder="Payment confirmed in provider portal"/></label>
          <div className="actions"><button className="primary" disabled={busy||d.reference.trim().length<5||d.note.trim().length<3} onClick={()=>void run(()=>call('settle_manual_e_wallet_withdrawal',{p_withdrawal:w.id,p_external_reference:d.reference,p_settled_on:d.date,p_note:d.note,p_request:crypto.randomUUID()}),'Manual provider settlement recorded.')}>Record paid</button><button className="secondary" disabled={busy||d.code.trim().length<2||d.note.trim().length<3} onClick={()=>void run(()=>call('fail_manual_e_wallet_withdrawal',{p_withdrawal:w.id,p_code:d.code,p_note:d.note,p_request:crypto.randomUUID()}),'Withdrawal marked failed and reserved earnings released.')}>Fail</button></div>
        </div>}

        {w.status==='succeeded'&&w.provider_mode==='manual'&&<div className="form-grid">
          <label className="field">External reversal reference<input value={d.reference} onChange={e=>patchDraft(w.id,{reference:e.target.value})} placeholder="Provider reversal transaction ID"/></label>
          <label className="field">Reversal note<input value={d.note} onChange={e=>patchDraft(w.id,{note:e.target.value})} placeholder="Reason provider settlement was reversed"/></label>
          <div className="actions"><button className="secondary" disabled={busy||d.reference.trim().length<5||d.note.trim().length<3} onClick={()=>void run(()=>call('reverse_manual_e_wallet_withdrawal',{p_withdrawal:w.id,p_external_reference:d.reference,p_note:d.note,p_request:crypto.randomUUID()}),'Manual provider settlement reversed.')}>Record reversal</button></div>
        </div>}
      </article>})}
    </section>
  </section>;
}
