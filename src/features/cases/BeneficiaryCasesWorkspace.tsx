import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import {Badge} from '../../shared/ui/FormFields';
import {EmptyState} from '../../components/ui/WorkflowOverview';
import {rpc} from '../../lib/supabase/client';

type Call=(name:string,args?:Record<string,unknown>)=>Promise<unknown>;
const call=rpc as unknown as Call;
const title=(value:string)=>value.replaceAll('_',' ');
const money=(value:string|number|null)=>value===null?'—':new Intl.NumberFormat('en-PK',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value));
const val=(form:FormData,key:string)=>String(form.get(key)||'').trim();
const isoFromLocal=(form:FormData,key:string)=>{const raw=val(form,key);if(!raw)return null;const parsed=new Date(raw);if(Number.isNaN(parsed.getTime()))throw new Error('Valid distribution date/time required.');return parsed.toISOString()};
const localDateTime=(value:string|null)=>{if(!value)return '';const d=new Date(value),pad=(n:number)=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`};
const dateTime=(value:string|null)=>value?new Date(value).toLocaleString():'not scheduled';

type ProjectOption={id:string;title:string;organization_id:string;organization_name:string;status:string;geography_id:string};
type PersonOption={id:string;registry_no:number;full_name:string;birth_date:string|null;household_id:string;household_label:string;open_cases:number};
type ResponseOption={id:string;version:number;created_at:string;reviewed_at:string|null;review_note:string};
type NeedOption={id:string;category:string;description:string;priority:string;status:string;follow_up_on:string|null;version:number;active_case_id:string|null};
type Intake={projects:ProjectOption[];people:PersonOption[];responses:ResponseOption[];needs:NeedOption[]};

type CaseRow={
  id:string;case_no:number;organization_id:string;organization_name:string;project_id:string;project_title:string;person_id:string;beneficiary_name:string;registry_no:number;
  title:string;summary:string;priority:string;status:string;follow_up_on:string|null;version:number;updated_at:string;
  active_needs:number;draft_requests:number;submitted_requests:number;approved_requests:number;
};
type Queue={rows:CaseRow[];summary:Record<string,number>;limit:number};
type CaseData={
  id:string;case_no:number;organization_id:string;project_id:string;person_id:string;source_response_id:string;source_response_version:number;geography_id:string;
  title:string;summary:string;priority:string;status:string;follow_up_on:string|null;last_reason:string;version:number;created_at:string;updated_at:string;closure_reason:string|null;
  closure_category:string|null;closure_summary:string|null;
};
type LinkedNeed=NeedOption&{link_active:boolean;link_reason:string;link_version:number};
type AssistanceRequest={
  id:string;request_no:number;case_id:string;need_id:string;kind:'cash'|'goods'|'service';category:string;program:string;purpose:string;
  requested_amount_pkr:string|null;requested_quantity:string|null;requested_unit:string|null;urgency:string;desired_by:string|null;status:string;version:number;
  last_reason:string;review_note:string|null;created_at:string;submitted_at:string|null;reviewed_at:string|null;
};
type DistributionPlan={
  id:string;plan_no:number;request_id:string;case_id:string;organization_id:string;project_id:string;person_id:string;need_id:string;geography_id:string;
  request_version:number;distribution_mode:'distribution_site'|'home_delivery'|'service_referral'|'field_visit'|'other';location_label:string;responsible_party:string;instructions:string;
  scheduled_start:string|null;scheduled_end:string|null;status:'draft'|'scheduled'|'ready'|'cancelled';last_reason:string;version:number;created_at:string;updated_at:string;cancellation_reason:string|null;
};
type DistributionQueueRow={
  id:string;plan_no:number;request_id:string;request_no:number;case_id:string;case_no:number;organization_id:string;organization_name:string;project_id:string;project_title:string;
  person_id:string;beneficiary_name:string;registry_no:number;kind:string;category:string;program:string;urgency:string;distribution_mode:string;location_label:string;responsible_party:string;
  scheduled_start:string|null;scheduled_end:string|null;status:string;version:number;updated_at:string;assistance_id:string|null;delivery_status:'delivered'|'not_recorded';
};
type DistributionQueue={rows:DistributionQueueRow[];summary:Record<string,number>;limit:number};
type Delivery={assistance_id:string;plan_id:string;request_id:string;status:'recorded'|'void';recorded_at:string;voided_at:string|null;duplicate_override_used:boolean;kind:string;category:string;program:string;description:string;amount_pkr:string|null;quantity:string|null;unit:string|null;delivered_on:string;funding_source:string;evidence_reference:string;next_eligible_on:string|null;assistance_status:'recorded'|'void';void_reason:string|null};
type DuplicateMatch={assistance_id:string;organization_name:string;project_title:string;kind:string;category:string;program:string;description:string;amount_pkr:string|null;quantity:string|null;unit:string|null;delivered_on:string;next_eligible_on:string|null;exact_same_day:boolean;eligibility_overlap:boolean;recent_same_category:boolean;blocking:boolean};
type DuplicatePreview={blocking_count:number;visible_blocking_count:number;protected_blocking_count:number;recent_count:number;visible_matches:DuplicateMatch[];poem_review_required:boolean;can_override:boolean;override_required:boolean};

type CaseFollowup={
  id:string;parent_followup_id:string|null;need_id:string|null;assistance_id:string|null;followup_type:'phone'|'field_visit'|'office_visit'|'partner_feedback'|'document_review'|'other';due_on:string;
  status:'scheduled'|'completed'|'cancelled';outcome_status:'resolved'|'partially_resolved'|'unresolved'|'further_assistance_required'|'referred'|'unable_to_verify'|null;
  observations:string|null;beneficiary_feedback:string|null;next_action:string|null;next_follow_up_on:string|null;last_reason:string;version:number;created_at:string;updated_at:string;
  completed_at:string|null;cancelled_at:string|null;cancellation_reason:string|null;
};
type FollowupQueueRow=CaseFollowup&{case_id:string;case_no:number;organization_id:string;organization_name:string;project_id:string;project_title:string;person_id:string;beneficiary_name:string;registry_no:number};
type FollowupQueue={rows:FollowupQueueRow[];summary:Record<string,number>;utc_today:string;limit:number};
type ClosureEligibility={can_close:boolean;draft_requests:number;submitted_requests:number;approved_without_delivery:number;active_plans_without_delivery:number;pending_needs:number;scheduled_followups:number;deliveries_without_completed_followup:number};
type LifecycleEvent={id:number;event_type:'closed'|'reopened';case_version:number;closure_category:string|null;summary:string;reason:string;actor_id:string|null;recorded_at:string};
type CaseDetail={
  case:CaseData;
  person:{id:string;registry_no:number;full_name:string;birth_date:string|null;household_id:string};
  project:{id:string;title:string;status:string;organization_id:string};
  organization:{id:string;name:string;status:string};
  source_response:{id:string;version:number;status:string;created_at:string;reviewed_at:string|null;review_note:string}|null;
  needs:LinkedNeed[];
  available_needs:NeedOption[];
  requests:AssistanceRequest[];
  distribution_plans:DistributionPlan[];
  deliveries:Delivery[];
  followups:CaseFollowup[];
  case_history:Array<{version:number;reason:string;recorded_at:string}>;
  lifecycle_history:LifecycleEvent[];
  closure_eligibility:ClosureEligibility;
  can_approve_requests:boolean;
};

export function BeneficiaryCasesWorkspace({organization=null,projectId=null}:{organization?:string|null;projectId?:string|null}){
  const [queue,setQueue]=useState<Queue>({rows:[],summary:{},limit:100});
  const [planQueue,setPlanQueue]=useState<DistributionQueue>({rows:[],summary:{},limit:100});
  const [followupQueue,setFollowupQueue]=useState<FollowupQueue>({rows:[],summary:{},utc_today:'',limit:100});
  const [baseIntake,setBaseIntake]=useState<Intake>({projects:[],people:[],responses:[],needs:[]});
  const [personIntake,setPersonIntake]=useState<Intake>({projects:[],people:[],responses:[],needs:[]});
  const [selectedProject,setSelectedProject]=useState(projectId||'');
  const [selectedPerson,setSelectedPerson]=useState('');
  const [selectedCase,setSelectedCase]=useState<string|null>(null);
  const [detail,setDetail]=useState<CaseDetail|null>(null);
  const [status,setStatus]=useState('');
  const [priority,setPriority]=useState('');
  const [planStatus,setPlanStatus]=useState('');
  const [followupStatus,setFollowupStatus]=useState('');
  const [kind,setKind]=useState<'cash'|'goods'|'service'>('cash');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [revision,setRevision]=useState(0);

  const refresh=useCallback(()=>setRevision(v=>v+1),[]);
  async function run(task:()=>Promise<unknown>,message:string){
    setBusy(true);setError('');setNotice('');
    try{const result=await task();setNotice(message);refresh();return result}catch(e){setError((e as Error).message);return null}finally{setBusy(false)}
  }

  useEffect(()=>{
    let live=true;setLoading(true);setError('');
    Promise.all([
      call('beneficiary_case_queue',{p_organization:organization,p_project:projectId,p_status:status||null,p_priority:priority||null,p_limit:100}),
      call('beneficiary_case_intake_options',{p_organization:organization,p_project:projectId,p_person:null}),
      call('assistance_distribution_plan_queue',{p_organization:organization,p_project:projectId,p_status:planStatus||null,p_limit:100}),
      call('beneficiary_case_followup_queue',{p_organization:organization,p_project:projectId,p_status:followupStatus||null,p_type:null,p_due_from:null,p_due_to:null,p_limit:100}),
    ]).then(([q,i,pq,fq])=>{
      if(!live)return;
      const next=i as Intake;setQueue(q as Queue);setPlanQueue(pq as DistributionQueue);setFollowupQueue(fq as FollowupQueue);setBaseIntake(next);
      if(projectId)setSelectedProject(projectId);
      else setSelectedProject(current=>current&&next.projects.some(p=>p.id===current)?current:(next.projects[0]?.id||''));
    }).catch(e=>{if(live)setError((e as Error).message)}).finally(()=>{if(live)setLoading(false)});
    return()=>{live=false};
  },[organization,projectId,status,priority,planStatus,followupStatus,revision]);

  useEffect(()=>{
    if(!selectedProject){setBaseIntake(v=>({...v,people:[]}));setSelectedPerson('');return}
    let live=true;
    call('beneficiary_case_intake_options',{p_organization:organization,p_project:selectedProject,p_person:null}).then(result=>{
      if(!live)return;const next=result as Intake;setBaseIntake(current=>({...current,projects:current.projects.length?current.projects:next.projects,people:next.people}));
      setSelectedPerson(current=>current&&next.people.some(p=>p.id===current)?current:'');
    }).catch(e=>{if(live)setError((e as Error).message)});
    return()=>{live=false};
  },[organization,selectedProject,revision]);

  useEffect(()=>{
    if(!selectedProject||!selectedPerson){setPersonIntake({projects:[],people:[],responses:[],needs:[]});return}
    let live=true;
    call('beneficiary_case_intake_options',{p_organization:organization,p_project:selectedProject,p_person:selectedPerson}).then(result=>{if(live)setPersonIntake(result as Intake)}).catch(e=>{if(live)setError((e as Error).message)});
    return()=>{live=false};
  },[organization,selectedProject,selectedPerson,revision]);

  useEffect(()=>{
    if(!selectedCase){setDetail(null);return}
    let live=true;
    call('beneficiary_case_detail',{p_case:selectedCase}).then(result=>{if(live)setDetail(result as CaseDetail)}).catch(e=>{if(live){setError((e as Error).message);setSelectedCase(null)}});
    return()=>{live=false};
  },[selectedCase,revision]);

  function createCase(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const formEl=event.currentTarget,form=new FormData(formEl),id=crypto.randomUUID();
    void run(()=>call('create_beneficiary_case',{
      p_id:id,p_person:selectedPerson,p_response:val(form,'response'),p_need:val(form,'need')||null,p_title:val(form,'title'),p_summary:val(form,'summary'),
      p_priority:val(form,'priority'),p_follow_up:val(form,'follow_up')||null,p_reason:val(form,'reason'),
    }),'Beneficiary case created.').then(result=>{if(result!==null){formEl.reset();setSelectedCase(id)}});
  }

  function reviewRequest(event:FormEvent<HTMLFormElement>,request:AssistanceRequest){
    event.preventDefault();
    const submitter=(event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement|null;
    const decision=submitter?.value;
    if(decision!=='approve'&&decision!=='reject'){setError('Choose Approve or Reject explicitly.');return}
    const form=new FormData(event.currentTarget);
    void run(()=>call('review_assistance_request',{p_id:request.id,p_decision:decision,p_note:val(form,'note'),p_version:request.version}),decision==='approve'?'Assistance request approved for planning.':'Assistance request rejected.');
  }

  const activeNeeds=useMemo(()=>detail?.needs.filter(n=>n.link_active)||[],[detail]);
  const linkableNeeds=useMemo(()=>detail?.available_needs.filter(n=>!n.active_case_id||n.active_case_id===detail.case.id)||[],[detail]);

  return <section className="registry-operations" aria-label="Beneficiary cases, assistance requests, distribution planning, delivery and follow-up">
    <div className="panel-title"><div><span className="eyebrow">ASSISTANCE OPERATIONS</span><h2>Beneficiary cases, delivery, follow-up & outcomes</h2></div><Badge value="2.19.3"/></div>
    <div className="notice"><strong>Closure is evidence-based.</strong> Delivered assistance remains in <code>assistance_entries</code>. 2.19.3 adds structured follow-up and outcomes, then allows case closure only after requests, plans, needs and required post-delivery follow-ups are resolved. Worker payments and project finance remain separate.</div>
    {error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="notice success" role="status">{notice}</p>}
    <div className="stats">
      <article className="stat"><div>Total cases</div><b>{queue.summary.total??0}</b></article>
      <article className="stat"><div>Requests awaiting review</div><b>{queue.summary.submitted_requests??0}</b></article>
      <article className="stat"><div>Approved awaiting plan</div><b>{planQueue.summary.awaiting_plan??0}</b></article>
      <article className="stat"><div>Draft plans</div><b>{planQueue.summary.draft??0}</b></article>
      <article className="stat"><div>Scheduled</div><b>{planQueue.summary.scheduled??0}</b></article>
      <article className="stat"><div>Ready to deliver</div><b>{planQueue.summary.ready_to_deliver??planQueue.summary.ready??0}</b></article>
      <article className="stat"><div>Delivered</div><b>{planQueue.summary.delivered??0}</b></article>
      <article className="stat"><div>Follow-ups overdue</div><b>{followupQueue.summary.overdue??0}</b></article>
      <article className="stat"><div>Due today</div><b>{followupQueue.summary.due_today??0}</b></article>
    </div>

    <section className="panel detail">
      <div className="panel-title"><h3>Case queue</h3><button className="secondary" disabled={busy||loading} onClick={refresh}>Refresh</button></div>
      <div className="form-grid">
        <label className="field">Status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All</option><option value="open">Open</option><option value="on_hold">On hold</option><option value="closed">Closed</option></select></label>
        <label className="field">Priority<select value={priority} onChange={e=>setPriority(e.target.value)}><option value="">All</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
      </div>
      {loading&&<p role="status">Loading beneficiary cases…</p>}
      {!loading&&!queue.rows.length&&<EmptyState>No beneficiary cases match this scope/filter.</EmptyState>}
      {queue.rows.map(row=><article className="document-row" key={row.id}>
        <div className="panel-title"><div><strong>CASE-{row.case_no} · {row.title}</strong><p>{row.beneficiary_name} · BEN-{row.registry_no} · {row.project_title}</p></div><Badge value={row.status}/></div>
        <p>{row.priority} priority · {row.active_needs} active need(s) · {row.submitted_requests} awaiting review · {row.approved_requests} approved</p>
        <p>{row.summary}</p>
        <button className="secondary" onClick={()=>setSelectedCase(row.id)}>Open case</button>
      </article>)}
    </section>

    <section className="panel detail" aria-label="Distribution planning queue">
      <div className="panel-title"><div><h3>Distribution planning queue</h3><p>Approved request → plan → schedule → ready → duplicate review → delivered assistance ledger.</p></div><button className="secondary" disabled={busy||loading} onClick={refresh}>Refresh</button></div>
      <label className="field">Plan status<select value={planStatus} onChange={e=>setPlanStatus(e.target.value)}><option value="">All</option><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="ready">Ready</option><option value="cancelled">Cancelled</option></select></label>
      {!loading&&!planQueue.rows.length&&<EmptyState>No distribution plans match this scope/filter.</EmptyState>}
      {planQueue.rows.map(plan=><article className="document-row" key={plan.id}>
        <div className="panel-title"><div><strong>DP-{plan.plan_no} · AR-{plan.request_no} · {plan.program}</strong><p>{plan.beneficiary_name} · BEN-{plan.registry_no} · {plan.project_title}</p></div><Badge value={plan.delivery_status==='delivered'?'delivered':plan.status}/></div>
        <p>{title(plan.distribution_mode)} · {plan.location_label} · Responsible: {plan.responsible_party}</p>
        <p>Schedule: {dateTime(plan.scheduled_start)}{plan.scheduled_end?` → ${dateTime(plan.scheduled_end)}`:''}</p>
        <button className="secondary" onClick={()=>setSelectedCase(plan.case_id)}>Open case</button>
      </article>)}
    </section>



    <section className="panel detail" aria-label="Beneficiary follow-up queue">
      <div className="panel-title"><div><h3>Follow-up & outcome queue</h3><p>Scheduled beneficiary contact, post-delivery outcome review and next-action tracking.</p></div><button className="secondary" disabled={busy||loading} onClick={refresh}>Refresh</button></div>
      <label className="field">Follow-up status<select value={followupStatus} onChange={e=>setFollowupStatus(e.target.value)}><option value="">All</option><option value="scheduled">Scheduled</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
      {!loading&&!followupQueue.rows.length&&<EmptyState>No beneficiary follow-ups match this scope/filter.</EmptyState>}
      {followupQueue.rows.map(item=><article className="document-row" key={item.id}>
        <div className="panel-title"><div><strong>CASE-{item.case_no} · {title(item.followup_type)}</strong><p>{item.beneficiary_name} · BEN-{item.registry_no} · {item.project_title}</p></div><Badge value={item.status}/></div>
        <p>Due {item.due_on}{item.outcome_status?` · Outcome: ${title(item.outcome_status)}`:''}{item.next_follow_up_on?` · Next ${item.next_follow_up_on}`:''}</p>
        {item.next_action&&<p>Next action: {item.next_action}</p>}
        <button className="secondary" onClick={()=>setSelectedCase(item.case_id)}>Open case</button>
      </article>)}
    </section>

    <details className="panel detail" open={!queue.rows.length}>
      <summary><strong>Create beneficiary case</strong></summary>
      <p>Create from an approved survey record. Linking an assessed need is optional at intake, but an assistance request requires an active case-need link.</p>
      <form onSubmit={createCase}>
        <fieldset disabled={busy||!selectedProject}>
          <div className="form-grid">
            {!projectId&&<label className="field">Project<select value={selectedProject} onChange={e=>{setSelectedProject(e.target.value);setSelectedPerson('')}} required><option value="">Choose project</option>{baseIntake.projects.map(p=><option value={p.id} key={p.id}>{p.organization_name} · {p.title}</option>)}</select></label>}
            <label className="field">Beneficiary<select value={selectedPerson} onChange={e=>setSelectedPerson(e.target.value)} required><option value="">Choose beneficiary</option>{baseIntake.people.map(p=><option value={p.id} key={p.id}>{p.full_name} · BEN-{p.registry_no} · open cases {p.open_cases}</option>)}</select></label>
            <label className="field">Approved source survey<select name="response" required><option value="">Choose response</option>{personIntake.responses.map(r=><option value={r.id} key={r.id}>{new Date(r.reviewed_at||r.created_at).toLocaleDateString()} · v{r.version} · {r.id}</option>)}</select></label>
            <label className="field">Assessed need (optional)<select name="need"><option value="">No need linked at intake</option>{personIntake.needs.filter(n=>['open','in_progress','needs_review'].includes(n.status)).map(n=><option value={n.id} key={n.id} disabled={Boolean(n.active_case_id)}>{n.category} · {n.priority} · {n.description}{n.active_case_id?' · already in active case':''}</option>)}</select></label>
            <label className="field">Priority<select name="priority" defaultValue="medium"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
            <label className="field">Follow-up date<input name="follow_up" type="date"/></label>
          </div>
          <label className="field">Case title<input name="title" required minLength={5} maxLength={160}/></label>
          <label className="field">Case summary<textarea name="summary" required minLength={10} maxLength={2000}/></label>
          <label className="field">Opening rationale / evidence<textarea name="reason" required minLength={5} maxLength={2000}/></label>
          <button className="primary">Create case</button>
        </fieldset>
      </form>
    </details>

    {detail&&<section className="panel detail" aria-label="Beneficiary case detail">
      <div className="panel-title"><div><span className="eyebrow">CASE-{detail.case.case_no}</span><h3>{detail.case.title}</h3><p>{detail.person.full_name} · BEN-{detail.person.registry_no} · {detail.project.title}</p></div><button className="secondary" onClick={()=>setSelectedCase(null)}>Close detail</button></div>
      <p>{detail.case.summary}</p>
      <p><strong>{detail.case.priority} priority · {title(detail.case.status)}</strong> · Follow-up {detail.case.follow_up_on||'not scheduled'} · v{detail.case.version}</p>
      <p>Last case reason: {detail.case.last_reason}</p>

      {detail.case.status!=='closed'?<details className="survey-question">
        <summary>Review case status/details</summary>
        <form key={detail.case.version} onSubmit={event=>{
          event.preventDefault();const form=new FormData(event.currentTarget);
          void run(()=>call('update_beneficiary_case',{p_case:detail.case.id,p_title:val(form,'title'),p_summary:val(form,'summary'),p_priority:val(form,'priority'),p_status:val(form,'status'),p_follow_up:val(form,'follow_up')||null,p_reason:val(form,'reason'),p_version:detail.case.version}),'Beneficiary case reviewed.');
        }}>
          <fieldset disabled={busy}>
            <label className="field">Title<input name="title" required minLength={5} maxLength={160} defaultValue={detail.case.title}/></label>
            <label className="field">Summary<textarea name="summary" required minLength={10} maxLength={2000} defaultValue={detail.case.summary}/></label>
            <div className="form-grid">
              <label className="field">Priority<select name="priority" defaultValue={detail.case.priority}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
              <label className="field">Status<select name="status" defaultValue={detail.case.status}><option value="open">Open</option><option value="on_hold">On hold</option></select></label>
              <label className="field">Legacy case follow-up date<input name="follow_up" type="date" defaultValue={detail.case.follow_up_on||''}/></label>
            </div>
            <label className="field">Review reason<textarea name="reason" required minLength={5} maxLength={2000}/></label>
            <p>Use the structured Follow-up & outcomes section below for beneficiary contact, and the dedicated closure control after all blockers are resolved.</p>
            <button className="primary">Save case review</button>
          </fieldset>
        </form>
      </details>:<div className="notice">
        <strong>Case closed{detail.case.closure_category?` · ${title(detail.case.closure_category)}`:''}.</strong>
        <p>{detail.case.closure_summary||detail.case.closure_reason}</p>
        <form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('reopen_beneficiary_case',{p_case:detail.case.id,p_reason:val(form,'reason'),p_version:detail.case.version}),'Beneficiary case reopened.')}}>
          <label className="field">Reopening reason<textarea name="reason" required minLength={5} maxLength={2000}/></label><button className="primary" disabled={busy}>Reopen case</button>
        </form>
      </div>}

      <h4>Assessed needs in this case</h4>
      {!detail.needs.length&&<EmptyState>No assessed needs linked to this case yet.</EmptyState>}
      {detail.needs.map(n=><article className="document-row" key={n.id}>
        <div className="panel-title"><strong>{n.category} · {n.priority}</strong><Badge value={n.link_active?'linked':'unlinked'}/></div>
        <p>{n.description}</p><p>Need status: {title(n.status)} · {n.link_reason}</p>
        {n.link_active&&<form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('set_beneficiary_case_need',{p_case:detail.case.id,p_need:n.id,p_active:false,p_reason:val(form,'reason'),p_case_version:detail.case.version,p_link_version:n.link_version}),'Assessed need unlinked from case.')}}>
          <label className="field">Reason to unlink<input name="reason" required minLength={5} maxLength={2000}/></label><button className="secondary" disabled={busy||detail.case.status==='closed'}>Unlink need</button>
        </form>}
      </article>)}
      {detail.case.status!=='closed'&&<details className="survey-question"><summary>Link another assessed need</summary>
        <form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget),needId=val(form,'need'),need=linkableNeeds.find(n=>n.id===needId);void run(()=>call('set_beneficiary_case_need',{p_case:detail.case.id,p_need:needId,p_active:true,p_reason:val(form,'reason'),p_case_version:detail.case.version,p_link_version:need?.active_case_id===detail.case.id?(detail.needs.find(n=>n.id===needId)?.link_version||0):0}),'Assessed need linked to case.')}}>
          <fieldset disabled={busy}><label className="field">Need<select name="need" required><option value="">Choose pending need</option>{linkableNeeds.filter(n=>['open','in_progress','needs_review'].includes(n.status)&&!detail.needs.some(x=>x.id===n.id&&x.link_active)).map(n=><option value={n.id} key={n.id}>{n.category} · {n.priority} · {n.description}</option>)}</select></label><label className="field">Reason<input name="reason" required minLength={5} maxLength={2000}/></label><button className="secondary">Link need</button></fieldset>
        </form></details>}

      <h4>Assistance requests</h4>
      {!detail.requests.length&&<EmptyState>No assistance requests recorded for this case.</EmptyState>}
      {detail.requests.map(request=><article className="document-row" key={request.id}>
        <div className="panel-title"><div><strong>AR-{request.request_no} · {request.program}</strong><p>{request.category} · {request.kind} · {request.urgency} urgency</p></div><Badge value={request.status}/></div>
        <p>{request.purpose}</p>
        <p>{request.kind==='cash'?`Requested PKR ${money(request.requested_amount_pkr)}`:`Requested ${request.requested_quantity} ${request.requested_unit}`} · Desired by {request.desired_by||'not specified'} · v{request.version}</p>
        <p>Last reason: {request.last_reason}{request.review_note?` · Review: ${request.review_note}`:''}</p>
        {request.status==='draft'&&<div className="actions">
          <form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('submit_assistance_request',{p_id:request.id,p_reason:val(form,'reason'),p_version:request.version}),'Assistance request submitted for review.')}}><label className="field">Submission reason<input name="reason" required minLength={5} maxLength={2000}/></label><button className="primary" disabled={busy}>Submit request</button></form>
          <CancelRequest request={request} busy={busy} run={run}/>
        </div>}
        {request.status==='submitted'&&<>
          {detail.can_approve_requests?<form onSubmit={event=>reviewRequest(event,request)}><label className="field">Review note<textarea name="note" required minLength={5} maxLength={2000}/></label><div className="actions"><button className="primary" name="decision" value="approve" disabled={busy}>Approve</button><button className="secondary" name="decision" value="reject" disabled={busy}>Reject</button></div></form>:<p><strong>Awaiting NGO Admin / POEM survey approval.</strong></p>}
          <CancelRequest request={request} busy={busy} run={run}/>
        </>}
        <DistributionPlans request={request} plans={detail.distribution_plans.filter(plan=>plan.request_id===request.id)} deliveries={detail.deliveries.filter(delivery=>delivery.request_id===request.id)} busy={busy} run={run}/>
        {request.status==='approved'&&detail.can_approve_requests&&!detail.distribution_plans.some(plan=>plan.request_id===request.id&&plan.status!=='cancelled')&&<CancelRequest request={request} busy={busy} run={run}/>} 
        {request.status==='approved'&&detail.can_approve_requests&&detail.distribution_plans.some(plan=>plan.request_id===request.id&&plan.status!=='cancelled')&&<p><strong>Cancel the active distribution plan before cancelling this approved request.</strong></p>}
      </article>)}

      {detail.case.status==='open'&&activeNeeds.length>0&&<details className="survey-question"><summary>Create assistance request</summary>
        <p>An approved request is permission to plan support; it does not create a delivery ledger entry.</p>
        <form onSubmit={event=>{event.preventDefault();const formEl=event.currentTarget,form=new FormData(formEl),id=crypto.randomUUID();void run(()=>call('create_assistance_request',{p_id:id,p_case:detail.case.id,p_need:val(form,'need'),p_kind:kind,p_category:val(form,'category'),p_program:val(form,'program'),p_purpose:val(form,'purpose'),p_amount:kind==='cash'?Number(val(form,'amount')):null,p_quantity:kind==='cash'?null:Number(val(form,'quantity')),p_unit:kind==='cash'?null:val(form,'unit'),p_urgency:val(form,'urgency'),p_desired_by:val(form,'desired_by')||null}),'Draft assistance request created.').then(result=>{if(result!==null)formEl.reset()})}}>
          <fieldset disabled={busy}>
            <div className="form-grid">
              <label className="field">Assessed need<select name="need" required>{activeNeeds.map(n=><option key={n.id} value={n.id}>{n.category} · {n.description}</option>)}</select></label>
              <label className="field">Type<select value={kind} onChange={e=>setKind(e.target.value as 'cash'|'goods'|'service')}><option value="cash">Cash</option><option value="goods">Goods</option><option value="service">Service</option></select></label>
              <label className="field">Category<select name="category" defaultValue={activeNeeds[0]?.category||'other'}>{['food','education','health','housing','livelihood','other'].map(c=><option key={c}>{c}</option>)}</select></label>
              <label className="field">Urgency<select name="urgency" defaultValue="medium"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
              <label className="field">Program<input name="program" required minLength={2} maxLength={150}/></label>
              <label className="field">Desired by<input name="desired_by" type="date"/></label>
              {kind==='cash'?<label className="field">Requested amount PKR<input name="amount" type="number" min="0.01" max="1000000000" step="0.01" required/></label>:<><label className="field">Quantity<input name="quantity" type="number" min="0.001" max="1000000" step="0.001" required/></label><label className="field">Unit<input name="unit" required minLength={1} maxLength={30}/></label></>}
            </div>
            <label className="field">Purpose / requested support<textarea name="purpose" required minLength={5} maxLength={2000}/></label>
            <button className="primary">Create draft request</button>
          </fieldset>
        </form>
      </details>}
      {detail.case.status==='open'&&!activeNeeds.length&&<p className="notice">Link at least one pending assessed need before creating an assistance request.</p>}

      <section aria-label="Follow-up and outcomes">
        <h4>Follow-up & outcomes</h4>
        {!detail.followups.length&&<EmptyState>No structured follow-up has been scheduled for this case yet.</EmptyState>}
        {detail.followups.map(followup=><FollowupCard key={followup.id} followup={followup} needs={detail.needs} busy={busy} run={run}/>)}
        {detail.case.status!=='closed'&&<details className="survey-question"><summary>Schedule follow-up</summary>
          <form onSubmit={event=>{event.preventDefault();const formEl=event.currentTarget,form=new FormData(formEl),id=crypto.randomUUID();void run(()=>call('create_beneficiary_case_followup',{p_id:id,p_case:detail.case.id,p_need:val(form,'need')||null,p_assistance:val(form,'assistance')||null,p_type:val(form,'type'),p_due_on:val(form,'due_on'),p_reason:val(form,'reason')}),'Beneficiary follow-up scheduled.').then(result=>{if(result!==null)formEl.reset()})}}>
            <fieldset disabled={busy}><div className="form-grid">
              <label className="field">Follow-up type<select name="type" defaultValue="phone"><option value="phone">Phone</option><option value="field_visit">Field visit</option><option value="office_visit">Office visit</option><option value="partner_feedback">Partner feedback</option><option value="document_review">Document review</option><option value="other">Other</option></select></label>
              <label className="field">Due date<input name="due_on" type="date" required/></label>
              <label className="field">Assessed need (optional)<select name="need"><option value="">General case follow-up</option>{detail.needs.filter(n=>n.link_active).map(n=><option key={n.id} value={n.id}>{n.category} · {n.description}</option>)}</select></label>
              <label className="field">Delivered assistance (optional)<select name="assistance"><option value="">No specific delivery</option>{detail.deliveries.filter(d=>d.status==='recorded').map(d=><option key={d.assistance_id} value={d.assistance_id}>{d.delivered_on} · {d.program} · {d.description}</option>)}</select></label>
            </div><label className="field">Scheduling reason<textarea name="reason" required minLength={5} maxLength={2000}/></label><button className="primary">Schedule follow-up</button></fieldset>
          </form>
        </details>}
      </section>

      <section aria-label="Case closure">
        <h4>Case closure</h4>
        {detail.case.status!=='closed'&&<>
          <div className={detail.closure_eligibility.can_close?'notice success':'notice'}>
            <strong>{detail.closure_eligibility.can_close?'Case is eligible for controlled closure.':'Closure blockers remain.'}</strong>
            {!detail.closure_eligibility.can_close&&<p>Draft requests {detail.closure_eligibility.draft_requests} · Submitted requests {detail.closure_eligibility.submitted_requests} · Approved without delivery {detail.closure_eligibility.approved_without_delivery} · Active plans without delivery {detail.closure_eligibility.active_plans_without_delivery} · Pending needs {detail.closure_eligibility.pending_needs} · Scheduled follow-ups {detail.closure_eligibility.scheduled_followups} · Delivered assistance awaiting completed follow-up {detail.closure_eligibility.deliveries_without_completed_followup}</p>}
          </div>
          <details className="survey-question"><summary>Close beneficiary case</summary>
            <form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('close_beneficiary_case',{p_case:detail.case.id,p_category:val(form,'category'),p_summary:val(form,'summary'),p_reason:val(form,'reason'),p_version:detail.case.version}),'Beneficiary case closed.')}}>
              <fieldset disabled={busy||!detail.closure_eligibility.can_close}><label className="field">Closure category<select name="category" defaultValue="needs_resolved"><option value="needs_resolved">Needs resolved</option><option value="referred_out">Referred out</option><option value="beneficiary_declined">Beneficiary declined</option><option value="unable_to_contact">Unable to contact</option><option value="duplicate_case">Duplicate case</option><option value="no_longer_eligible">No longer eligible</option><option value="administrative_closure">Administrative closure</option><option value="other">Other</option></select></label><label className="field">Closure summary<textarea name="summary" required minLength={10} maxLength={2000}/></label><label className="field">Closure decision reason<textarea name="reason" required minLength={5} maxLength={2000}/></label><button className="primary">Close case</button></fieldset>
            </form>
          </details>
        </>}
      </section>

      <details><summary>Case revision history</summary>{detail.case_history.map(h=><p key={h.version}>v{h.version} · {new Date(h.recorded_at).toLocaleString()} · {h.reason}</p>)}</details>
      <details><summary>Closure / reopening history</summary>{!detail.lifecycle_history.length?<p>No closure lifecycle events yet.</p>:detail.lifecycle_history.map(e=><p key={e.id}>{new Date(e.recorded_at).toLocaleString()} · {title(e.event_type)}{e.closure_category?` · ${title(e.closure_category)}`:''} · {e.summary} · {e.reason}</p>)}</details>
    </section>}
  </section>;
}


function FollowupCard({followup,needs,busy,run}:{followup:CaseFollowup;needs:LinkedNeed[];busy:boolean;run:(task:()=>Promise<unknown>,message:string)=>Promise<unknown>}){
  const linkedNeed=followup.need_id?needs.find(n=>n.id===followup.need_id):null;
  return <article className="document-row">
    <div className="panel-title"><div><strong>{title(followup.followup_type)} · due {followup.due_on}</strong><p>{followup.assistance_id?'Post-delivery follow-up':'Case follow-up'}{linkedNeed?` · ${linkedNeed.category} need`:''}</p></div><Badge value={followup.status}/></div>
    {followup.status==='completed'&&<><p><strong>Outcome: {title(followup.outcome_status||'completed')}</strong> · {followup.observations}</p>{followup.beneficiary_feedback&&<p>Beneficiary feedback: {followup.beneficiary_feedback}</p>}<p>Next action: {followup.next_action}{followup.next_follow_up_on?` · next follow-up ${followup.next_follow_up_on}`:''}</p></>}
    {followup.status==='cancelled'&&<p>Cancelled: {followup.cancellation_reason}</p>}
    {followup.status==='scheduled'&&<details className="survey-question"><summary>Complete follow-up & record outcome</summary>
      <form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('complete_beneficiary_case_followup',{p_id:followup.id,p_outcome:val(form,'outcome'),p_observations:val(form,'observations'),p_feedback:val(form,'feedback')||null,p_next_action:val(form,'next_action'),p_next_follow_up:val(form,'next_follow_up')||null,p_need_status:val(form,'need_status')||null,p_reason:val(form,'reason'),p_version:followup.version}),'Follow-up outcome recorded.')}}>
        <fieldset disabled={busy}><div className="form-grid"><label className="field">Outcome<select name="outcome" defaultValue="partially_resolved"><option value="resolved">Resolved</option><option value="partially_resolved">Partially resolved</option><option value="unresolved">Unresolved</option><option value="further_assistance_required">Further assistance required</option><option value="referred">Referred</option><option value="unable_to_verify">Unable to verify</option></select></label>{linkedNeed&&<label className="field">Assessed need status<select name="need_status" defaultValue=""><option value="">Keep current status</option><option value="in_progress">In progress</option><option value="met">Met</option><option value="closed">Closed</option><option value="needs_review">Needs review</option></select></label>}<label className="field">Next follow-up (optional)<input name="next_follow_up" type="date"/></label></div><label className="field">Observations<textarea name="observations" required minLength={5} maxLength={4000}/></label><label className="field">Beneficiary feedback (optional)<textarea name="feedback" maxLength={4000}/></label><label className="field">Next action<textarea name="next_action" required minLength={3} maxLength={2000}/></label><label className="field">Outcome reason<textarea name="reason" required minLength={5} maxLength={2000}/></label><button className="primary">Complete follow-up</button></fieldset>
      </form>
    </details>}
    {followup.status==='scheduled'&&<form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('cancel_beneficiary_case_followup',{p_id:followup.id,p_reason:val(form,'reason'),p_version:followup.version}),'Follow-up cancelled.')}}><label className="field">Cancellation reason<input name="reason" required minLength={5} maxLength={2000}/></label><button className="secondary" disabled={busy}>Cancel follow-up</button></form>}
  </article>;
}

function CancelRequest({request,busy,run}:{request:AssistanceRequest;busy:boolean;run:(task:()=>Promise<unknown>,message:string)=>Promise<unknown>}){
  return <form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('cancel_assistance_request',{p_id:request.id,p_reason:val(form,'reason'),p_version:request.version}),'Assistance request cancelled.')}}>
    <label className="field">Cancellation reason<input name="reason" required minLength={5} maxLength={2000}/></label><button className="secondary" disabled={busy}>Cancel request</button>
  </form>;
}

function DistributionPlans({request,plans,deliveries,busy,run}:{request:AssistanceRequest;plans:DistributionPlan[];deliveries:Delivery[];busy:boolean;run:(task:()=>Promise<unknown>,message:string)=>Promise<unknown>}){
  const active=plans.find(plan=>plan.status!=='cancelled');
  return <section aria-label={`Distribution planning for AR-${request.request_no}`}>
    <h5>Distribution planning & delivery</h5>
    {!plans.length&&request.status!=='approved'&&<p>Distribution planning becomes available only after this assistance request is approved.</p>}
    {plans.map(plan=><DistributionPlanCard key={plan.id} plan={plan} deliveries={deliveries.filter(delivery=>delivery.plan_id===plan.id)} busy={busy} run={run}/>)}
    {request.status==='approved'&&!active&&<details className="survey-question"><summary>Create distribution plan</summary>
      <p>This creates an operational plan only. It does not record delivery or create an assistance ledger entry.</p>
      <form onSubmit={event=>{event.preventDefault();const formEl=event.currentTarget,form=new FormData(formEl),id=crypto.randomUUID();void run(()=>call('create_assistance_distribution_plan',{p_id:id,p_request:request.id,p_mode:val(form,'mode'),p_location:val(form,'location'),p_responsible:val(form,'responsible'),p_instructions:val(form,'instructions'),p_reason:val(form,'reason')}),'Draft distribution plan created.').then(result=>{if(result!==null)formEl.reset()})}}>
        <fieldset disabled={busy}>
          <div className="form-grid">
            <label className="field">Distribution mode<select name="mode" defaultValue="distribution_site"><option value="distribution_site">Distribution site</option><option value="home_delivery">Home delivery</option><option value="service_referral">Service referral</option><option value="field_visit">Field visit</option><option value="other">Other</option></select></label>
            <label className="field">Location / venue<input name="location" required minLength={2} maxLength={300}/></label>
            <label className="field">Responsible person / team<input name="responsible" required minLength={2} maxLength={160}/></label>
          </div>
          <label className="field">Instructions<textarea name="instructions" required minLength={5} maxLength={2000}/></label>
          <label className="field">Planning reason<textarea name="reason" required minLength={5} maxLength={2000}/></label>
          <button className="primary">Create draft plan</button>
        </fieldset>
      </form>
    </details>}
  </section>;
}

function DistributionPlanCard({plan,deliveries,busy,run}:{plan:DistributionPlan;deliveries:Delivery[];busy:boolean;run:(task:()=>Promise<unknown>,message:string)=>Promise<unknown>}){
  const recorded=deliveries.find(delivery=>delivery.status==='recorded');
  const voided=deliveries.filter(delivery=>delivery.status==='void');
  return <article className="document-row">
    <div className="panel-title"><div><strong>DP-{plan.plan_no}</strong><p>{title(plan.distribution_mode)} · {plan.location_label}</p></div><Badge value={recorded?'delivered':plan.status}/></div>
    <p>Responsible: {plan.responsible_party} · Schedule: {dateTime(plan.scheduled_start)}{plan.scheduled_end?` → ${dateTime(plan.scheduled_end)}`:''} · v{plan.version}</p>
    <p>{plan.instructions}</p><p>Last reason: {plan.last_reason}{plan.cancellation_reason?` · Cancelled: ${plan.cancellation_reason}`:''}</p>
    {recorded&&<div className="notice success"><strong>Delivered assistance recorded.</strong> {recorded.description} · {recorded.delivered_on} · {recorded.kind==='cash'?`PKR ${money(recorded.amount_pkr)}`:`${recorded.quantity} ${recorded.unit}`} · Evidence: {recorded.evidence_reference}{recorded.duplicate_override_used?' · Duplicate-control override audited.':''}</div>}
    {!!voided.length&&<details><summary>Voided delivery history ({voided.length})</summary>{voided.map(delivery=><p key={delivery.assistance_id}>{delivery.delivered_on} · {delivery.description} · voided: {delivery.void_reason||'reason recorded in ledger'}</p>)}</details>}
    {(plan.status==='draft'||plan.status==='scheduled')&&<details className="survey-question"><summary>Edit plan details</summary>
      <form key={`edit-${plan.id}-${plan.version}`} onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('update_assistance_distribution_plan',{p_id:plan.id,p_mode:val(form,'mode'),p_location:val(form,'location'),p_responsible:val(form,'responsible'),p_instructions:val(form,'instructions'),p_reason:val(form,'reason'),p_version:plan.version}),'Distribution plan details updated.')}}>
        <fieldset disabled={busy}><div className="form-grid">
          <label className="field">Mode<select name="mode" defaultValue={plan.distribution_mode}><option value="distribution_site">Distribution site</option><option value="home_delivery">Home delivery</option><option value="service_referral">Service referral</option><option value="field_visit">Field visit</option><option value="other">Other</option></select></label>
          <label className="field">Location / venue<input name="location" required minLength={2} maxLength={300} defaultValue={plan.location_label}/></label>
          <label className="field">Responsible person / team<input name="responsible" required minLength={2} maxLength={160} defaultValue={plan.responsible_party}/></label>
        </div><label className="field">Instructions<textarea name="instructions" required minLength={5} maxLength={2000} defaultValue={plan.instructions}/></label><label className="field">Edit reason<textarea name="reason" required minLength={5} maxLength={2000}/></label><button className="secondary">Save plan details</button></fieldset>
      </form>
    </details>}
    {(plan.status==='draft'||plan.status==='scheduled')&&<form key={`schedule-${plan.id}-${plan.version}`} onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('schedule_assistance_distribution_plan',{p_id:plan.id,p_start:isoFromLocal(form,'start'),p_end:isoFromLocal(form,'end'),p_reason:val(form,'reason'),p_version:plan.version}),plan.status==='draft'?'Distribution plan scheduled.':'Distribution plan rescheduled.')}}>
      <fieldset disabled={busy}><div className="form-grid"><label className="field">Start<input name="start" type="datetime-local" required defaultValue={localDateTime(plan.scheduled_start)}/></label><label className="field">End (optional)<input name="end" type="datetime-local" defaultValue={localDateTime(plan.scheduled_end)}/></label></div><label className="field">Schedule reason<input name="reason" required minLength={5} maxLength={2000}/></label><button className="primary">{plan.status==='draft'?'Schedule plan':'Reschedule plan'}</button></fieldset>
    </form>}
    {plan.status==='scheduled'&&<form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('mark_assistance_distribution_plan_ready',{p_id:plan.id,p_reason:val(form,'reason'),p_version:plan.version}),'Distribution plan marked ready.')}}><label className="field">Readiness reason<input name="reason" required minLength={5} maxLength={2000}/></label><button className="primary" disabled={busy}>Mark ready</button></form>}
    {plan.status==='ready'&&!recorded&&<DeliveryRecorder plan={plan} busy={busy} run={run}/>}
    {plan.status!=='cancelled'&&!recorded&&<form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('cancel_assistance_distribution_plan',{p_id:plan.id,p_reason:val(form,'reason'),p_version:plan.version}),'Distribution plan cancelled.')}}><label className="field">Cancellation reason<input name="reason" required minLength={5} maxLength={2000}/></label><button className="secondary" disabled={busy}>Cancel plan</button></form>}
  </article>;
}

function DeliveryRecorder({plan,busy,run}:{plan:DistributionPlan;busy:boolean;run:(task:()=>Promise<unknown>,message:string)=>Promise<unknown>}){
  const today=new Date().toISOString().slice(0,10);
  const [delivered,setDelivered]=useState(today);
  const [preview,setPreview]=useState<DuplicatePreview|null>(null);
  const [checking,setChecking]=useState(false);
  const [checkError,setCheckError]=useState('');
  const [deliveryId,setDeliveryId]=useState(()=>crypto.randomUUID());
  async function check(){
    setChecking(true);setCheckError('');
    try{setPreview(await call('assistance_duplicate_support_preview',{p_plan:plan.id,p_delivered:delivered}) as DuplicatePreview)}catch(e){setPreview(null);setCheckError((e as Error).message)}finally{setChecking(false)}
  }
  return <details className="survey-question" open><summary>Record delivered assistance</summary>
    <p>2.19.2 first checks the canonical beneficiary for same-category support. Protected cross-NGO details are not disclosed; a protected blocker requires POEM review.</p>
    {checkError&&<p className="notice error" role="alert">{checkError}</p>}
    <form onSubmit={event=>{event.preventDefault();const formEl=event.currentTarget,form=new FormData(formEl);void run(()=>call('record_assistance_distribution_delivery',{p_plan:plan.id,p_assistance:deliveryId,p_description:val(form,'description'),p_delivered:delivered,p_funding:val(form,'funding'),p_evidence:val(form,'evidence'),p_next:val(form,'next')||null,p_duplicate_override_reason:val(form,'override')||null,p_plan_version:plan.version}),'Delivered assistance recorded in the authoritative ledger.').then(result=>{if(result!==null){formEl.reset();setDelivered(today);setPreview(null);setDeliveryId(crypto.randomUUID())}})}}>
      <fieldset disabled={busy||checking}>
        <div className="form-grid"><label className="field">Delivered on<input name="delivered" type="date" required max={today} value={delivered} onChange={e=>{setDelivered(e.target.value);setPreview(null)}}/></label><label className="field">Next eligible date (optional)<input name="next" type="date" min={delivered}/></label></div>
        <label className="field">Delivery description<textarea name="description" required minLength={3} maxLength={1000}/></label>
        <div className="form-grid"><label className="field">Funding source<input name="funding" required minLength={2} maxLength={200}/></label><label className="field">Evidence reference<input name="evidence" required minLength={3} maxLength={500}/></label></div>
        <button type="button" className="secondary" onClick={()=>void check()} disabled={!delivered||busy||checking}>{checking?'Checking…':'Check duplicate support'}</button>
        {preview&&<div className={preview.blocking_count?'notice error':'notice success'}>
          <strong>{preview.blocking_count?`${preview.blocking_count} blocking duplicate-support signal(s).`:'No blocking duplicate-support signal found.'}</strong>
          <p>{preview.recent_count} recent same-category record(s) considered. {preview.protected_blocking_count?`${preview.protected_blocking_count} blocker(s) are protected outside your current project authority.`:''}</p>
          {!!preview.visible_matches.length&&<details><summary>Visible assistance matches</summary>{preview.visible_matches.map(match=><p key={match.assistance_id}>{match.delivered_on} · {match.organization_name} · {match.project_title} · {match.program}{match.eligibility_overlap?` · next eligible ${match.next_eligible_on}`:''}{match.exact_same_day?' · same-day amount/quantity match':''}</p>)}</details>}
          {preview.poem_review_required&&<p>POEM duplicate-support review is required. Protected source details remain hidden here.</p>}
        </div>}
        {preview &&
          (preview.blocking_count ?? 0) > 0 &&
          preview.can_override && (
            <label className="field">
              Duplicate-support override reason
              <textarea name="override" required minLength={10} maxLength={2000}/>
            </label>
          )}
        <button className="primary" disabled={busy||!preview||Boolean(preview.blocking_count&&!preview.can_override)}>Record delivered assistance</button>
      </fieldset>
    </form>
  </details>;
}

