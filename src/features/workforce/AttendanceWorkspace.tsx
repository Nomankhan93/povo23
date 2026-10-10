import {useEffect,useMemo,useState,type FormEvent} from "react";
import {CalendarClock,CheckCircle2,Clock3,Download,MapPin,RefreshCw,Wifi,WifiOff} from "lucide-react";
import {db,rpc} from "../../lib/supabase/client";
import type {Database} from "../../lib/supabase/database.types";
import {
  Alert,
  Button,
  Card,
  DataTable,
  Drawer,
  Field,
  FilterBar,
  MetricCard,
  SectionHeader,
  Select,
  StatusBadge,
  SyncStatus,
  Textarea,
  type SemanticTone,
} from "../../components/ui/FieldLanceUI";
import {human} from "../../shared/ui/FormFields";
import {pendingAttendance,queueAttendanceCheckout,queueAttendanceStart,syncAttendanceQueue,type AttendanceCheckoutPayload,type AttendanceStartPayload} from "./attendanceOfflineStore";
import {readAttendanceDownload,downloadAttendance,invalidateAttendanceDownload,attendanceFreshness,type AttendanceDownload} from "./attendanceDownload";
import styles from "./AttendanceWorkspace.module.css";

type Tables=Database["public"]["Tables"];
export type Assignment=Tables["work_assignments"]["Row"];
export type Policy={project_id:string;timezone:string;location_policy:"required"|"preferred"|"not_required";max_accuracy_m:number;updated_at:string;can_manage:boolean};
type AttendanceRow={
  id:string;assignment_id:string;project_id:string;organization_id:string;worker_id:string;work_date:string;timezone:string;
  location_policy_snapshot:string;max_accuracy_m_snapshot:number;check_in_captured_at:string;check_in_received_at:string;
  check_out_captured_at:string|null;check_out_received_at:string|null;effective_check_in_at:string;effective_check_out_at:string|null;
  status:string;worker_note:string;submitted_at:string|null;reviewed_by:string|null;reviewed_at:string|null;review_note:string;payable_unit_id:string|null;version:number;
  volunteer_name:string;organization_name:string;project_title:string;work_mode:string;compensation_type:string;currency:string;rate:number|null;
  assignment_start_date:string;assignment_end_date:string;duration_minutes:number|null;
  check_in_latitude:number|null;check_in_longitude:number|null;check_in_accuracy_m:number|null;check_in_permission_state:string|null;check_in_quality:string|null;check_in_location_note:string|null;
  check_out_latitude:number|null;check_out_longitude:number|null;check_out_accuracy_m:number|null;check_out_permission_state:string|null;check_out_quality:string|null;check_out_location_note:string|null;
};
export type Workspace={rows:AttendanceRow[];count:number;summary:{open:number;submitted:number;approved:number;correction_required:number;rejected:number};can_manage:boolean;page:number;from:string;to:string};
type Capture={latitude:number|null;longitude:number|null;accuracy:number|null;permission:string};
type PendingSummary={id:string;assignmentId:string;hasStart:boolean;hasCheckout:boolean;updatedAt:number};

const dateString=(d:Date)=>d.toISOString().slice(0,10);
const today=()=>dateString(new Date());
const fromDate=()=>dateString(new Date(Date.now()-29*86400000));
function dateInTimezone(d:Date,timezone:string){
  try{
    const parts=new Intl.DateTimeFormat("en-US",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
    const value=(type:"year"|"month"|"day")=>parts.find(part=>part.type===type)?.value||"";
    const year=value("year"),month=value("month"),day=value("day");
    if(year&&month&&day)return `${year}-${month}-${day}`;
  }catch{}
  return dateString(d);
}
const duration=(minutes:number|null)=>minutes===null?"—":`${Math.floor(minutes/60)}h ${minutes%60}m`;
const networkError=(e:unknown)=>!navigator.onLine||/fetch|network|offline|connection/i.test((e as Error).message||"");
function timestamp(value:string|null){return value?new Date(value).toLocaleString():"—";}
function mapLink(lat:number|null,lng:number|null){return lat===null||lng===null?null:`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;}
function statusTone(value:string):SemanticTone{
  if(value==="approved")return "success";
  if(value==="submitted"||value==="open")return "info";
  if(value==="correction_required")return "warning";
  if(value==="rejected")return "danger";
  return "neutral";
}
function locationEvidence(quality:string|null,accuracy:number|null){
  const state=quality?human(quality):"No location quality";
  return accuracy===null?state:`${state} · ±${Math.round(accuracy)}m`;
}
function payableState(row:AttendanceRow){
  return row.payable_unit_id?"Linked":row.compensation_type==="daily_rate"&&row.status==="approved"?"Pending link":"—";
}

async function captureLocation(policy:Policy):Promise<Capture>{
  if(policy.location_policy==="not_required")return{latitude:null,longitude:null,accuracy:null,permission:"not_requested"};
  if(!navigator.geolocation)return{latitude:null,longitude:null,accuracy:null,permission:"unavailable"};
  return new Promise(resolve=>navigator.geolocation.getCurrentPosition(
    p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,permission:"granted"}),
    e=>resolve({latitude:null,longitude:null,accuracy:null,permission:e.code===1?"denied":"unavailable"}),
    {enableHighAccuracy:true,timeout:12000,maximumAge:30000},
  ));
}

export function AttendanceWorkspace({
  userId,projectId=null,canManage=false,view="attendance",initialAssignmentId=null,initialSessionId=null,
}:{
  userId:string;projectId?:string|null;canManage?:boolean;view?:"attendance"|"timesheets";initialAssignmentId?:string|null;initialSessionId?:string|null;
}){
  const [download,setDownload]=useState<AttendanceDownload|null>(null),[online,setOnline]=useState(navigator.onLine);
  const [,tick]=useState(0);
  useEffect(()=>{const connection=()=>setOnline(navigator.onLine);window.addEventListener("online",connection);window.addEventListener("offline",connection);const timer=window.setInterval(()=>tick(n=>n+1),30000);return()=>{window.removeEventListener("online",connection);window.removeEventListener("offline",connection);window.clearInterval(timer);};},[]);
  const projectView=Boolean(projectId);
  const [workspace,setWorkspace]=useState<Workspace|null>(null),[assignments,setAssignments]=useState<Assignment[]>([]),[policyState,setPolicy]=useState<Policy|null>(null),[selectedAssignment,setSelectedAssignment]=useState(initialAssignmentId||""),[selected,setSelected]=useState<AttendanceRow|null>(null),[page,setPage]=useState(0),[status,setStatus]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState(""),[locationNote,setLocationNote]=useState(""),[workNote,setWorkNote]=useState(""),[reviewNote,setReviewNote]=useState(""),[pending,setPending]=useState<PendingSummary[]>([]),[revision,setRevision]=useState(0);
  const [adjustIn,setAdjustIn]=useState(""),[adjustOut,setAdjustOut]=useState(""),[adjustReason,setAdjustReason]=useState("");
  const [correctionSession,setCorrectionSession]=useState<AttendanceRow|null>(null),[correctionNote,setCorrectionNote]=useState("");
  const [linkedSession,setLinkedSession]=useState<AttendanceRow|null>(null),[linkedError,setLinkedError]=useState(""),[linkedLoading,setLinkedLoading]=useState(false);
  useEffect(()=>{
    let current=true;setLinkedSession(null);setLinkedError("");setLinkedLoading(Boolean(initialSessionId));
    if(initialSessionId){
      if(!online){setLinkedError("Connect to open this linked workday. Your pending device evidence is retained.");setLinkedLoading(false);}
      else void rpc("attendance_session_detail",{p_session:initialSessionId}).then(value=>{
        if(!current)return;
        const row=value as unknown as AttendanceRow|null;
        if(row&&row.worker_id===userId){setLinkedSession(row);}
        else setLinkedError("This workday is no longer available, or your access has changed.");
      }).catch(()=>{if(current)setLinkedError("The linked workday could not be loaded. Refresh to retry.");}).finally(()=>{if(current)setLinkedLoading(false);});
    }
    return()=>{current=false;};
  },[initialSessionId,userId,online,revision]);
  const assignment=assignments.find(a=>a.id===selectedAssignment)||null;
  const policyProject=projectId||assignment?.survey_project_id;
  const policy=policyState?.project_id===policyProject?policyState:null;
  const manageAttendance=Boolean(projectId&&canManage&&policy?.can_manage);
  const openSession=workspace?.rows.find(r=>r.status==="open"&&(!selectedAssignment||r.assignment_id===selectedAssignment))||null;
  const pendingForAssignment=pending.find(p=>p.assignmentId===selectedAssignment)||null;

  async function load(current:()=>boolean){
    setLoading(true);setError("");
    try{
      if(!projectId){
        const cached=await readAttendanceDownload(userId);if(!current())return;setDownload(cached);
        if(!navigator.onLine){
          setAssignments(cached?.assignments||[]);setWorkspace(cached?.workspace||null);setPending(await pendingAttendance(userId));
          if(!selectedAssignment&&cached?.assignments[0])setSelectedAssignment(cached.assignments[0].id);
          if(!cached)setError("Attendance is not downloaded on this device. Connect and use Download / refresh attendance.");
          return;
        }
      }
      const attendanceMode=!projectId&&view==="attendance";
      const [w,a,q]=await Promise.all([
        (rpc as any)("attendance_workspace",{p_project:projectId,p_from:fromDate(),p_to:today(),p_status:attendanceMode?null:status||null,p_page:attendanceMode?0:page}) as Promise<Workspace>,
        !projectId?db!.from("work_assignments").select("*").eq("user_id",userId).eq("status","active").order("start_date").limit(100):Promise.resolve({data:[],error:null}),
        !projectId?pendingAttendance(userId):Promise.resolve([]),
      ]);
      if(!current())return;
      if((a as any).error)throw (a as any).error;
      setWorkspace(w);setAssignments(((a as any).data||[]) as Assignment[]);setPending(q);
      if(!projectId&&!selectedAssignment){const first=initialAssignmentId||(((a as any).data||[])[0]?.id||"");if(first)setSelectedAssignment(first);}
    }catch(e){if(current())setError((e as Error).message);}finally{if(current())setLoading(false);}
  }
  useEffect(()=>{let current=true;void load(()=>current);return()=>{current=false;};},[projectId,userId,view,page,status,revision,online]);
  useEffect(()=>{
    if(projectId||view!=="attendance")return;
    setStatus("");
    setPage(0);
  },[projectId,view]);
  useEffect(()=>{
    let current=true;
    if(!policyProject){setPolicy(null);return;}
    if(!online){setPolicy(download?.policies[policyProject]||null);return;}
    void (rpc as any)("project_attendance_policy",{p_project:policyProject}).then((p:Policy)=>{if(current)setPolicy(p);}).catch((e:Error)=>{
      if(current){if(!networkError(e)||!download||!attendanceFreshness(download).usable)setPolicy(null);setError(e.message);}
    });
    return()=>{current=false;};
  },[policyProject,userId,revision,online,download]);
  useEffect(()=>{if(projectId)return;const sync=()=>{if(navigator.onLine)void syncPending(false);};window.addEventListener("online",sync);return()=>window.removeEventListener("online",sync);},[projectId,userId]);

  async function run(fn:()=>Promise<unknown>,message:string){setBusy(true);setError("");setNotice("");try{await fn();setNotice(message);setRevision(v=>v+1);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function syncPending(force=true){setBusy(true);setError("");try{const result=await syncAttendanceQueue(userId,force);if(result.synced)await refreshExistingDownload();setNotice(result.failed?`${result.synced} attendance record(s) synced; ${result.failed} still need attention. ${result.errors.join("; ")}`:`${result.synced} pending attendance record(s) synced.`);setRevision(v=>v+1);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}

  const offlineReady=Boolean(download&&download.ownerId===userId&&attendanceFreshness(download).usable);
  const freshness=download?attendanceFreshness(download):null;
  async function refreshDownload(){setBusy(true);setError("");try{setDownload(await downloadAttendance(userId));setNotice("Attendance assignments and policy downloaded for up to 24 hours. Sync always rechecks server access.");setRevision(v=>v+1);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function refreshExistingDownload(){if(download&&navigator.onLine&&await readAttendanceDownload(userId)){try{setDownload(await downloadAttendance(userId));}catch{await invalidateAttendanceDownload(userId);setError("Action saved on server, but attendance download could not be refreshed. Refresh it before going offline.");setDownload(null);}}}
  async function start(){
    if(!assignment||!policy||loading)return;
    if(!navigator.onLine&&(!download||download.ownerId!==userId||!attendanceFreshness(download).usable)){setError("Attendance download expired or is unavailable. Reconnect and refresh; pending evidence is retained.");return;}setBusy(true);setError("");setNotice("");
    try{
      const location=await captureLocation(policy);
      if(policy.location_policy==="required"&&location.permission!=="granted")throw Error("This project requires location permission for check-in.");
      if(policy.location_policy==="preferred"&&location.permission!=="granted"&&locationNote.trim().length<2)throw Error("Add a short reason when preferred location evidence is unavailable.");
      if(!navigator.onLine&&(!download||!attendanceFreshness(download).usable))throw Error("Attendance download expired during capture. Reconnect and refresh.");
      const args:AttendanceStartPayload={p_assignment:assignment.id,p_captured_at:new Date().toISOString(),p_latitude:location.latitude,p_longitude:location.longitude,p_accuracy_m:location.accuracy,p_permission_state:location.permission,p_location_note:locationNote.trim(),p_request:crypto.randomUUID()};
      if(!navigator.onLine){await queueAttendanceStart(userId,args);setPending(await pendingAttendance(userId));setNotice("Check-in saved encrypted on this device and will sync when online.");}
      else try{await (rpc as any)("start_assignment_work_session",args);setNotice("Field work started. Location was captured only for this explicit check-in.");await refreshExistingDownload();setRevision(v=>v+1);}catch(e){if(!networkError(e))throw e;await queueAttendanceStart(userId,args);setPending(await pendingAttendance(userId));setNotice("Network unavailable. Check-in saved encrypted on this device for later sync.");}
      setLocationNote("");
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }

  async function finish(session:AttendanceRow|null,pendingStart=false){
    if(!navigator.onLine&&(!download||download.ownerId!==userId||!attendanceFreshness(download).usable)){setError("Attendance download expired or is unavailable. Reconnect and refresh; pending evidence is retained.");return;}
    if(!policy||loading){setError("Attendance policy is unavailable. Refresh before ending field work.");return;}
    if((!session&&!pendingStart)||workNote.trim().length<2){setError("Add a short workday note before ending field work.");return;}
    setBusy(true);setError("");setNotice("");
    try{
      const location=await captureLocation(policy);
      if(policy.location_policy==="required"&&location.permission!=="granted")throw Error("This project requires location permission for checkout.");
      if(policy.location_policy==="preferred"&&location.permission!=="granted"&&locationNote.trim().length<2)throw Error("Add a short reason when preferred location evidence is unavailable.");
      if(!navigator.onLine&&(!download||!attendanceFreshness(download).usable))throw Error("Attendance download expired during capture. Reconnect and refresh.");
      const args:AttendanceCheckoutPayload={p_session:session?.id||"",p_captured_at:new Date().toISOString(),p_latitude:location.latitude,p_longitude:location.longitude,p_accuracy_m:location.accuracy,p_permission_state:location.permission,p_location_note:locationNote.trim(),p_worker_note:workNote.trim(),p_request:crypto.randomUUID(),p_version:session?.version||1};
      if(pendingStart||!navigator.onLine){await queueAttendanceCheckout(userId,selectedAssignment,args);setPending(await pendingAttendance(userId));setNotice("Checkout and submission saved encrypted on this device and will sync when online.");}
      else try{await (rpc as any)("checkout_assignment_work_session",args);setNotice("Workday ended and submitted for review.");await refreshExistingDownload();setRevision(v=>v+1);}catch(e){if(!networkError(e))throw e;await queueAttendanceCheckout(userId,selectedAssignment,args);setPending(await pendingAttendance(userId));setNotice("Network unavailable. Checkout saved encrypted for later sync.");}
      setWorkNote("");setLocationNote("");
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }

  async function resubmit(row:AttendanceRow){if(correctionNote.trim().length<2){setError("Add an updated workday note.");return;}await run(()=> (rpc as any)("resubmit_attendance_session",{p_session:row.id,p_worker_note:correctionNote.trim(),p_version:row.version}),"Attendance correction resubmitted.");setCorrectionNote("");setCorrectionSession(null);}
  async function review(action:"approve"|"correction_required"|"reject"){if(!selected)return;if(action!=="approve"&&reviewNote.trim().length<5){setError("Add a review reason of at least 5 characters.");return;}await run(()=> (rpc as any)("review_attendance_session",{p_session:selected.id,p_action:action,p_note:reviewNote.trim(),p_version:selected.version}),action==="approve"?"Attendance approved.":action==="correction_required"?"Correction requested.":"Attendance rejected.");setSelected(null);setReviewNote("");}
  async function adjust(e:FormEvent){e.preventDefault();if(!selected)return;await run(()=> (rpc as any)("adjust_attendance_times",{p_session:selected.id,p_check_in:adjustIn,p_check_out:adjustOut,p_reason:adjustReason,p_version:selected.version}),"Effective times adjusted with immutable history.");setAdjustReason("");setSelected(null);}
  async function savePolicy(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!projectId)return;const f=new FormData(e.currentTarget);await run(()=> (rpc as any)("set_project_attendance_policy",{p_project:projectId,p_timezone:String(f.get("timezone")),p_location_policy:String(f.get("location_policy")),p_max_accuracy_m:Number(f.get("max_accuracy_m"))}),"Attendance policy updated.");}

  function openReview(row:AttendanceRow){setSelected(row);setReviewNote("");setAdjustIn(row.effective_check_in_at);setAdjustOut(row.effective_check_out_at||"");}
  function openCorrection(row:AttendanceRow){setCorrectionSession(row);setCorrectionNote(row.worker_note||"");setError("");}
  const activeRows=useMemo(()=>workspace?.rows||[],[workspace]);
  const displayRows=useMemo(()=>linkedSession?.id===initialSessionId?[linkedSession,...activeRows.filter(row=>row.id!==initialSessionId)]:activeRows.filter(row=>row.id!==initialSessionId),[activeRows,initialSessionId,linkedSession]);
  const showFilters=projectView||view==="timesheets";
  const workerSyncState=pending.length>0?"pending":online?"synced":"offline";

  return <section className={styles.workspace} aria-labelledby="attendance-workspace-heading">
    <div className={styles.header} data-attendance-surface="header">
      <div>
        <span className="fl-eyebrow">{projectView?"PROJECT ATTENDANCE":view==="timesheets"?"MY TIMESHEETS":"MY ATTENDANCE"}</span>
        <h2 id="attendance-workspace-heading">{projectView?(manageAttendance?"Attendance & workday review":"Attendance oversight"):view==="timesheets"?"Work session history":"Today’s field work"}</h2>
        <p>{projectView?(manageAttendance?"Review assignment-bound work sessions. Location evidence is captured only at explicit check-in and checkout actions.":"Read-only project attendance oversight. Routine approval remains with the authorized Organization Admin or active Project Manager."):view==="timesheets"?"Review submitted, approved and corrected workdays without changing the underlying attendance record model.":"Start and end field work explicitly. FieldLance does not continuously or silently track your location."}</p>
      </div>
      <Button type="button" disabled={busy||loading} onClick={()=>setRevision(v=>v+1)}><RefreshCw size={16}/> Refresh</Button>
    </div>

    {error&&<Alert tone="danger" title="Attendance action needs attention">{error}</Alert>}
    {notice&&<Alert tone="success" title="Attendance updated">{notice}</Alert>}

    {!projectId&&<Card className={styles.syncCard} data-attendance-surface="readiness">
      <div className={styles.syncHeading}>
        <div><span className="fl-eyebrow">FIELD READINESS</span><strong>Attendance on this device</strong></div>
        <div className={styles.statusCluster}>
          <StatusBadge tone={online?"success":"warning"}>{online?<><Wifi size={14}/> Online</>:<><WifiOff size={14}/> Offline</>}</StatusBadge>
          <SyncStatus state={workerSyncState} pending={pending.length}/>
          <StatusBadge tone={offlineReady?"success":download?"warning":"neutral"}>{download?(freshness?.label||"Downloaded"):"Download missing"}</StatusBadge>
        </div>
      </div>
      <p>Download stores up to 100 active assignments, attendance policy and open work sessions for up to 24 hours. Offline evidence stays encrypted and pending until the server accepts it.</p>
      <div className={styles.syncActions}>
        <Button type="button" disabled={busy||!online} onClick={()=>void refreshDownload()}><Download size={16}/> Download / refresh attendance</Button>
        {pending.length>0&&<Button type="button" variant="secondary" disabled={busy||!online} onClick={()=>void syncPending()}>Sync {pending.length} pending record{pending.length===1?"":"s"}</Button>}
      </div>
    </Card>}

    {manageAttendance&&policy&&<Card>
      <form className={styles.policyForm} onSubmit={savePolicy}>
        <SectionHeader eyebrow="PROJECT POLICY" title="Attendance policy" description="Project timezone defines the workday. Location can be required, preferred, or not required; saving keeps the existing backend policy semantics." />
        <div className={styles.policyFields}>
          <Field label="Timezone"><input name="timezone" defaultValue={policy.timezone} required/></Field>
          <Select label="Location policy" name="location_policy" defaultValue={policy.location_policy}>
            <option value="required">Required</option><option value="preferred">Preferred</option><option value="not_required">Not required</option>
          </Select>
          <Field label="Accuracy warning (m)"><input name="max_accuracy_m" type="number" min="5" max="5000" step="1" defaultValue={policy.max_accuracy_m}/></Field>
        </div>
        <div className={styles.formActions}><Button type="submit" disabled={busy}>Save policy</Button></div>
      </form>
    </Card>}

    {!projectId&&view==="attendance"&&<Card className={styles.currentWorkCard}>
      <SectionHeader eyebrow="ACTIVE ASSIGNMENT" title="Current workday" description="Choose the assignment you are working on, confirm the field-readiness state, then use the single primary attendance action." actions={<Clock3 size={20} aria-hidden="true"/>}/>
      {!assignments.length&&!loading&&<Alert tone="neutral" title="No active assignment">No active formal assignment is available for attendance.</Alert>}
      {assignments.length>0&&<Select label="Assignment" value={selectedAssignment} onChange={e=>{setSelectedAssignment(e.target.value);setLocationNote("");setWorkNote("")}}>{assignments.map(a=><option key={a.id} value={a.id}>{a.project_title} · {a.organization_name}</option>)}</Select>}
      {assignment&&policy&&<div className={styles.assignmentSummary}>
        <div className={styles.assignmentIdentity}><span>{assignment.organization_name}</span><strong>{assignment.project_title}</strong><p>{assignment.start_date} → {assignment.end_date} · {human(assignment.compensation_type)}</p></div>
        <StatusBadge tone={openSession||pendingForAssignment?.hasStart?"success":"info"}>{openSession?"Checked in":pendingForAssignment?.hasCheckout?"Queued to submit":pendingForAssignment?.hasStart?"Check-in pending sync":"Ready to start"}</StatusBadge>
        <dl className={styles.assignmentFacts}>
          <div><dt>Work date</dt><dd>{dateInTimezone(new Date(),policy.timezone)}</dd></div>
          <div><dt>Timezone</dt><dd>{policy.timezone}</dd></div>
          <div><dt>Location</dt><dd>{human(policy.location_policy)}</dd></div>
          <div><dt>Accuracy warning</dt><dd>±{policy.max_accuracy_m}m</dd></div>
        </dl>
      </div>}
      {openSession&&<div className={styles.activeSession} role="status"><span className={styles.liveDot} aria-hidden="true"/><div><strong>Field session active</strong><p>Started {timestamp(openSession.check_in_captured_at)} · {locationEvidence(openSession.check_in_quality,openSession.check_in_accuracy_m)}</p></div></div>}
      {pendingForAssignment?.hasStart&&!openSession&&!pendingForAssignment.hasCheckout&&<Alert tone="warning" title="Check-in saved locally">Your encrypted check-in is waiting for server sync. You can still end the workday from this downloaded attendance state.</Alert>}
      {pendingForAssignment?.hasCheckout&&<Alert tone="warning" title="Workday waiting to sync">Checkout and submission are queued on this device and will be submitted when connectivity returns.</Alert>}
      {assignment&&policy&&!openSession&&!pendingForAssignment&&<div className={styles.actionStack}>
        <Field label="Reason if location is unavailable" hint={policy.location_policy==="preferred"?"Required only when preferred location permission/GPS is unavailable.":"Optional unless the current policy requires an explanation."}><input value={locationNote} maxLength={500} onChange={e=>setLocationNote(e.target.value)} placeholder="Add a short reason if needed"/></Field>
        <Button className={styles.primaryAction} type="button" variant="primary" disabled={busy||loading||!policy||(!online&&!offlineReady)} onClick={()=>void start()}><MapPin size={18}/> Start field work</Button>
      </div>}
      {(openSession||(pendingForAssignment?.hasStart&&!pendingForAssignment.hasCheckout))&&<div className={styles.actionStack}>
        <Textarea label="Workday note" value={workNote} minLength={2} maxLength={2000} onChange={e=>setWorkNote(e.target.value)} placeholder="What work did you complete today?"/>
        <Field label="Reason if checkout location is unavailable"><input value={locationNote} maxLength={500} onChange={e=>setLocationNote(e.target.value)} placeholder="Add a short reason if needed"/></Field>
        <Button className={styles.primaryAction} type="button" variant="primary" disabled={busy||loading||!policy||(!online&&!offlineReady)} onClick={()=>void finish(openSession,Boolean(!openSession&&pendingForAssignment?.hasStart))}><CheckCircle2 size={18}/> End & submit workday</Button>
      </div>}
    </Card>}

    <section className={styles.historySection}>
      <SectionHeader eyebrow={projectView?"ATTENDANCE RECORDS":view==="timesheets"?"TIMESHEET HISTORY":"RECENT WORKDAYS"} title={projectView?"Work sessions":view==="timesheets"?"My Timesheets":"Recent workdays"} description="Effective times are shown for operations; raw captured timestamps remain separately retained for review and audit." actions={<CalendarClock size={20} aria-hidden="true"/>}/>

      {workspace&&<div className={styles.metrics} aria-label="Attendance summary">
        {projectView&&<MetricCard label="Open" value={workspace.summary.open}/>}<MetricCard label="Submitted" value={workspace.summary.submitted}/><MetricCard label="Approved" value={workspace.summary.approved}/><MetricCard label="Needs correction" value={workspace.summary.correction_required}/><MetricCard label="Rejected" value={workspace.summary.rejected}/>
      </div>}

      {showFilters&&<FilterBar className={styles.filters}>
        <Select label="Status" value={status} onChange={e=>{setStatus(e.target.value);setPage(0)}}>
          <option value="">All statuses</option>{["open","submitted","approved","correction_required","rejected"].map(v=><option key={v} value={v}>{human(v)}</option>)}
        </Select>
      </FilterBar>}

      {loading&&<p role="status" className={styles.loading}>Loading attendance…</p>}
      {linkedLoading&&<p role="status" className={styles.loading}>Loading linked workday…</p>}
      {linkedError&&<Alert tone="danger" title="Linked workday unavailable">{linkedError}</Alert>}

      {!loading&&displayRows.length>0&&<>
        <div className={styles.desktopRecords}>
          <DataTable caption={projectView?"Authorized project attendance records":"Your attendance workdays"}>
            <thead><tr><th>{projectView?"Worker / project":"Project"}</th><th>Status</th><th>Work date</th><th>Check in</th><th>Check out</th><th>Duration</th><th>Payable</th><th>Location</th><th>Action</th></tr></thead>
            <tbody>{displayRows.map(row=><tr key={row.id} className={initialSessionId===row.id?styles.routeFocusedRow:undefined}>
              <td><strong className={styles.tablePrimary}>{projectView?row.volunteer_name:row.project_title}</strong><span className={styles.tableSecondary}>{projectView?row.project_title:row.organization_name}{initialSessionId===row.id?" · Linked workday":""}</span></td>
              <td><StatusBadge tone={statusTone(row.status)}>{human(row.status)}</StatusBadge></td><td>{row.work_date}</td><td>{timestamp(row.effective_check_in_at)}</td><td>{timestamp(row.effective_check_out_at)}</td><td>{duration(row.duration_minutes)}</td><td>{payableState(row)}</td>
              <td><span className={styles.locationCell}>In: {locationEvidence(row.check_in_quality,row.check_in_accuracy_m)}<br/>Out: {locationEvidence(row.check_out_quality,row.check_out_accuracy_m)}</span></td>
              <td>{manageAttendance&&row.status==="submitted"?<Button type="button" onClick={()=>openReview(row)}>Review</Button>:!projectView&&row.status==="correction_required"?<Button type="button" onClick={()=>openCorrection(row)}>Review correction</Button>:<span className={styles.muted}>—</span>}</td>
            </tr>)}</tbody>
          </DataTable>
        </div>

        <div className={styles.mobileRecords}>{displayRows.map(row=>{
          const checkInMap=mapLink(row.check_in_latitude,row.check_in_longitude),checkOutMap=mapLink(row.check_out_latitude,row.check_out_longitude);
          return <article id={`attendance-${row.id}`} className={`${styles.recordCard} ${initialSessionId===row.id?styles.routeFocus:""}`} key={row.id}>
            {initialSessionId===row.id&&<StatusBadge tone="info">Linked workday · exact record</StatusBadge>}
            <div className={styles.recordHeading}><div><span>{projectView?row.volunteer_name:row.organization_name}</span><strong>{row.project_title}</strong><p>{row.work_date}</p></div><StatusBadge tone={statusTone(row.status)}>{human(row.status)}</StatusBadge></div>
            <dl className={styles.recordFacts}><div><dt>Check in</dt><dd>{timestamp(row.effective_check_in_at)}</dd></div><div><dt>Check out</dt><dd>{timestamp(row.effective_check_out_at)}</dd></div><div><dt>Duration</dt><dd>{duration(row.duration_minutes)}</dd></div><div><dt>Payable</dt><dd>{payableState(row)}</dd></div></dl>
            <div className={styles.locationGrid}><span><MapPin size={15} aria-hidden="true"/> Check-in: {locationEvidence(row.check_in_quality,row.check_in_accuracy_m)} {checkInMap&&<a href={checkInMap} target="_blank" rel="noopener noreferrer">Map</a>}</span><span><MapPin size={15} aria-hidden="true"/> Checkout: {locationEvidence(row.check_out_quality,row.check_out_accuracy_m)} {checkOutMap&&<a href={checkOutMap} target="_blank" rel="noopener noreferrer">Map</a>}</span></div>
            {row.worker_note&&<div className={styles.note}><strong>Workday note</strong><p>{row.worker_note}</p></div>}
            {row.review_note&&<Alert tone={row.status==="rejected"?"danger":row.status==="correction_required"?"warning":"info"} title="Review note">{row.review_note}</Alert>}
            {!projectView&&row.status==="correction_required"&&<Button type="button" disabled={busy} onClick={()=>openCorrection(row)}>Review correction</Button>}
            {manageAttendance&&row.status==="submitted"&&<Button type="button" onClick={()=>openReview(row)}>Review attendance</Button>}
          </article>;
        })}</div>
      </>}

      {!loading&&!displayRows.length&&<Alert tone="neutral" title="No workdays in this view">No attendance records match the current view.</Alert>}
      {workspace&&(projectView||view==="timesheets")&&<div className={styles.pagination}><Button type="button" disabled={page===0||busy} onClick={()=>setPage(p=>p-1)}>Previous</Button><span>Page {page+1} · {workspace.count} records</span><Button type="button" disabled={(page+1)*50>=workspace.count||busy} onClick={()=>setPage(p=>p+1)}>Next</Button></div>}
    </section>

    <Drawer open={Boolean(!projectView&&correctionSession)} title={correctionSession?`Correct workday · ${correctionSession.work_date}`:"Correct workday"} onClose={()=>{setCorrectionSession(null);setCorrectionNote("")}} side="right" className={styles.reviewDrawer}>
      {correctionSession&&<div className={styles.reviewContent}>
        <div className={styles.reviewHeading}><StatusBadge tone="warning">Needs correction</StatusBadge><span>{correctionSession.project_title}</span></div>
        <section className={styles.reviewSection} aria-labelledby="worker-correction-context-heading"><h3 id="worker-correction-context-heading">Reviewer feedback</h3>{correctionSession.review_note?<Alert tone="warning" title="Review note">{correctionSession.review_note}</Alert>:<p className={styles.helper}>No reviewer note was provided. Update your workday note and resubmit the existing attendance record.</p>}<div className={styles.note}><strong>Previous workday note</strong><p>{correctionSession.worker_note||"No previous workday note."}</p></div></section>
        <section className={styles.reviewSection} aria-labelledby="worker-correction-action-heading"><h3 id="worker-correction-action-heading">Update and resubmit</h3><Textarea label="Updated workday note" value={correctionNote} onChange={e=>setCorrectionNote(e.target.value)} minLength={2} maxLength={2000} required/><Button type="button" variant="primary" disabled={busy} onClick={()=>void resubmit(correctionSession)}>Resubmit correction</Button></section>
      </div>}
    </Drawer>

    <Drawer open={Boolean(manageAttendance&&selected)} title={selected?`${selected.volunteer_name} · ${selected.work_date}`:"Attendance review"} onClose={()=>setSelected(null)} side="right" className={styles.reviewDrawer}>
      {selected&&<div className={styles.reviewContent}>
        <div className={styles.reviewHeading}><StatusBadge tone={statusTone(selected.status)}>{human(selected.status)}</StatusBadge><span>{selected.project_title}</span></div>
        <section className={styles.reviewSection} aria-labelledby="review-evidence-heading"><h3 id="review-evidence-heading">Workday evidence</h3><dl className={styles.reviewFacts}><div><dt>Raw check-in</dt><dd>{timestamp(selected.check_in_captured_at)}</dd></div><div><dt>Raw checkout</dt><dd>{timestamp(selected.check_out_captured_at)}</dd></div><div><dt>Effective check-in</dt><dd>{timestamp(selected.effective_check_in_at)}</dd></div><div><dt>Effective checkout</dt><dd>{timestamp(selected.effective_check_out_at)}</dd></div><div><dt>Check-in location</dt><dd>{locationEvidence(selected.check_in_quality,selected.check_in_accuracy_m)}</dd></div><div><dt>Checkout location</dt><dd>{locationEvidence(selected.check_out_quality,selected.check_out_accuracy_m)}</dd></div><div><dt>Payable</dt><dd>{payableState(selected)}</dd></div><div><dt>Duration</dt><dd>{duration(selected.duration_minutes)}</dd></div></dl>{selected.worker_note&&<div className={styles.note}><strong>Worker note</strong><p>{selected.worker_note}</p></div>}</section>
        <section className={styles.reviewSection} aria-labelledby="review-action-heading"><h3 id="review-action-heading">Review decision</h3><Textarea label="Review note" value={reviewNote} onChange={e=>setReviewNote(e.target.value)} maxLength={2000} hint="Required for correction requests and rejection." placeholder="Add a clear review note"/><div className={styles.reviewActions}><Button type="button" variant="primary" disabled={busy} onClick={()=>void review("approve")}>Approve</Button><Button type="button" disabled={busy} onClick={()=>void review("correction_required")}>Request correction</Button><Button type="button" variant="danger" disabled={busy} onClick={()=>void review("reject")}>Reject</Button></div></section>
        <form className={styles.reviewSection} onSubmit={adjust}><h3>Adjust effective times</h3><p className={styles.helper}>Use ISO timestamps with an explicit offset/Z. Raw captured evidence is never overwritten; adjustment history remains immutable.</p><Field label="Effective check-in"><input value={adjustIn} onChange={e=>setAdjustIn(e.target.value)} required/></Field><Field label="Effective checkout"><input value={adjustOut} onChange={e=>setAdjustOut(e.target.value)} required/></Field><Textarea label="Reason" value={adjustReason} onChange={e=>setAdjustReason(e.target.value)} minLength={5} maxLength={2000} required/><Button type="submit" disabled={busy}>Record adjustment</Button></form>
      </div>}
    </Drawer>
  </section>;
}
