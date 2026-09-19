import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import {Badge} from '../../shared/ui/FormFields';
import {EmptyState} from '../../components/ui/WorkflowOverview';
import {rpc} from '../../lib/supabase/client';

type Call=(name:string,args?:Record<string,unknown>)=>Promise<unknown>;
const call=rpc as unknown as Call;
const title=(value:string)=>value.replaceAll('_',' ');
const money=(value:string|number|null)=>value===null?'—':new Intl.NumberFormat('en-PK',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value));
const val=(form:FormData,key:string)=>String(form.get(key)||'').trim();

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
};
type LinkedNeed=NeedOption&{link_active:boolean;link_reason:string;link_version:number};
type AssistanceRequest={
  id:string;request_no:number;case_id:string;need_id:string;kind:'cash'|'goods'|'service';category:string;program:string;purpose:string;
  requested_amount_pkr:string|null;requested_quantity:string|null;requested_unit:string|null;urgency:string;desired_by:string|null;status:string;version:number;
  last_reason:string;review_note:string|null;created_at:string;submitted_at:string|null;reviewed_at:string|null;
};
type CaseDetail={
  case:CaseData;
  person:{id:string;registry_no:number;full_name:string;birth_date:string|null;household_id:string};
  project:{id:string;title:string;status:string;organization_id:string};
  organization:{id:string;name:string;status:string};
  source_response:{id:string;version:number;status:string;created_at:string;reviewed_at:string|null;review_note:string}|null;
  needs:LinkedNeed[];
  available_needs:NeedOption[];
  requests:AssistanceRequest[];
  case_history:Array<{version:number;reason:string;recorded_at:string}>;
  can_approve_requests:boolean;
};

export function BeneficiaryCasesWorkspace({organization=null,projectId=null}:{organization?:string|null;projectId?:string|null}){
  const [queue,setQueue]=useState<Queue>({rows:[],summary:{},limit:100});
  const [baseIntake,setBaseIntake]=useState<Intake>({projects:[],people:[],responses:[],needs:[]});
  const [personIntake,setPersonIntake]=useState<Intake>({projects:[],people:[],responses:[],needs:[]});
  const [selectedProject,setSelectedProject]=useState(projectId||'');
  const [selectedPerson,setSelectedPerson]=useState('');
  const [selectedCase,setSelectedCase]=useState<string|null>(null);
  const [detail,setDetail]=useState<CaseDetail|null>(null);
  const [status,setStatus]=useState('');
  const [priority,setPriority]=useState('');
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
    ]).then(([q,i])=>{
      if(!live)return;
      const next=i as Intake;setQueue(q as Queue);setBaseIntake(next);
      if(projectId)setSelectedProject(projectId);
      else setSelectedProject(current=>current&&next.projects.some(p=>p.id===current)?current:(next.projects[0]?.id||''));
    }).catch(e=>{if(live)setError((e as Error).message)}).finally(()=>{if(live)setLoading(false)});
    return()=>{live=false};
  },[organization,projectId,status,priority,revision]);

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

  return <section className="registry-operations" aria-label="Beneficiary cases and assistance requests">
    <div className="panel-title"><div><span className="eyebrow">ASSISTANCE OPERATIONS</span><h2>Beneficiary cases & assistance requests</h2></div><Badge value="2.19.0"/></div>
    <div className="notice"><strong>Case/request is not delivery.</strong> Assessed needs remain in the needs registry. Approved assistance requests authorize planning only; they do not create <code>assistance_entries</code> or claim that support was delivered.</div>
    {error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="notice success" role="status">{notice}</p>}
    <div className="stats">
      <article className="stat"><div>Total cases</div><b>{queue.summary.total??0}</b></article>
      <article className="stat"><div>Open</div><b>{queue.summary.open??0}</b></article>
      <article className="stat"><div>High priority open</div><b>{queue.summary.high_priority_open??0}</b></article>
      <article className="stat"><div>Requests awaiting review</div><b>{queue.summary.submitted_requests??0}</b></article>
      <article className="stat"><div>Approved for planning</div><b>{queue.summary.approved_requests??0}</b></article>
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

      <details className="survey-question">
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
              <label className="field">Status<select name="status" defaultValue={detail.case.status}><option value="open">Open</option><option value="on_hold">On hold</option><option value="closed">Closed</option></select></label>
              <label className="field">Follow-up<input name="follow_up" type="date" defaultValue={detail.case.follow_up_on||''}/></label>
            </div>
            <label className="field">Review / closure reason<textarea name="reason" required minLength={5} maxLength={2000}/></label>
            <p>Closing is blocked while submitted/approved requests or pending linked needs remain.</p>
            <button className="primary">Save case review</button>
          </fieldset>
        </form>
      </details>

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
        {request.status==='approved'&&detail.can_approve_requests&&<CancelRequest request={request} busy={busy} run={run}/>} 
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

      <details><summary>Case revision history</summary>{detail.case_history.map(h=><p key={h.version}>v{h.version} · {new Date(h.recorded_at).toLocaleString()} · {h.reason}</p>)}</details>
    </section>}
  </section>;
}

function CancelRequest({request,busy,run}:{request:AssistanceRequest;busy:boolean;run:(task:()=>Promise<unknown>,message:string)=>Promise<unknown>}){
  return <form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('cancel_assistance_request',{p_id:request.id,p_reason:val(form,'reason'),p_version:request.version}),'Assistance request cancelled.')}}>
    <label className="field">Cancellation reason<input name="reason" required minLength={5} maxLength={2000}/></label><button className="secondary" disabled={busy}>Cancel request</button>
  </form>;
}
