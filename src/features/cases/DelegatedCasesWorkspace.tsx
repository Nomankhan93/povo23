import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {APP_VERSION} from '../../app/version';
import {Badge} from '../../shared/ui/FormFields';
import {EmptyState} from '../../components/ui/WorkflowOverview';
import {Alert,Button,Card,DataTable,FilterBar,MetricCard,MobileRecordCard,SectionHeader,Select,StatusBadge,type SemanticTone} from '../../components/ui/FieldLanceUI';
import styles from './DelegatedCasesWorkspace.module.css';
import {rpc} from '../../lib/supabase/client';

type Call=(name:string,args?:Record<string,unknown>)=>Promise<unknown>;
const call=rpc as unknown as Call;
const val=(form:FormData,key:string)=>String(form.get(key)||'').trim();
const label=(value:string)=>value.replaceAll('_',' ');

type CreateIntent={signature:string;id:string};
type IntentRef={current:CreateIntent|null};
const createIntentId=(ref:IntentRef,payload:Record<string,unknown>)=>{const signature=JSON.stringify(payload);if(!ref.current||ref.current.signature!==signature)ref.current={signature,id:crypto.randomUUID()};return ref.current.id};
const tone=(value:string):SemanticTone=>['closed','completed','resolved'].includes(value)?'success':['high','overdue','cancelled','unresolved'].includes(value)?'danger':['scheduled','on_hold','partially_resolved'].includes(value)?'warning':'neutral';

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
  location_latitude:number|null;location_longitude:number|null;location_accuracy_m:number|null;location_permission_state:string|null;location_note:string|null;location_captured_at:string|null;location_recorded_by:string|null;
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
  const followupCreateIntent=useRef<CreateIntent|null>(null);
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

  return <section className={styles.workspace} aria-label={view==='cases'?'My delegated beneficiary cases':'My delegated beneficiary follow-ups'}>
    <SectionHeader eyebrow="DELEGATED FIELD OPERATIONS" title={view==='cases'?'My Cases':'My Follow-ups'} description="Work only on explicitly delegated beneficiary cases within your current project and geography authority." actions={<Button disabled={busy||loading} onClick={refresh}>Refresh</Button>}/>
    <Alert title="Delegated operational access only" tone="info">Only explicitly delegated cases are shown. Case access also requires your current project and geography authority. Assistance approvals, finance and organization administration remain outside this workspace.</Alert>
    {error&&<Alert title="Delegated cases need attention" tone="danger">{error}</Alert>}{notice&&<Alert title="Delegated case updated" tone="success">{notice}</Alert>}

    {view==='cases'?<>
      <div className={styles.metricGrid}><MetricCard label="Assigned" value={caseQueue.summary.total??0}/><MetricCard label="Due today" value={caseQueue.summary.due_today??0}/><MetricCard label="Overdue" value={caseQueue.summary.overdue??0}/><MetricCard label="Upcoming" value={caseQueue.summary.upcoming??0}/></div>
      <Card className={styles.queueCard}>
        <SectionHeader title="Assigned case queue" description="Beneficiary context and follow-up readiness for cases explicitly delegated to you."/>
        <FilterBar actions={<Button disabled={busy||loading} onClick={refresh}>Refresh cases</Button>}><Select label="View" value={caseView} onChange={e=>setCaseView(e.target.value)} options={[{value:'all',label:'All assigned'},{value:'open',label:'Open / on hold'},{value:'due_today',label:'Due today'},{value:'overdue',label:'Overdue'},{value:'upcoming',label:'Upcoming'}]}/></FilterBar>
        {loading&&<p className={styles.helper} role="status">Loading assigned cases…</p>}
        {!loading&&!caseQueue.rows.length&&<EmptyState>No cases are currently delegated to you in this view.</EmptyState>}
        {!!caseQueue.rows.length&&<><DataTable caption="My delegated cases" className={styles.desktopTable}><thead><tr><th>Case</th><th>Beneficiary / project</th><th>Priority</th><th>Geography</th><th>Follow-up</th><th>Status</th><th>Action</th></tr></thead><tbody>{caseQueue.rows.map(row=><tr key={row.id}><td><strong>CASE-{row.case_no}</strong><span>{row.title}</span></td><td><strong>{row.beneficiary_name} · BEN-{row.registry_no}</strong><span>{row.project_title}</span></td><td>{label(row.priority)}</td><td>{row.geography_name} · {label(row.owner_role)}</td><td>{row.next_followup_on||'None scheduled'} · {row.overdue_followups} overdue · {row.due_today_followups} due today</td><td><StatusBadge tone={tone(row.status)}>{label(row.status)}</StatusBadge></td><td><Button onClick={()=>selectCase(row.id)} aria-label={`Open CASE-${row.case_no}`}>Open case</Button></td></tr>)}</tbody></DataTable><div className={styles.mobileCards}>{caseQueue.rows.map(row=><MobileRecordCard key={row.id} title={`CASE-${row.case_no} · ${row.title}`} status={<StatusBadge tone={tone(row.status)}>{label(row.status)}</StatusBadge>} meta={`${row.beneficiary_name} · BEN-${row.registry_no} · ${row.project_title}`} rows={[{label:'Priority',value:label(row.priority)},{label:'Geography',value:row.geography_name},{label:'Next follow-up',value:row.next_followup_on||'None scheduled'},{label:'Due',value:`${row.overdue_followups} overdue · ${row.due_today_followups} today`}]} action={<Button onClick={()=>selectCase(row.id)}>Open case</Button>}/>)}</div></>}
      </Card>
    </>:<>
      <div className={styles.metricGrid}><MetricCard label="Scheduled" value={followupQueue.summary.scheduled??0}/><MetricCard label="Due today" value={followupQueue.summary.due_today??0}/><MetricCard label="Overdue" value={followupQueue.summary.overdue??0}/><MetricCard label="Completed" value={followupQueue.summary.completed??0}/></div>
      <Card className={styles.queueCard}>
        <SectionHeader title="Delegated follow-up queue" description="Due work, outcomes and next actions for follow-ups within your delegated case scope."/>
        <FilterBar actions={<Button disabled={busy||loading} onClick={refresh}>Refresh follow-ups</Button>}><Select label="View" value={followupView} onChange={e=>setFollowupView(e.target.value)} options={[{value:'scheduled',label:'Scheduled'},{value:'due_today',label:'Due today'},{value:'overdue',label:'Overdue'},{value:'upcoming',label:'Upcoming'},{value:'completed',label:'Completed'},{value:'cancelled',label:'Cancelled'},{value:'all',label:'All'}]}/></FilterBar>
        {loading&&<p className={styles.helper} role="status">Loading follow-ups…</p>}
        {!loading&&!followupQueue.rows.length&&<EmptyState>No delegated follow-ups match this view.</EmptyState>}
        {!!followupQueue.rows.length&&<><DataTable caption="My delegated follow-ups" className={styles.desktopTable}><thead><tr><th>Case / type</th><th>Beneficiary / project</th><th>Due</th><th>Outcome / next</th><th>Status</th><th>Action</th></tr></thead><tbody>{followupQueue.rows.map(item=><tr key={item.id}><td><strong>CASE-{item.case_no}</strong><span>{label(item.followup_type)}</span></td><td><strong>{item.beneficiary_name} · BEN-{item.registry_no}</strong><span>{item.project_title}</span></td><td>{item.due_on}{item.next_follow_up_on?` · next ${item.next_follow_up_on}`:''}</td><td>{item.outcome_status?label(item.outcome_status):item.next_action||'Awaiting outcome'}</td><td><StatusBadge tone={tone(item.status)}>{label(item.status)}</StatusBadge></td><td><Button onClick={()=>selectCase(item.case_id)} aria-label={`Open CASE-${item.case_no}`}>Open case</Button></td></tr>)}</tbody></DataTable><div className={styles.mobileCards}>{followupQueue.rows.map(item=><MobileRecordCard key={item.id} title={`CASE-${item.case_no} · ${label(item.followup_type)}`} status={<StatusBadge tone={tone(item.status)}>{label(item.status)}</StatusBadge>} meta={`${item.beneficiary_name} · BEN-${item.registry_no} · ${item.project_title}`} rows={[{label:'Due',value:item.due_on},{label:'Outcome',value:item.outcome_status?label(item.outcome_status):'Awaiting outcome'},{label:'Next action',value:item.next_action||'Not recorded'}]} action={<Button onClick={()=>selectCase(item.case_id)}>Open case</Button>}/>)}</div></>}
      </Card>
    </>}

    {detail&&<Card className={styles.detailCard} aria-label="Delegated case detail">
      <SectionHeader eyebrow={`CASE-${detail.case.case_no}`} title={detail.case.title} description={`${detail.person.full_name} · BEN-${detail.person.registry_no} · ${detail.project.title}`} actions={<Button onClick={()=>selectCase(null)}>Close detail</Button>}/>
      <p>{detail.case.summary}</p>
      <p><strong>{detail.case.priority} priority · {label(detail.case.status)}</strong> · {detail.geography.name} · delegated as {label(detail.assignment.owner_role)}</p>

      <h4>Assessed needs</h4>
      {!detail.needs.length&&<EmptyState>No active assessed needs are linked to this case.</EmptyState>}
      {detail.needs.map(need=><article className={styles.recordCard} key={need.id}><div className="panel-title"><strong>{need.category} · {need.priority}</strong><Badge value={need.status}/></div><p>{need.description}</p>{need.follow_up_on&&<p>Need follow-up: {need.follow_up_on}</p>}</article>)}

      <section aria-label="Delegated follow-up operations">
        <h4>Follow-up & outcomes</h4>
        {!detail.followups.length&&<EmptyState>No structured follow-up is scheduled yet.</EmptyState>}
        {detail.followups.map(f=><DelegatedFollowupCard key={f.id} followup={f} busy={busy} run={run}/>)}
        <details className={styles.disclosure}><summary>Schedule follow-up</summary>
          <form onSubmit={event=>{event.preventDefault();const formEl=event.currentTarget,form=new FormData(formEl);const payload={p_case:detail.case.id,p_need:val(form,'need')||null,p_assistance:null,p_type:val(form,'type'),p_due_on:val(form,'due_on'),p_reason:val(form,'reason')};const id=createIntentId(followupCreateIntent,payload);void run(()=>call('create_beneficiary_case_followup',{p_id:id,...payload}),'Follow-up scheduled.').then(result=>{if(result!==null){followupCreateIntent.current=null;formEl.reset()}})}}>
            <fieldset disabled={busy}><div className="form-grid">
              <label className="field">Type<select name="type" defaultValue="field_visit"><option value="phone">Phone</option><option value="field_visit">Field visit</option><option value="office_visit">Office visit</option><option value="partner_feedback">Partner feedback</option><option value="document_review">Document review</option><option value="other">Other</option></select></label>
              <label className="field">Due date<input name="due_on" type="date" required/></label>
              <label className="field">Need (optional)<select name="need"><option value="">General case follow-up</option>{detail.needs.map(n=><option key={n.id} value={n.id}>{n.category} · {n.description}</option>)}</select></label>
            </div><label className="field">Scheduling reason<textarea name="reason" required minLength={5} maxLength={2000}/></label><button className="fl-button fl-button-primary">Schedule follow-up</button></fieldset>
          </form>
        </details>
      </section>
    </Card>}
  </section>;
}

function DelegatedFollowupCard({followup,busy,run}:{followup:DetailFollowup;busy:boolean;run:(task:()=>Promise<unknown>,message:string)=>Promise<unknown>}){
  return <article className={styles.recordCard}>
    <div className="panel-title"><div><strong>{label(followup.followup_type)} · due {followup.due_on}</strong><p>{followup.last_reason}</p></div><Badge value={followup.status}/></div>
    {followup.status==='completed'&&<><p><strong>Outcome: {label(followup.outcome_status||'completed')}</strong> · {followup.observations}</p>{followup.beneficiary_feedback&&<p>Beneficiary feedback: {followup.beneficiary_feedback}</p>}<p>Next action: {followup.next_action}{followup.next_follow_up_on?` · next ${followup.next_follow_up_on}`:''}</p></>}
    {followup.status==='cancelled'&&<p>Cancelled: {followup.cancellation_reason}</p>}
    {followup.status==='scheduled'&&<details className={styles.disclosure}><summary>Complete follow-up</summary>
      <FollowupLocationCapture followup={followup} busy={busy} run={run}/>
      <form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('complete_beneficiary_case_followup',{p_id:followup.id,p_outcome:val(form,'outcome'),p_observations:val(form,'observations'),p_feedback:val(form,'feedback')||null,p_next_action:val(form,'next_action'),p_next_follow_up:val(form,'next_follow_up')||null,p_need_status:val(form,'need_status')||null,p_reason:val(form,'reason'),p_version:followup.version}),'Follow-up outcome recorded.')}}>
        <fieldset disabled={busy}><div className="form-grid"><label className="field">Outcome<select name="outcome" defaultValue="unresolved"><option value="resolved">Resolved</option><option value="partially_resolved">Partially resolved</option><option value="unresolved">Unresolved</option><option value="further_assistance_required">Further assistance required</option><option value="referred">Referred</option><option value="unable_to_verify">Unable to verify</option></select></label><label className="field">Need status (if linked)<select name="need_status"><option value="">No change</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="met">Met</option><option value="closed">Closed</option><option value="needs_review">Needs review</option></select></label><label className="field">Next follow-up<input name="next_follow_up" type="date"/></label></div><label className="field">Observations<textarea name="observations" required minLength={5} maxLength={4000}/></label><label className="field">Beneficiary feedback<textarea name="feedback" maxLength={4000}/></label><label className="field">Next action<textarea name="next_action" required minLength={3} maxLength={2000}/></label><label className="field">Completion reason<textarea name="reason" required minLength={5} maxLength={2000}/></label><button className="fl-button fl-button-primary">Record outcome</button></fieldset>
      </form>
    </details>}
    {followup.status==='scheduled'&&<form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('cancel_beneficiary_case_followup',{p_id:followup.id,p_reason:val(form,'reason'),p_version:followup.version}),'Follow-up cancelled.')}}><label className="field">Cancellation reason<input name="reason" required minLength={5} maxLength={2000}/></label><button className="fl-button fl-button-secondary" disabled={busy}>Cancel follow-up</button></form>}
  </article>;
}

function FollowupLocationCapture({followup,busy,run}:{followup:DetailFollowup;busy:boolean;run:(task:()=>Promise<unknown>,message:string)=>Promise<unknown>}){
  const [working,setWorking]=useState(false),[reason,setReason]=useState(''),[error,setError]=useState('');
  const [pending,setPending]=useState<Record<string,unknown>|null>(null);
  if(!['field_visit','office_visit'].includes(followup.followup_type))return null;
  if(followup.location_permission_state)return <div className="followup-location-evidence"><strong>Visit location evidence recorded</strong><p>{followup.location_latitude!=null&&followup.location_longitude!=null?`${Number(followup.location_latitude).toFixed(5)}, ${Number(followup.location_longitude).toFixed(5)} · ${Math.round(Number(followup.location_accuracy_m||0))} m accuracy`:followup.location_note||'Location unavailable'}{followup.location_captured_at?` · ${new Date(followup.location_captured_at).toLocaleString()}`:''}</p></div>;
  async function save(latitude:number|null,longitude:number|null,accuracy:number|null,permission:string,note:string,capturedAt:string|null){
    return submit({p_id:followup.id,p_latitude:latitude,p_longitude:longitude,p_accuracy_m:accuracy,p_permission_state:permission,p_note:note,p_captured_at:capturedAt,p_request_id:crypto.randomUUID(),p_version:followup.version});
  }
  async function submit(args:Record<string,unknown>){
    setPending(args);
    const result=await run(()=>call('record_beneficiary_case_followup_location_versioned',args),'Visit location evidence recorded.');
    if(result!==null)setPending(null);
    return result!==null;
  }
  function capture(){
    setError('');setWorking(true);
    if(!navigator.geolocation){setError('Browser location is unavailable. Record an unavailable reason instead.');setWorking(false);return}
    navigator.geolocation.getCurrentPosition(position=>{void save(position.coords.latitude,position.coords.longitude,position.coords.accuracy,'granted','',new Date(position.timestamp).toISOString()).finally(()=>setWorking(false))},failure=>{setError(failure.message+' — retry or record an unavailable reason.');setWorking(false)},{enableHighAccuracy:true,timeout:20000,maximumAge:0});
  }
  return <div className="followup-location-capture"><strong>Explicit visit location</strong><p>Optional evidence for this field/office visit only. No background tracking is used.</p><button type="button" className="fl-button fl-button-secondary" disabled={busy||working||Boolean(pending)} onClick={capture}>{working?'Locating…':'Capture current location'}</button><div className="followup-location-unavailable"><label className="field">If location is unavailable<input value={reason} minLength={5} maxLength={500} onChange={event=>setReason(event.target.value)} placeholder="Permission denied, GPS unavailable, indoor visit…"/></label><button type="button" className="fl-button fl-button-secondary" disabled={busy||working||Boolean(pending)||reason.trim().length<5} onClick={()=>{setWorking(true);setError('');void save(null,null,null,'unavailable',reason.trim(),null).finally(()=>setWorking(false))}}>Record unavailable</button></div>{pending&&<button type="button" className="fl-button fl-button-secondary" disabled={busy||working} onClick={()=>{setWorking(true);void submit(pending).finally(()=>setWorking(false));}}>Retry saved capture</button>}{error&&<p className="notice warning" role="status">{error}</p>}</div>;
}
