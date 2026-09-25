import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {Badge} from '../../shared/ui/FormFields';
import {EmptyState} from '../../components/ui/WorkflowOverview';
import {rpc} from '../../lib/supabase/client';

type Call=(name:string,args?:Record<string,unknown>)=>Promise<unknown>;
const call=rpc as unknown as Call;
const val=(form:FormData,key:string)=>String(form.get(key)||'').trim();
const label=(value:string)=>value.replaceAll('_',' ');

type CaseQueueRow={
  id:string;case_no:number;project_id:string;project_title:string;organization_name:string;beneficiary_name:string;registry_no:number;geography_name:string;
  title:string;summary:string;priority:string;status:string;owner_role:'field_worker'|'area_focal_person';assigned_at:string;next_followup_on:string|null;
  scheduled_followups:number;overdue_followups:number;due_today_followups:number;
};
type CaseQueue={rows:CaseQueueRow[];summary:Record<string,number>;utc_today:string;limit:number};
type FollowupRow={
  id:string;case_id:string;case_no:number;case_title:string;case_priority:string;project_title:string;organization_name:string;beneficiary_name:string;registry_no:number;
  owner_role:string;followup_type:string;due_on:string;status:string;outcome_status:string|null;observations:string|null;next_action:string|null;next_follow_up_on:string|null;version:number;
};
type FollowupQueue={rows:FollowupRow[];summary:Record<string,number>;utc_today:string;limit:number};
type Need={id:string;category:string;description:string;priority:string;status:string;follow_up_on:string|null};
type DetailFollowup={
  id:string;parent_followup_id:string|null;need_id:string|null;followup_type:string;due_on:string;status:'scheduled'|'completed'|'cancelled';outcome_status:string|null;
  observations:string|null;beneficiary_feedback:string|null;next_action:string|null;next_follow_up_on:string|null;last_reason:string;version:number;created_at:string;completed_at:string|null;cancellation_reason:string|null;
};
type Detail={
  case:{id:string;case_no:number;title:string;summary:string;priority:string;status:string;follow_up_on:string|null;geography_id:string;version:number};
  person:{id:string;registry_no:number;full_name:string};
  project:{id:string;title:string};organization:{id:string;name:string};geography:{id:string;name:string;kind:string};
  assignment:{id:string;owner_role:string;assigned_at:string};needs:Need[];followups:DetailFollowup[];
};

export function DelegatedCasesWorkspace({view='cases',projectId=null,initialCaseId=null,onSelectedCaseChange}:{view?:'cases'|'followups';projectId?:string|null;initialCaseId?:string|null;onSelectedCaseChange?:(caseId:string|null)=>void}){
  const [caseView,setCaseView]=useState('all');
  const [followupView,setFollowupView]=useState('scheduled');
  const [caseQueue,setCaseQueue]=useState<CaseQueue>({rows:[],summary:{},utc_today:'',limit:100});
  const [followupQueue,setFollowupQueue]=useState<FollowupQueue>({rows:[],summary:{},utc_today:'',limit:100});
  const [selectedCase,setSelectedCase]=useState<string|null>(initialCaseId);
  const [detail,setDetail]=useState<Detail|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [revision,setRevision]=useState(0);
  const refresh=useCallback(()=>setRevision(v=>v+1),[]);

  function selectCase(id:string|null){setSelectedCase(id);onSelectedCaseChange?.(id)}
  useEffect(()=>{if(initialCaseId!==selectedCase)setSelectedCase(initialCaseId)},[initialCaseId]);

  useEffect(()=>{
    let live=true;setLoading(true);setError('');
    const request=view==='cases'
      ?call('my_delegated_case_queue',{p_view:caseView,p_project:projectId,p_limit:100})
      :call('my_delegated_followup_queue',{p_view:followupView,p_project:projectId,p_limit:100});
    request.then(result=>{if(!live)return;if(view==='cases')setCaseQueue(result as CaseQueue);else setFollowupQueue(result as FollowupQueue)}).catch(e=>{if(live)setError((e as Error).message)}).finally(()=>{if(live)setLoading(false)});
    return()=>{live=false};
  },[view,projectId,caseView,followupView,revision]);

  useEffect(()=>{
    if(!selectedCase){setDetail(null);return}
    let live=true;setError('');
    call('my_delegated_case_detail',{p_case:selectedCase}).then(result=>{if(live)setDetail(result as Detail)}).catch(e=>{if(live){setError((e as Error).message);selectCase(null)}});
    return()=>{live=false};
  },[selectedCase,revision]);

  async function run(task:()=>Promise<unknown>,message:string){
    setBusy(true);setError('');setNotice('');
    try{const result=await task();setNotice(message);refresh();return result}catch(e){setError((e as Error).message);return null}finally{setBusy(false)}
  }

  return <section className="registry-operations" aria-label={view==='cases'?'My delegated beneficiary cases':'My delegated beneficiary follow-ups'}>
    <div className="panel-title">
      <div><span className="eyebrow">DELEGATED FIELD OPERATIONS</span><h2>{view==='cases'?'My Cases':'My Follow-ups'}</h2></div>
      <Badge value="2.39.0"/>
    </div>
    <div className="notice"><strong>Only explicitly delegated cases are shown.</strong> Case access also requires your current project and geography authority. Assistance approvals, finance and organization administration remain outside this workspace.</div>
    {error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="notice success" role="status">{notice}</p>}

    {view==='cases'?<>
      <div className="stats">
        <article className="stat"><div>Assigned</div><b>{caseQueue.summary.total??0}</b></article>
        <article className="stat"><div>Due today</div><b>{caseQueue.summary.due_today??0}</b></article>
        <article className="stat"><div>Overdue</div><b>{caseQueue.summary.overdue??0}</b></article>
        <article className="stat"><div>Upcoming</div><b>{caseQueue.summary.upcoming??0}</b></article>
      </div>
      <section className="panel detail">
        <div className="panel-title"><h3>Assigned case queue</h3><button className="secondary" disabled={busy||loading} onClick={refresh}>Refresh</button></div>
        <label className="field">View<select value={caseView} onChange={e=>setCaseView(e.target.value)}><option value="all">All assigned</option><option value="open">Open / on hold</option><option value="due_today">Due today</option><option value="overdue">Overdue</option><option value="upcoming">Upcoming</option></select></label>
        {loading&&<p role="status">Loading assigned cases…</p>}
        {!loading&&!caseQueue.rows.length&&<EmptyState>No cases are currently delegated to you in this view.</EmptyState>}
        {caseQueue.rows.map(row=><article className="document-row" key={row.id}>
          <div className="panel-title"><div><strong>CASE-{row.case_no} · {row.title}</strong><p>{row.beneficiary_name} · BEN-{row.registry_no} · {row.project_title}</p></div><Badge value={row.status}/></div>
          <p>{row.priority} priority · {label(row.owner_role)} · {row.geography_name}</p>
          <p>{row.summary}</p>
          <p>Next follow-up: {row.next_followup_on||'none scheduled'} · {row.overdue_followups} overdue · {row.due_today_followups} due today</p>
          <button className="secondary" onClick={()=>selectCase(row.id)}>Open case</button>
        </article>)}
      </section>
    </>:<>
      <div className="stats">
        <article className="stat"><div>Scheduled</div><b>{followupQueue.summary.scheduled??0}</b></article>
        <article className="stat"><div>Due today</div><b>{followupQueue.summary.due_today??0}</b></article>
        <article className="stat"><div>Overdue</div><b>{followupQueue.summary.overdue??0}</b></article>
        <article className="stat"><div>Completed</div><b>{followupQueue.summary.completed??0}</b></article>
      </div>
      <section className="panel detail">
        <div className="panel-title"><h3>Delegated follow-up queue</h3><button className="secondary" disabled={busy||loading} onClick={refresh}>Refresh</button></div>
        <label className="field">View<select value={followupView} onChange={e=>setFollowupView(e.target.value)}><option value="scheduled">Scheduled</option><option value="due_today">Due today</option><option value="overdue">Overdue</option><option value="upcoming">Upcoming</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="all">All</option></select></label>
        {loading&&<p role="status">Loading follow-ups…</p>}
        {!loading&&!followupQueue.rows.length&&<EmptyState>No delegated follow-ups match this view.</EmptyState>}
        {followupQueue.rows.map(item=><article className="document-row" key={item.id}>
          <div className="panel-title"><div><strong>CASE-{item.case_no} · {label(item.followup_type)}</strong><p>{item.beneficiary_name} · {item.project_title}</p></div><Badge value={item.status}/></div>
          <p>Due {item.due_on} · {item.case_priority} case priority · {label(item.owner_role)}</p>
          {item.outcome_status&&<p>Outcome: {label(item.outcome_status)} · {item.next_action}</p>}
          <button className="secondary" onClick={()=>selectCase(item.case_id)}>Open case</button>
        </article>)}
      </section>
    </>}

    {detail&&<section className="panel detail" aria-label="Delegated case detail">
      <div className="panel-title"><div><span className="eyebrow">CASE-{detail.case.case_no}</span><h3>{detail.case.title}</h3><p>{detail.person.full_name} · BEN-{detail.person.registry_no} · {detail.project.title}</p></div><button className="secondary" onClick={()=>selectCase(null)}>Close detail</button></div>
      <p>{detail.case.summary}</p>
      <p><strong>{detail.case.priority} priority · {label(detail.case.status)}</strong> · {detail.geography.name} · delegated as {label(detail.assignment.owner_role)}</p>

      <h4>Assessed needs</h4>
      {!detail.needs.length&&<EmptyState>No active assessed needs are linked to this case.</EmptyState>}
      {detail.needs.map(need=><article className="document-row" key={need.id}><div className="panel-title"><strong>{need.category} · {need.priority}</strong><Badge value={need.status}/></div><p>{need.description}</p>{need.follow_up_on&&<p>Need follow-up: {need.follow_up_on}</p>}</article>)}

      <section aria-label="Delegated follow-up operations">
        <h4>Follow-up & outcomes</h4>
        {!detail.followups.length&&<EmptyState>No structured follow-up is scheduled yet.</EmptyState>}
        {detail.followups.map(f=><DelegatedFollowupCard key={f.id} followup={f} busy={busy} run={run}/>)}
        <details className="survey-question"><summary>Schedule follow-up</summary>
          <form onSubmit={event=>{event.preventDefault();const formEl=event.currentTarget,form=new FormData(formEl),id=crypto.randomUUID();void run(()=>call('create_beneficiary_case_followup',{p_id:id,p_case:detail.case.id,p_need:val(form,'need')||null,p_assistance:null,p_type:val(form,'type'),p_due_on:val(form,'due_on'),p_reason:val(form,'reason')}),'Follow-up scheduled.').then(result=>{if(result!==null)formEl.reset()})}}>
            <fieldset disabled={busy}><div className="form-grid">
              <label className="field">Type<select name="type" defaultValue="field_visit"><option value="phone">Phone</option><option value="field_visit">Field visit</option><option value="office_visit">Office visit</option><option value="partner_feedback">Partner feedback</option><option value="document_review">Document review</option><option value="other">Other</option></select></label>
              <label className="field">Due date<input name="due_on" type="date" required/></label>
              <label className="field">Need (optional)<select name="need"><option value="">General case follow-up</option>{detail.needs.map(n=><option key={n.id} value={n.id}>{n.category} · {n.description}</option>)}</select></label>
            </div><label className="field">Scheduling reason<textarea name="reason" required minLength={5} maxLength={2000}/></label><button className="primary">Schedule follow-up</button></fieldset>
          </form>
        </details>
      </section>
    </section>}
  </section>;
}

function DelegatedFollowupCard({followup,busy,run}:{followup:DetailFollowup;busy:boolean;run:(task:()=>Promise<unknown>,message:string)=>Promise<unknown>}){
  return <article className="document-row">
    <div className="panel-title"><div><strong>{label(followup.followup_type)} · due {followup.due_on}</strong><p>{followup.last_reason}</p></div><Badge value={followup.status}/></div>
    {followup.status==='completed'&&<><p><strong>Outcome: {label(followup.outcome_status||'completed')}</strong> · {followup.observations}</p>{followup.beneficiary_feedback&&<p>Beneficiary feedback: {followup.beneficiary_feedback}</p>}<p>Next action: {followup.next_action}{followup.next_follow_up_on?` · next ${followup.next_follow_up_on}`:''}</p></>}
    {followup.status==='cancelled'&&<p>Cancelled: {followup.cancellation_reason}</p>}
    {followup.status==='scheduled'&&<details className="survey-question"><summary>Complete follow-up</summary>
      <form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('complete_beneficiary_case_followup',{p_id:followup.id,p_outcome:val(form,'outcome'),p_observations:val(form,'observations'),p_feedback:val(form,'feedback')||null,p_next_action:val(form,'next_action'),p_next_follow_up:val(form,'next_follow_up')||null,p_need_status:val(form,'need_status')||null,p_reason:val(form,'reason'),p_version:followup.version}),'Follow-up outcome recorded.')}}>
        <fieldset disabled={busy}><div className="form-grid"><label className="field">Outcome<select name="outcome" defaultValue="unresolved"><option value="resolved">Resolved</option><option value="partially_resolved">Partially resolved</option><option value="unresolved">Unresolved</option><option value="further_assistance_required">Further assistance required</option><option value="referred">Referred</option><option value="unable_to_verify">Unable to verify</option></select></label><label className="field">Need status (if linked)<select name="need_status"><option value="">No change</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="met">Met</option><option value="closed">Closed</option><option value="needs_review">Needs review</option></select></label><label className="field">Next follow-up<input name="next_follow_up" type="date"/></label></div><label className="field">Observations<textarea name="observations" required minLength={5} maxLength={4000}/></label><label className="field">Beneficiary feedback<textarea name="feedback" maxLength={4000}/></label><label className="field">Next action<textarea name="next_action" required minLength={3} maxLength={2000}/></label><label className="field">Completion reason<textarea name="reason" required minLength={5} maxLength={2000}/></label><button className="primary">Record outcome</button></fieldset>
      </form>
    </details>}
    {followup.status==='scheduled'&&<form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('cancel_beneficiary_case_followup',{p_id:followup.id,p_reason:val(form,'reason'),p_version:followup.version}),'Follow-up cancelled.')}}><label className="field">Cancellation reason<input name="reason" required minLength={5} maxLength={2000}/></label><button className="secondary" disabled={busy}>Cancel follow-up</button></form>}
  </article>;
}
