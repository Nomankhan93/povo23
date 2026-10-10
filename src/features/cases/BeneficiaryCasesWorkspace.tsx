import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {Badge} from '../../shared/ui/FormFields';
import {EmptyState} from '../../components/ui/WorkflowOverview';
import {Alert,Button,Card,DataTable,FilterBar,MetricCard,MobileRecordCard,SectionHeader,Select,StatusBadge,Tabs,type SemanticTone} from '../../components/ui/FieldLanceUI';
import styles from './BeneficiaryCasesWorkspace.module.css';
import {rpc} from '../../lib/supabase/client';

type Call=(name:string,args?:Record<string,unknown>)=>Promise<unknown>;
const call=rpc as unknown as Call;
const title=(value:string)=>value.replaceAll('_',' ');
const money=(value:string|number|null)=>value===null?'—':new Intl.NumberFormat('en-PK',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value));
const val=(form:FormData,key:string)=>String(form.get(key)||'').trim();
const isoFromLocal=(form:FormData,key:string)=>{const raw=val(form,key);if(!raw)return null;const parsed=new Date(raw);if(Number.isNaN(parsed.getTime()))throw new Error('Valid distribution date/time required.');return parsed.toISOString()};
const localDateTime=(value:string|null)=>{if(!value)return '';const d=new Date(value),pad=(n:number)=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`};
const dateTime=(value:string|null)=>value?new Date(value).toLocaleString():'not scheduled';

type CreateIntent={signature:string;id:string};
type IntentRef={current:CreateIntent|null};
type OperationalView='cases'|'distribution'|'followups';
const createIntentId=(ref:IntentRef,payload:Record<string,unknown>)=>{const signature=JSON.stringify(payload);if(!ref.current||ref.current.signature!==signature)ref.current={signature,id:crypto.randomUUID()};return ref.current.id};
const tone=(value:string):SemanticTone=>['closed','completed','delivered','ready','approved','assigned'].includes(value)?'success':['high','overdue','rejected','cancelled','authority expired'].includes(value)?'danger':['submitted','scheduled','on_hold','needs_review','unassigned'].includes(value)?'warning':'neutral';

type ProjectOption={id:string;title:string;organization_id:string;organization_name:string;status:string;geography_id:string};
type PersonOption={id:string;registry_no:number;full_name:string;birth_date:string|null;household_id:string;household_label:string;open_cases:number};
type ResponseOption={id:string;version:number;created_at:string;reviewed_at:string|null;review_note:string};
type NeedOption={id:string;category:string;description:string;priority:string;status:string;follow_up_on:string|null;version:number;active_case_id:string|null};
type Intake={projects:ProjectOption[];people:PersonOption[];responses:ResponseOption[];needs:NeedOption[]};

type CaseRow={
  id:string;case_no:number;organization_id:string;organization_name:string;project_id:string;project_title:string;person_id:string;beneficiary_name:string;registry_no:number;
  title:string;summary:string;priority:string;status:string;follow_up_on:string|null;version:number;updated_at:string;
  owner_user_id:string|null;owner_name:string|null;owner_role:'field_worker'|'area_focal_person'|null;owner_eligible:boolean|null;
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


type CaseOwnerAssignment={id:string;user_id:string;name:string|null;owner_role:'field_worker'|'area_focal_person';status:string;assigned_at:string;version:number;eligible:boolean};
type CaseOwnerCandidate={user_id:string;name:string|null;owner_role:'field_worker'|'area_focal_person';scope_label:string};
type CaseOwnerEvent={id:number;event_type:string;from_user_id:string|null;from_name:string|null;from_role:string|null;to_user_id:string|null;to_name:string|null;to_role:string|null;reason:string;actor_id:string|null;recorded_at:string};
type CaseOwnership={current_assignment:CaseOwnerAssignment|null;history:CaseOwnerEvent[];candidates:CaseOwnerCandidate[]};

export function BeneficiaryCasesWorkspace({organization=null,projectId=null,initialCaseId=null,onSelectedCaseChange}:{organization?:string|null;projectId?:string|null;initialCaseId?:string|null;onSelectedCaseChange?:(caseId:string|null)=>void}){
  const [queue,setQueue]=useState<Queue>({rows:[],summary:{},limit:100});
  const [planQueue,setPlanQueue]=useState<DistributionQueue>({rows:[],summary:{},limit:100});
  const [followupQueue,setFollowupQueue]=useState<FollowupQueue>({rows:[],summary:{},utc_today:'',limit:100});
  const [baseIntake,setBaseIntake]=useState<Intake>({projects:[],people:[],responses:[],needs:[]});
  const [personIntake,setPersonIntake]=useState<Intake>({projects:[],people:[],responses:[],needs:[]});
  const [selectedProject,setSelectedProject]=useState(projectId||'');
  const [selectedPerson,setSelectedPerson]=useState('');
  const [selectedCase,setSelectedCase]=useState<string|null>(initialCaseId);
  const [detail,setDetail]=useState<CaseDetail|null>(null);
  const [ownership,setOwnership]=useState<CaseOwnership|null>(null);
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
  const [operationalView,setOperationalView]=useState<OperationalView>('cases');
  const caseCreateIntent=useRef<CreateIntent|null>(null);
  const requestCreateIntent=useRef<CreateIntent|null>(null);
  const followupCreateIntent=useRef<CreateIntent|null>(null);

  const refresh=useCallback(()=>setRevision(v=>v+1),[]);

  function selectCase(caseId:string|null){setSelectedCase(caseId);onSelectedCaseChange?.(caseId)}
  useEffect(()=>{if(initialCaseId!==selectedCase)setSelectedCase(initialCaseId)},[initialCaseId]);
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
    if(!selectedCase){setDetail(null);setOwnership(null);return}
    let live=true;
    Promise.all([
      call('beneficiary_case_detail',{p_case:selectedCase}),
      call('beneficiary_case_ownership_detail',{p_case:selectedCase}),
    ]).then(([caseResult,ownershipResult])=>{if(live){setDetail(caseResult as CaseDetail);setOwnership(ownershipResult as CaseOwnership)}}).catch(e=>{if(live){setError((e as Error).message);selectCase(null)}});
    return()=>{live=false};
  },[selectedCase,revision]);

  function createCase(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const formEl=event.currentTarget,form=new FormData(formEl);
    const payload={p_person:selectedPerson,p_response:val(form,'response'),p_need:val(form,'need')||null,p_title:val(form,'title'),p_summary:val(form,'summary'),p_priority:val(form,'priority'),p_follow_up:val(form,'follow_up')||null,p_reason:val(form,'reason')};
    const id=createIntentId(caseCreateIntent,payload);
    void run(()=>call('create_beneficiary_case',{p_id:id,...payload}),'Beneficiary case created.').then(result=>{if(result!==null){caseCreateIntent.current=null;formEl.reset();selectCase(id)}});
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

  return <section className={styles.workspace} aria-label="Beneficiary cases, assistance requests, distribution planning, delivery and follow-up">
    <SectionHeader
      eyebrow="ASSISTANCE OPERATIONS"
      title="Beneficiary cases, delivery, follow-up & outcomes"
      description="Coordinate case ownership, assessed needs, assistance requests, distribution planning and evidence-based follow-up without changing the authoritative assistance ledger."
      actions={<Button disabled={busy||loading} onClick={refresh}>Refresh operations</Button>}
    />
    <Alert title="Closure is evidence-based" tone="info">Delivered assistance remains in <code>assistance_entries</code>. Requests, plans, needs and required post-delivery follow-ups must be resolved before the server permits closure. Worker payments and project finance remain separate.</Alert>
    {error&&<Alert title="Case operations need attention" tone="danger">{error}</Alert>}{notice&&<Alert title="Case operations updated" tone="success">{notice}</Alert>}

    <div className={styles.metricGrid} aria-label="Beneficiary case summary">
      <MetricCard label="Total cases" value={queue.summary.total??0} detail={`${queue.summary.assigned??0} assigned · ${queue.summary.unassigned??0} unassigned`}/>
      <MetricCard label="Awaiting review" value={queue.summary.submitted_requests??0} detail="Submitted assistance requests"/>
      <MetricCard label="Awaiting plan" value={planQueue.summary.awaiting_plan??0} detail={`${planQueue.summary.draft??0} draft plan(s)`}/>
      <MetricCard label="Ready to deliver" value={planQueue.summary.ready_to_deliver??planQueue.summary.ready??0} detail={`${planQueue.summary.delivered??0} delivered`}/>
      <MetricCard label="Follow-ups overdue" value={followupQueue.summary.overdue??0} detail={`${followupQueue.summary.due_today??0} due today`}/>
    </div>

    <Tabs<OperationalView>
      label="Beneficiary case operational views"
      activeId={operationalView}
      onChange={setOperationalView}
      items={[{id:'cases',label:'Cases'},{id:'distribution',label:'Distribution'},{id:'followups',label:'Follow-ups'}]}
    />

    {operationalView==='cases'&&<Card className={styles.queueCard}>
      <SectionHeader title="Case queue" description="Review case priority, ownership and assistance-request state." />
      <FilterBar actions={<Button disabled={busy||loading} onClick={refresh}>Refresh cases</Button>}>
        <Select label="Status" value={status} onChange={e=>setStatus(e.target.value)} options={[{value:'',label:'All statuses'},{value:'open',label:'Open'},{value:'on_hold',label:'On hold'},{value:'closed',label:'Closed'}]}/>
        <Select label="Priority" value={priority} onChange={e=>setPriority(e.target.value)} options={[{value:'',label:'All priorities'},{value:'high',label:'High'},{value:'medium',label:'Medium'},{value:'low',label:'Low'}]}/>
      </FilterBar>
      {loading&&<p className={styles.helper} role="status">Loading beneficiary cases…</p>}
      {!loading&&!queue.rows.length&&<EmptyState>No beneficiary cases match this scope/filter.</EmptyState>}
      {!!queue.rows.length&&<><DataTable caption="Beneficiary case queue" className={styles.desktopTable}><thead><tr><th>Case</th><th>Beneficiary / project</th><th>Priority</th><th>Owner</th><th>Assistance</th><th>Status</th><th>Action</th></tr></thead><tbody>{queue.rows.map(row=><tr key={row.id}><td><strong>CASE-{row.case_no}</strong><span>{row.title}</span></td><td><strong>{row.beneficiary_name} · BEN-{row.registry_no}</strong><span>{row.project_title}</span></td><td>{title(row.priority)}</td><td>{row.owner_name?`${row.owner_name} · ${title(row.owner_role||'')}`:'Unassigned'}{row.owner_name&&row.owner_eligible===false?' · authority expired':''}</td><td>{row.active_needs} need(s) · {row.submitted_requests} review · {row.approved_requests} approved</td><td><StatusBadge tone={tone(row.status)}>{title(row.status)}</StatusBadge></td><td><Button onClick={()=>selectCase(row.id)} aria-label={`Open CASE-${row.case_no}`}>Open case</Button></td></tr>)}</tbody></DataTable><div className={styles.mobileCards}>{queue.rows.map(row=><MobileRecordCard key={row.id} title={`CASE-${row.case_no} · ${row.title}`} status={<StatusBadge tone={tone(row.status)}>{title(row.status)}</StatusBadge>} meta={`${row.beneficiary_name} · BEN-${row.registry_no} · ${row.project_title}`} rows={[{label:'Priority',value:title(row.priority)},{label:'Owner',value:row.owner_name?`${row.owner_name} · ${title(row.owner_role||'')}`:'Unassigned'},{label:'Active needs',value:row.active_needs},{label:'Awaiting review',value:row.submitted_requests}]} action={<Button onClick={()=>selectCase(row.id)}>Open case</Button>}/>)}</div></>}
    </Card>}

    {operationalView==='distribution'&&<Card className={styles.queueCard} aria-label="Distribution planning queue">
      <SectionHeader title="Distribution planning queue" description="Approved request → plan → schedule → ready → duplicate review → delivered assistance ledger." />
      <FilterBar actions={<Button disabled={busy||loading} onClick={refresh}>Refresh plans</Button>}><Select label="Plan status" value={planStatus} onChange={e=>setPlanStatus(e.target.value)} options={[{value:'',label:'All statuses'},{value:'draft',label:'Draft'},{value:'scheduled',label:'Scheduled'},{value:'ready',label:'Ready'},{value:'cancelled',label:'Cancelled'}]}/></FilterBar>
      {!loading&&!planQueue.rows.length&&<EmptyState>No distribution plans match this scope/filter.</EmptyState>}
      {!!planQueue.rows.length&&<><DataTable caption="Distribution planning queue" className={styles.desktopTable}><thead><tr><th>Plan</th><th>Beneficiary / project</th><th>Mode</th><th>Schedule</th><th>Responsible</th><th>Status</th><th>Action</th></tr></thead><tbody>{planQueue.rows.map(plan=><tr key={plan.id}><td><strong>DP-{plan.plan_no} · AR-{plan.request_no}</strong><span>{plan.program}</span></td><td><strong>{plan.beneficiary_name} · BEN-{plan.registry_no}</strong><span>{plan.project_title}</span></td><td>{title(plan.distribution_mode)} · {plan.location_label}</td><td>{dateTime(plan.scheduled_start)}{plan.scheduled_end?` → ${dateTime(plan.scheduled_end)}`:''}</td><td>{plan.responsible_party}</td><td><StatusBadge tone={tone(plan.delivery_status==='delivered'?'delivered':plan.status)}>{title(plan.delivery_status==='delivered'?'delivered':plan.status)}</StatusBadge></td><td><Button onClick={()=>selectCase(plan.case_id)} aria-label={`Open case for DP-${plan.plan_no}`}>Open case</Button></td></tr>)}</tbody></DataTable><div className={styles.mobileCards}>{planQueue.rows.map(plan=><MobileRecordCard key={plan.id} title={`DP-${plan.plan_no} · AR-${plan.request_no}`} status={<StatusBadge tone={tone(plan.delivery_status==='delivered'?'delivered':plan.status)}>{title(plan.delivery_status==='delivered'?'delivered':plan.status)}</StatusBadge>} meta={`${plan.beneficiary_name} · BEN-${plan.registry_no} · ${plan.project_title}`} rows={[{label:'Mode',value:title(plan.distribution_mode)},{label:'Location',value:plan.location_label},{label:'Schedule',value:dateTime(plan.scheduled_start)},{label:'Responsible',value:plan.responsible_party}]} action={<Button onClick={()=>selectCase(plan.case_id)}>Open case</Button>}/>)}</div></>}
    </Card>}

    {operationalView==='followups'&&<Card className={styles.queueCard} aria-label="Beneficiary follow-up queue">
      <SectionHeader title="Follow-up & outcome queue" description="Scheduled beneficiary contact, post-delivery outcome review and next-action tracking." />
      <FilterBar actions={<Button disabled={busy||loading} onClick={refresh}>Refresh follow-ups</Button>}><Select label="Follow-up status" value={followupStatus} onChange={e=>setFollowupStatus(e.target.value)} options={[{value:'',label:'All statuses'},{value:'scheduled',label:'Scheduled'},{value:'completed',label:'Completed'},{value:'cancelled',label:'Cancelled'}]}/></FilterBar>
      {!loading&&!followupQueue.rows.length&&<EmptyState>No beneficiary follow-ups match this scope/filter.</EmptyState>}
      {!!followupQueue.rows.length&&<><DataTable caption="Follow-up & outcome queue" className={styles.desktopTable}><thead><tr><th>Case / follow-up</th><th>Beneficiary / project</th><th>Due</th><th>Outcome / next action</th><th>Status</th><th>Action</th></tr></thead><tbody>{followupQueue.rows.map(item=><tr key={item.id}><td><strong>CASE-{item.case_no}</strong><span>{title(item.followup_type)}</span></td><td><strong>{item.beneficiary_name} · BEN-{item.registry_no}</strong><span>{item.project_title}</span></td><td>{item.due_on}{item.next_follow_up_on?` · next ${item.next_follow_up_on}`:''}</td><td>{item.outcome_status?title(item.outcome_status):item.next_action||'Awaiting outcome'}</td><td><StatusBadge tone={tone(item.status)}>{title(item.status)}</StatusBadge></td><td><Button onClick={()=>selectCase(item.case_id)} aria-label={`Open CASE-${item.case_no}`}>Open case</Button></td></tr>)}</tbody></DataTable><div className={styles.mobileCards}>{followupQueue.rows.map(item=><MobileRecordCard key={item.id} title={`CASE-${item.case_no} · ${title(item.followup_type)}`} status={<StatusBadge tone={tone(item.status)}>{title(item.status)}</StatusBadge>} meta={`${item.beneficiary_name} · BEN-${item.registry_no} · ${item.project_title}`} rows={[{label:'Due',value:item.due_on},{label:'Outcome',value:item.outcome_status?title(item.outcome_status):'Awaiting outcome'},{label:'Next action',value:item.next_action||'Not recorded'}]} action={<Button onClick={()=>selectCase(item.case_id)}>Open case</Button>}/>)}</div></>}
    </Card>}

    <Card className={styles.createCard}><details className={styles.disclosure} open={!queue.rows.length}>
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
          <button className="fl-button fl-button-primary">Create case</button>
        </fieldset>
      </form>
    </details></Card>

    {detail&&<Card className={styles.detailCard} aria-label="Beneficiary case detail">
      <SectionHeader eyebrow={`CASE-${detail.case.case_no}`} title={detail.case.title} description={`${detail.person.full_name} · BEN-${detail.person.registry_no} · ${detail.project.title}`} actions={<Button onClick={()=>selectCase(null)}>Close detail</Button>}/>
      <p>{detail.case.summary}</p>
      <p><strong>{detail.case.priority} priority · {title(detail.case.status)}</strong> · Follow-up {detail.case.follow_up_on||'not scheduled'} · v{detail.case.version}</p>
      <p>Last case reason: {detail.case.last_reason}</p>

      {ownership&&<section aria-label="Case ownership">
        <div className="panel-title"><div><h4>Case ownership</h4><p>Delegate this case without granting broader project, beneficiary or finance access.</p></div><Badge value={ownership.current_assignment?.eligible===false?'authority expired':ownership.current_assignment?'assigned':'unassigned'}/></div>
        {ownership.current_assignment?<article className={styles.recordCard}>
          <p><strong>{ownership.current_assignment.name||ownership.current_assignment.user_id}</strong> · {title(ownership.current_assignment.owner_role)} · assigned {new Date(ownership.current_assignment.assigned_at).toLocaleString()}</p>
          {!ownership.current_assignment.eligible&&<p className="notice error">The owner's underlying project/geography authority is no longer current. Reassign this case.</p>}
          {detail.case.status!=='closed'&&<form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('clear_beneficiary_case_owner',{p_case:detail.case.id,p_reason:val(form,'reason'),p_expected_assignment:ownership.current_assignment?.id||null,p_expected_version:ownership.current_assignment?.version??null}),'Case owner removed.')}}><label className="field">Unassignment reason<input name="reason" required minLength={5} maxLength={2000}/></label><button className="fl-button fl-button-secondary" disabled={busy}>Remove owner</button></form>}
        </article>:<p className="notice">No operational owner is assigned. Project Managers / NGO Admin can keep the case unassigned or delegate it below.</p>}
        {detail.case.status!=='closed'&&<form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget),raw=val(form,'candidate'),candidate=ownership.candidates.find(c=>`${c.owner_role}:${c.user_id}`===raw);if(!candidate){setError('Choose an eligible case owner.');return}void run(()=>call('set_beneficiary_case_owner',{p_case:detail.case.id,p_user:candidate.user_id,p_owner_role:candidate.owner_role,p_reason:val(form,'reason'),p_expected_assignment:ownership.current_assignment?.id||null,p_expected_version:ownership.current_assignment?.version??null}),ownership.current_assignment?'Case owner reassigned.':'Case owner assigned.')}}>
          <fieldset disabled={busy||!ownership.candidates.length}><label className="field">Eligible owner<select name="candidate" required defaultValue=""><option value="">Choose Field Worker or Area Focal</option>{ownership.candidates.map(c=><option key={`${c.owner_role}:${c.user_id}`} value={`${c.owner_role}:${c.user_id}`}>{c.name||c.user_id} · {title(c.owner_role)} · {c.scope_label}</option>)}</select></label><label className="field">Assignment / reassignment reason<textarea name="reason" required minLength={5} maxLength={2000}/></label><button className="fl-button fl-button-primary">{ownership.current_assignment?'Reassign case':'Assign case'}</button></fieldset>
        </form>}
        <details><summary>Ownership history ({ownership.history.length})</summary>{!ownership.history.length?<p>No ownership events yet.</p>:ownership.history.map(e=><p key={e.id}>{new Date(e.recorded_at).toLocaleString()} · {title(e.event_type)} · {e.from_name?`${e.from_name}${e.from_role?` (${title(e.from_role)})`:''} → `:''}{e.to_name?`${e.to_name}${e.to_role?` (${title(e.to_role)})`:''}`:'unassigned'} · {e.reason}</p>)}</details>
      </section>}

      {detail.case.status!=='closed'?<details className={styles.disclosure}>
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
            <button className="fl-button fl-button-primary">Save case review</button>
          </fieldset>
        </form>
      </details>:<div className="notice">
        <strong>Case closed{detail.case.closure_category?` · ${title(detail.case.closure_category)}`:''}.</strong>
        <p>{detail.case.closure_summary||detail.case.closure_reason}</p>
        <form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('reopen_beneficiary_case',{p_case:detail.case.id,p_reason:val(form,'reason'),p_version:detail.case.version}),'Beneficiary case reopened.')}}>
          <label className="field">Reopening reason<textarea name="reason" required minLength={5} maxLength={2000}/></label><button className="fl-button fl-button-primary" disabled={busy}>Reopen case</button>
        </form>
      </div>}

      <h4>Assessed needs in this case</h4>
      {!detail.needs.length&&<EmptyState>No assessed needs linked to this case yet.</EmptyState>}
      {detail.needs.map(n=><article className={styles.recordCard} key={n.id}>
        <div className="panel-title"><strong>{n.category} · {n.priority}</strong><Badge value={n.link_active?'linked':'unlinked'}/></div>
        <p>{n.description}</p><p>Need status: {title(n.status)} · {n.link_reason}</p>
        {n.link_active&&<form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('set_beneficiary_case_need',{p_case:detail.case.id,p_need:n.id,p_active:false,p_reason:val(form,'reason'),p_case_version:detail.case.version,p_link_version:n.link_version}),'Assessed need unlinked from case.')}}>
          <label className="field">Reason to unlink<input name="reason" required minLength={5} maxLength={2000}/></label><button className="fl-button fl-button-secondary" disabled={busy||detail.case.status==='closed'}>Unlink need</button>
        </form>}
      </article>)}
      {detail.case.status!=='closed'&&<details className={styles.disclosure}><summary>Link another assessed need</summary>
        <form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget),needId=val(form,'need'),need=linkableNeeds.find(n=>n.id===needId);void run(()=>call('set_beneficiary_case_need',{p_case:detail.case.id,p_need:needId,p_active:true,p_reason:val(form,'reason'),p_case_version:detail.case.version,p_link_version:need?.active_case_id===detail.case.id?(detail.needs.find(n=>n.id===needId)?.link_version||0):0}),'Assessed need linked to case.')}}>
          <fieldset disabled={busy}><label className="field">Need<select name="need" required><option value="">Choose pending need</option>{linkableNeeds.filter(n=>['open','in_progress','needs_review'].includes(n.status)&&!detail.needs.some(x=>x.id===n.id&&x.link_active)).map(n=><option value={n.id} key={n.id}>{n.category} · {n.priority} · {n.description}</option>)}</select></label><label className="field">Reason<input name="reason" required minLength={5} maxLength={2000}/></label><button className="fl-button fl-button-secondary">Link need</button></fieldset>
        </form></details>}

      <h4>Assistance requests</h4>
      {!detail.requests.length&&<EmptyState>No assistance requests recorded for this case.</EmptyState>}
      {detail.requests.map(request=><article className={styles.recordCard} key={request.id}>
        <div className="panel-title"><div><strong>AR-{request.request_no} · {request.program}</strong><p>{request.category} · {request.kind} · {request.urgency} urgency</p></div><Badge value={request.status}/></div>
        <p>{request.purpose}</p>
        <p>{request.kind==='cash'?`Requested PKR ${money(request.requested_amount_pkr)}`:`Requested ${request.requested_quantity} ${request.requested_unit}`} · Desired by {request.desired_by||'not specified'} · v{request.version}</p>
        <p>Last reason: {request.last_reason}{request.review_note?` · Review: ${request.review_note}`:''}</p>
        {request.status==='draft'&&<div className="actions">
          <form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('submit_assistance_request',{p_id:request.id,p_reason:val(form,'reason'),p_version:request.version}),'Assistance request submitted for review.')}}><label className="field">Submission reason<input name="reason" required minLength={5} maxLength={2000}/></label><button className="fl-button fl-button-primary" disabled={busy}>Submit request</button></form>
          <CancelRequest request={request} busy={busy} run={run}/>
        </div>}
        {request.status==='submitted'&&<>
          {detail.can_approve_requests?<form onSubmit={event=>reviewRequest(event,request)}><label className="field">Review note<textarea name="note" required minLength={5} maxLength={2000}/></label><div className="actions"><button className="fl-button fl-button-primary" name="decision" value="approve" disabled={busy}>Approve</button><button className="fl-button fl-button-secondary" name="decision" value="reject" disabled={busy}>Reject</button></div></form>:<p><strong>Awaiting NGO Admin / FieldLance survey approval.</strong></p>}
          <CancelRequest request={request} busy={busy} run={run}/>
        </>}
        <DistributionPlans request={request} plans={detail.distribution_plans.filter(plan=>plan.request_id===request.id)} deliveries={detail.deliveries.filter(delivery=>delivery.request_id===request.id)} busy={busy} run={run}/>
        {request.status==='approved'&&detail.can_approve_requests&&!detail.distribution_plans.some(plan=>plan.request_id===request.id&&plan.status!=='cancelled')&&<CancelRequest request={request} busy={busy} run={run}/>}
        {request.status==='approved'&&detail.can_approve_requests&&detail.distribution_plans.some(plan=>plan.request_id===request.id&&plan.status!=='cancelled')&&<p><strong>Cancel the active distribution plan before cancelling this approved request.</strong></p>}
      </article>)}

      {detail.case.status==='open'&&activeNeeds.length>0&&<details className={styles.disclosure}><summary>Create assistance request</summary>
        <p>An approved request is permission to plan support; it does not create a delivery ledger entry.</p>
        <form onSubmit={event=>{event.preventDefault();const formEl=event.currentTarget,form=new FormData(formEl);const payload={p_case:detail.case.id,p_need:val(form,'need'),p_kind:kind,p_category:val(form,'category'),p_program:val(form,'program'),p_purpose:val(form,'purpose'),p_amount:kind==='cash'?Number(val(form,'amount')):null,p_quantity:kind==='cash'?null:Number(val(form,'quantity')),p_unit:kind==='cash'?null:val(form,'unit'),p_urgency:val(form,'urgency'),p_desired_by:val(form,'desired_by')||null};const id=createIntentId(requestCreateIntent,payload);void run(()=>call('create_assistance_request',{p_id:id,...payload}),'Draft assistance request created.').then(result=>{if(result!==null){requestCreateIntent.current=null;formEl.reset()}})}}>
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
            <button className="fl-button fl-button-primary">Create draft request</button>
          </fieldset>
        </form>
      </details>}
      {detail.case.status==='open'&&!activeNeeds.length&&<p className="notice">Link at least one pending assessed need before creating an assistance request.</p>}

      <section aria-label="Follow-up and outcomes">
        <h4>Follow-up & outcomes</h4>
        {!detail.followups.length&&<EmptyState>No structured follow-up has been scheduled for this case yet.</EmptyState>}
        {detail.followups.map(followup=><FollowupCard key={followup.id} followup={followup} needs={detail.needs} busy={busy} run={run}/>)}
        {detail.case.status!=='closed'&&<details className={styles.disclosure}><summary>Schedule follow-up</summary>
          <form onSubmit={event=>{event.preventDefault();const formEl=event.currentTarget,form=new FormData(formEl);const payload={p_case:detail.case.id,p_need:val(form,'need')||null,p_assistance:val(form,'assistance')||null,p_type:val(form,'type'),p_due_on:val(form,'due_on'),p_reason:val(form,'reason')};const id=createIntentId(followupCreateIntent,payload);void run(()=>call('create_beneficiary_case_followup',{p_id:id,...payload}),'Beneficiary follow-up scheduled.').then(result=>{if(result!==null){followupCreateIntent.current=null;formEl.reset()}})}}>
            <fieldset disabled={busy}><div className="form-grid">
              <label className="field">Follow-up type<select name="type" defaultValue="phone"><option value="phone">Phone</option><option value="field_visit">Field visit</option><option value="office_visit">Office visit</option><option value="partner_feedback">Partner feedback</option><option value="document_review">Document review</option><option value="other">Other</option></select></label>
              <label className="field">Due date<input name="due_on" type="date" required/></label>
              <label className="field">Assessed need (optional)<select name="need"><option value="">General case follow-up</option>{detail.needs.filter(n=>n.link_active).map(n=><option key={n.id} value={n.id}>{n.category} · {n.description}</option>)}</select></label>
              <label className="field">Delivered assistance (optional)<select name="assistance"><option value="">No specific delivery</option>{detail.deliveries.filter(d=>d.status==='recorded').map(d=><option key={d.assistance_id} value={d.assistance_id}>{d.delivered_on} · {d.program} · {d.description}</option>)}</select></label>
            </div><label className="field">Scheduling reason<textarea name="reason" required minLength={5} maxLength={2000}/></label><button className="fl-button fl-button-primary">Schedule follow-up</button></fieldset>
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
          <details className={styles.disclosure}><summary>Close beneficiary case</summary>
            <form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('close_beneficiary_case',{p_case:detail.case.id,p_category:val(form,'category'),p_summary:val(form,'summary'),p_reason:val(form,'reason'),p_version:detail.case.version}),'Beneficiary case closed.')}}>
              <fieldset disabled={busy||!detail.closure_eligibility.can_close}><label className="field">Closure category<select name="category" defaultValue="needs_resolved"><option value="needs_resolved">Needs resolved</option><option value="referred_out">Referred out</option><option value="beneficiary_declined">Beneficiary declined</option><option value="unable_to_contact">Unable to contact</option><option value="duplicate_case">Duplicate case</option><option value="no_longer_eligible">No longer eligible</option><option value="administrative_closure">Administrative closure</option><option value="other">Other</option></select></label><label className="field">Closure summary<textarea name="summary" required minLength={10} maxLength={2000}/></label><label className="field">Closure decision reason<textarea name="reason" required minLength={5} maxLength={2000}/></label><button className="fl-button fl-button-primary">Close case</button></fieldset>
            </form>
          </details>
        </>}
      </section>

      <details><summary>Case revision history</summary>{detail.case_history.map(h=><p key={h.version}>v{h.version} · {new Date(h.recorded_at).toLocaleString()} · {h.reason}</p>)}</details>
      <details><summary>Closure / reopening history</summary>{!detail.lifecycle_history.length?<p>No closure lifecycle events yet.</p>:detail.lifecycle_history.map(e=><p key={e.id}>{new Date(e.recorded_at).toLocaleString()} · {title(e.event_type)}{e.closure_category?` · ${title(e.closure_category)}`:''} · {e.summary} · {e.reason}</p>)}</details>
    </Card>}
  </section>;
}


function FollowupCard({followup,needs,busy,run}:{followup:CaseFollowup;needs:LinkedNeed[];busy:boolean;run:(task:()=>Promise<unknown>,message:string)=>Promise<unknown>}){
  const linkedNeed=followup.need_id?needs.find(n=>n.id===followup.need_id):null;
  return <article className={styles.recordCard}>
    <div className="panel-title"><div><strong>{title(followup.followup_type)} · due {followup.due_on}</strong><p>{followup.assistance_id?'Post-delivery follow-up':'Case follow-up'}{linkedNeed?` · ${linkedNeed.category} need`:''}</p></div><Badge value={followup.status}/></div>
    {followup.status==='completed'&&<><p><strong>Outcome: {title(followup.outcome_status||'completed')}</strong> · {followup.observations}</p>{followup.beneficiary_feedback&&<p>Beneficiary feedback: {followup.beneficiary_feedback}</p>}<p>Next action: {followup.next_action}{followup.next_follow_up_on?` · next follow-up ${followup.next_follow_up_on}`:''}</p></>}
    {followup.status==='cancelled'&&<p>Cancelled: {followup.cancellation_reason}</p>}
    {followup.status==='scheduled'&&<details className={styles.disclosure}><summary>Complete follow-up & record outcome</summary>
      <form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('complete_beneficiary_case_followup',{p_id:followup.id,p_outcome:val(form,'outcome'),p_observations:val(form,'observations'),p_feedback:val(form,'feedback')||null,p_next_action:val(form,'next_action'),p_next_follow_up:val(form,'next_follow_up')||null,p_need_status:val(form,'need_status')||null,p_reason:val(form,'reason'),p_version:followup.version}),'Follow-up outcome recorded.')}}>
        <fieldset disabled={busy}><div className="form-grid"><label className="field">Outcome<select name="outcome" defaultValue="partially_resolved"><option value="resolved">Resolved</option><option value="partially_resolved">Partially resolved</option><option value="unresolved">Unresolved</option><option value="further_assistance_required">Further assistance required</option><option value="referred">Referred</option><option value="unable_to_verify">Unable to verify</option></select></label>{linkedNeed&&<label className="field">Assessed need status<select name="need_status" defaultValue=""><option value="">Keep current status</option><option value="in_progress">In progress</option><option value="met">Met</option><option value="closed">Closed</option><option value="needs_review">Needs review</option></select></label>}<label className="field">Next follow-up (optional)<input name="next_follow_up" type="date"/></label></div><label className="field">Observations<textarea name="observations" required minLength={5} maxLength={4000}/></label><label className="field">Beneficiary feedback (optional)<textarea name="feedback" maxLength={4000}/></label><label className="field">Next action<textarea name="next_action" required minLength={3} maxLength={2000}/></label><label className="field">Outcome reason<textarea name="reason" required minLength={5} maxLength={2000}/></label><button className="fl-button fl-button-primary">Complete follow-up</button></fieldset>
      </form>
    </details>}
    {followup.status==='scheduled'&&<form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('cancel_beneficiary_case_followup',{p_id:followup.id,p_reason:val(form,'reason'),p_version:followup.version}),'Follow-up cancelled.')}}><label className="field">Cancellation reason<input name="reason" required minLength={5} maxLength={2000}/></label><button className="fl-button fl-button-secondary" disabled={busy}>Cancel follow-up</button></form>}
  </article>;
}

function CancelRequest({request,busy,run}:{request:AssistanceRequest;busy:boolean;run:(task:()=>Promise<unknown>,message:string)=>Promise<unknown>}){
  return <form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('cancel_assistance_request',{p_id:request.id,p_reason:val(form,'reason'),p_version:request.version}),'Assistance request cancelled.')}}>
    <label className="field">Cancellation reason<input name="reason" required minLength={5} maxLength={2000}/></label><button className="fl-button fl-button-secondary" disabled={busy}>Cancel request</button>
  </form>;
}

function DistributionPlans({request,plans,deliveries,busy,run}:{request:AssistanceRequest;plans:DistributionPlan[];deliveries:Delivery[];busy:boolean;run:(task:()=>Promise<unknown>,message:string)=>Promise<unknown>}){
  const active=plans.find(plan=>plan.status!=='cancelled');
  const createIntent=useRef<CreateIntent|null>(null);
  return <section aria-label={`Distribution planning for AR-${request.request_no}`}>
    <h5>Distribution planning & delivery</h5>
    {!plans.length&&request.status!=='approved'&&<p>Distribution planning becomes available only after this assistance request is approved.</p>}
    {plans.map(plan=><DistributionPlanCard key={plan.id} plan={plan} deliveries={deliveries.filter(delivery=>delivery.plan_id===plan.id)} busy={busy} run={run}/>)}
    {request.status==='approved'&&!active&&<details className={styles.disclosure}><summary>Create distribution plan</summary>
      <p>This creates an operational plan only. It does not record delivery or create an assistance ledger entry.</p>
      <form onSubmit={event=>{event.preventDefault();const formEl=event.currentTarget,form=new FormData(formEl);const payload={p_request:request.id,p_mode:val(form,'mode'),p_location:val(form,'location'),p_responsible:val(form,'responsible'),p_instructions:val(form,'instructions'),p_reason:val(form,'reason')};const id=createIntentId(createIntent,payload);void run(()=>call('create_assistance_distribution_plan',{p_id:id,...payload}),'Draft distribution plan created.').then(result=>{if(result!==null){createIntent.current=null;formEl.reset()}})}}>
        <fieldset disabled={busy}>
          <div className="form-grid">
            <label className="field">Distribution mode<select name="mode" defaultValue="distribution_site"><option value="distribution_site">Distribution site</option><option value="home_delivery">Home delivery</option><option value="service_referral">Service referral</option><option value="field_visit">Field visit</option><option value="other">Other</option></select></label>
            <label className="field">Location / venue<input name="location" required minLength={2} maxLength={300}/></label>
            <label className="field">Responsible person / team<input name="responsible" required minLength={2} maxLength={160}/></label>
          </div>
          <label className="field">Instructions<textarea name="instructions" required minLength={5} maxLength={2000}/></label>
          <label className="field">Planning reason<textarea name="reason" required minLength={5} maxLength={2000}/></label>
          <button className="fl-button fl-button-primary">Create draft plan</button>
        </fieldset>
      </form>
    </details>}
  </section>;
}

function DistributionPlanCard({plan,deliveries,busy,run}:{plan:DistributionPlan;deliveries:Delivery[];busy:boolean;run:(task:()=>Promise<unknown>,message:string)=>Promise<unknown>}){
  const recorded=deliveries.find(delivery=>delivery.status==='recorded');
  const voided=deliveries.filter(delivery=>delivery.status==='void');
  return <article className={styles.recordCard}>
    <div className="panel-title"><div><strong>DP-{plan.plan_no}</strong><p>{title(plan.distribution_mode)} · {plan.location_label}</p></div><Badge value={recorded?'delivered':plan.status}/></div>
    <p>Responsible: {plan.responsible_party} · Schedule: {dateTime(plan.scheduled_start)}{plan.scheduled_end?` → ${dateTime(plan.scheduled_end)}`:''} · v{plan.version}</p>
    <p>{plan.instructions}</p><p>Last reason: {plan.last_reason}{plan.cancellation_reason?` · Cancelled: ${plan.cancellation_reason}`:''}</p>
    {recorded&&<div className="notice success"><strong>Delivered assistance recorded.</strong> {recorded.description} · {recorded.delivered_on} · {recorded.kind==='cash'?`PKR ${money(recorded.amount_pkr)}`:`${recorded.quantity} ${recorded.unit}`} · Evidence: {recorded.evidence_reference}{recorded.duplicate_override_used?' · Duplicate-control override audited.':''}</div>}
    {!!voided.length&&<details><summary>Voided delivery history ({voided.length})</summary>{voided.map(delivery=><p key={delivery.assistance_id}>{delivery.delivered_on} · {delivery.description} · voided: {delivery.void_reason||'reason recorded in ledger'}</p>)}</details>}
    {(plan.status==='draft'||plan.status==='scheduled')&&<details className={styles.disclosure}><summary>Edit plan details</summary>
      <form key={`edit-${plan.id}-${plan.version}`} onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('update_assistance_distribution_plan',{p_id:plan.id,p_mode:val(form,'mode'),p_location:val(form,'location'),p_responsible:val(form,'responsible'),p_instructions:val(form,'instructions'),p_reason:val(form,'reason'),p_version:plan.version}),'Distribution plan details updated.')}}>
        <fieldset disabled={busy}><div className="form-grid">
          <label className="field">Mode<select name="mode" defaultValue={plan.distribution_mode}><option value="distribution_site">Distribution site</option><option value="home_delivery">Home delivery</option><option value="service_referral">Service referral</option><option value="field_visit">Field visit</option><option value="other">Other</option></select></label>
          <label className="field">Location / venue<input name="location" required minLength={2} maxLength={300} defaultValue={plan.location_label}/></label>
          <label className="field">Responsible person / team<input name="responsible" required minLength={2} maxLength={160} defaultValue={plan.responsible_party}/></label>
        </div><label className="field">Instructions<textarea name="instructions" required minLength={5} maxLength={2000} defaultValue={plan.instructions}/></label><label className="field">Edit reason<textarea name="reason" required minLength={5} maxLength={2000}/></label><button className="fl-button fl-button-secondary">Save plan details</button></fieldset>
      </form>
    </details>}
    {(plan.status==='draft'||plan.status==='scheduled')&&<form key={`schedule-${plan.id}-${plan.version}`} onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('schedule_assistance_distribution_plan',{p_id:plan.id,p_start:isoFromLocal(form,'start'),p_end:isoFromLocal(form,'end'),p_reason:val(form,'reason'),p_version:plan.version}),plan.status==='draft'?'Distribution plan scheduled.':'Distribution plan rescheduled.')}}>
      <fieldset disabled={busy}><div className="form-grid"><label className="field">Start<input name="start" type="datetime-local" required defaultValue={localDateTime(plan.scheduled_start)}/></label><label className="field">End (optional)<input name="end" type="datetime-local" defaultValue={localDateTime(plan.scheduled_end)}/></label></div><label className="field">Schedule reason<input name="reason" required minLength={5} maxLength={2000}/></label><button className="fl-button fl-button-primary">{plan.status==='draft'?'Schedule plan':'Reschedule plan'}</button></fieldset>
    </form>}
    {plan.status==='scheduled'&&<form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('mark_assistance_distribution_plan_ready',{p_id:plan.id,p_reason:val(form,'reason'),p_version:plan.version}),'Distribution plan marked ready.')}}><label className="field">Readiness reason<input name="reason" required minLength={5} maxLength={2000}/></label><button className="fl-button fl-button-primary" disabled={busy}>Mark ready</button></form>}
    {plan.status==='ready'&&!recorded&&<DeliveryRecorder plan={plan} busy={busy} run={run}/>}
    {plan.status!=='cancelled'&&!recorded&&<form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(()=>call('cancel_assistance_distribution_plan',{p_id:plan.id,p_reason:val(form,'reason'),p_version:plan.version}),'Distribution plan cancelled.')}}><label className="field">Cancellation reason<input name="reason" required minLength={5} maxLength={2000}/></label><button className="fl-button fl-button-secondary" disabled={busy}>Cancel plan</button></form>}
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
  return <details className={styles.disclosure} open><summary>Record delivered assistance</summary>
    <p>2.19.2 first checks the canonical beneficiary for same-category support. Protected cross-NGO details are not disclosed; a protected blocker requires FieldLance review.</p>
    {checkError&&<p className="notice error" role="alert">{checkError}</p>}
    <form onSubmit={event=>{event.preventDefault();const formEl=event.currentTarget,form=new FormData(formEl);void run(()=>call('record_assistance_distribution_delivery',{p_plan:plan.id,p_assistance:deliveryId,p_description:val(form,'description'),p_delivered:delivered,p_funding:val(form,'funding'),p_evidence:val(form,'evidence'),p_next:val(form,'next')||null,p_duplicate_override_reason:val(form,'override')||null,p_plan_version:plan.version}),'Delivered assistance recorded in the authoritative ledger.').then(result=>{if(result!==null){formEl.reset();setDelivered(today);setPreview(null);setDeliveryId(crypto.randomUUID())}})}}>
      <fieldset disabled={busy||checking}>
        <div className="form-grid"><label className="field">Delivered on<input name="delivered" type="date" required max={today} value={delivered} onChange={e=>{setDelivered(e.target.value);setPreview(null)}}/></label><label className="field">Next eligible date (optional)<input name="next" type="date" min={delivered}/></label></div>
        <label className="field">Delivery description<textarea name="description" required minLength={3} maxLength={1000}/></label>
        <div className="form-grid"><label className="field">Funding source<input name="funding" required minLength={2} maxLength={200}/></label><label className="field">Evidence reference<input name="evidence" required minLength={3} maxLength={500}/></label></div>
        <button type="button" className="fl-button fl-button-secondary" onClick={()=>void check()} disabled={!delivered||busy||checking}>{checking?'Checking…':'Check duplicate support'}</button>
        {preview&&<div className={preview.blocking_count?'notice error':'notice success'}>
          <strong>{preview.blocking_count?`${preview.blocking_count} blocking duplicate-support signal(s).`:'No blocking duplicate-support signal found.'}</strong>
          <p>{preview.recent_count} recent same-category record(s) considered. {preview.protected_blocking_count?`${preview.protected_blocking_count} blocker(s) are protected outside your current project authority.`:''}</p>
          {!!preview.visible_matches.length&&<details><summary>Visible assistance matches</summary>{preview.visible_matches.map(match=><p key={match.assistance_id}>{match.delivered_on} · {match.organization_name} · {match.project_title} · {match.program}{match.eligibility_overlap?` · next eligible ${match.next_eligible_on}`:''}{match.exact_same_day?' · same-day amount/quantity match':''}</p>)}</details>}
          {preview.poem_review_required&&<p>FieldLance duplicate-support review is required. Protected source details remain hidden here.</p>}
        </div>}
        {preview &&
          (preview.blocking_count ?? 0) > 0 &&
          preview.can_override && (
            <label className="field">
              Duplicate-support override reason
              <textarea name="override" required minLength={10} maxLength={2000}/>
            </label>
          )}
        <button className="fl-button fl-button-primary" disabled={busy||!preview||Boolean(preview.blocking_count&&!preview.can_override)}>Record delivered assistance</button>
      </fieldset>
    </form>
  </details>;
}

