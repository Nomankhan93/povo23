import {useEffect,useMemo,useState,type FormEvent} from "react";
import {CalendarClock,CheckCircle2,Clock3,MapPin,RefreshCw,ShieldCheck,WifiOff} from "lucide-react";
import {db,rpc} from "../../lib/supabase/client";
import type {Database} from "../../lib/supabase/database.types";
import {Badge,human} from "../../shared/ui/FormFields";
import {pendingAttendance,queueAttendanceCheckout,queueAttendanceStart,syncAttendanceQueue,type AttendanceCheckoutPayload,type AttendanceStartPayload} from "./attendanceOfflineStore";

type Tables=Database["public"]["Tables"];
type Assignment=Tables["work_assignments"]["Row"];
type Policy={project_id:string;timezone:string;location_policy:"required"|"preferred"|"not_required";max_accuracy_m:number;updated_at:string;can_manage:boolean};
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
type Workspace={rows:AttendanceRow[];count:number;summary:{open:number;submitted:number;approved:number;correction_required:number;rejected:number};can_manage:boolean;page:number;from:string;to:string};
type Capture={latitude:number|null;longitude:number|null;accuracy:number|null;permission:string};
type PendingSummary={id:string;assignmentId:string;hasStart:boolean;hasCheckout:boolean;updatedAt:number};

const dateString=(d:Date)=>d.toISOString().slice(0,10);
const today=()=>dateString(new Date());
const fromDate=()=>dateString(new Date(Date.now()-29*86400000));
const duration=(minutes:number|null)=>minutes===null?"—":`${Math.floor(minutes/60)}h ${minutes%60}m`;
const networkError=(e:unknown)=>!navigator.onLine||/fetch|network|offline|connection/i.test((e as Error).message||"");
function timestamp(value:string|null){return value?new Date(value).toLocaleString():"—";}
function mapLink(lat:number|null,lng:number|null){return lat===null||lng===null?null:`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;}

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
  userId,projectId=null,canManage=false,view="attendance",initialAssignmentId=null,
}:{
  userId:string;projectId?:string|null;canManage?:boolean;view?:"attendance"|"timesheets";initialAssignmentId?:string|null;
}){
  const projectView=Boolean(projectId);
  const [workspace,setWorkspace]=useState<Workspace|null>(null),[assignments,setAssignments]=useState<Assignment[]>([]),[policy,setPolicy]=useState<Policy|null>(null),[selectedAssignment,setSelectedAssignment]=useState(initialAssignmentId||""),[selected,setSelected]=useState<AttendanceRow|null>(null),[page,setPage]=useState(0),[status,setStatus]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState(""),[locationNote,setLocationNote]=useState(""),[workNote,setWorkNote]=useState(""),[reviewNote,setReviewNote]=useState(""),[pending,setPending]=useState<PendingSummary[]>([]),[revision,setRevision]=useState(0);
  const [adjustIn,setAdjustIn]=useState(""),[adjustOut,setAdjustOut]=useState(""),[adjustReason,setAdjustReason]=useState("");
  const manageAttendance=Boolean(projectId&&canManage&&policy?.can_manage);
  const assignment=assignments.find(a=>a.id===selectedAssignment)||null;
  const openSession=workspace?.rows.find(r=>r.status==="open"&&(!selectedAssignment||r.assignment_id===selectedAssignment))||null;
  const pendingForAssignment=pending.find(p=>p.assignmentId===selectedAssignment)||null;

  async function load(){
    setLoading(true);setError("");
    try{
      const [w,p,a,q]=await Promise.all([
        (rpc as any)("attendance_workspace",{p_project:projectId,p_from:fromDate(),p_to:today(),p_status:status||null,p_page:page}) as Promise<Workspace>,
        projectId?(rpc as any)("project_attendance_policy",{p_project:projectId}) as Promise<Policy>:Promise.resolve(null),
        !projectId?db!.from("work_assignments").select("*").eq("user_id",userId).eq("status","active").order("start_date").limit(100):Promise.resolve({data:[],error:null}),
        !projectId?pendingAttendance(userId):Promise.resolve([]),
      ]);
      if((a as any).error)throw (a as any).error;
      setWorkspace(w);setPolicy(p);setAssignments(((a as any).data||[]) as Assignment[]);setPending(q);
      if(!projectId&&!selectedAssignment){const first=initialAssignmentId||(((a as any).data||[])[0]?.id||"");if(first)setSelectedAssignment(first);}
    }catch(e){setError((e as Error).message);}finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[projectId,page,status,revision]);
  useEffect(()=>{if(!projectId&&!selectedAssignment)return;const pid=projectId||assignment?.survey_project_id;if(!pid)return;void (rpc as any)("project_attendance_policy",{p_project:pid}).then((p:Policy)=>setPolicy(p)).catch((e:Error)=>setError(e.message));},[projectId,selectedAssignment,assignment?.survey_project_id]);
  useEffect(()=>{if(projectId)return;const sync=()=>{if(navigator.onLine)void syncPending();};window.addEventListener("online",sync);return()=>window.removeEventListener("online",sync);},[projectId,userId]);

  async function run(fn:()=>Promise<unknown>,message:string){setBusy(true);setError("");setNotice("");try{await fn();setNotice(message);setRevision(v=>v+1);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function syncPending(){setBusy(true);setError("");try{const result=await syncAttendanceQueue(userId);setNotice(result.failed?`${result.synced} attendance record(s) synced; ${result.failed} still need attention.`:`${result.synced} pending attendance record(s) synced.`);setRevision(v=>v+1);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}

  async function start(){
    if(!assignment||!policy)return;setBusy(true);setError("");setNotice("");
    try{
      const location=await captureLocation(policy);
      if(policy.location_policy==="required"&&location.permission!=="granted")throw Error("This project requires location permission for check-in.");
      if(policy.location_policy==="preferred"&&location.permission!=="granted"&&locationNote.trim().length<2)throw Error("Add a short reason when preferred location evidence is unavailable.");
      const args:AttendanceStartPayload={p_assignment:assignment.id,p_captured_at:new Date().toISOString(),p_latitude:location.latitude,p_longitude:location.longitude,p_accuracy_m:location.accuracy,p_permission_state:location.permission,p_location_note:locationNote.trim(),p_request:crypto.randomUUID()};
      if(!navigator.onLine){await queueAttendanceStart(userId,args);setPending(await pendingAttendance(userId));setNotice("Check-in saved encrypted on this device and will sync when online.");}
      else try{await (rpc as any)("start_assignment_work_session",args);setNotice("Field work started. Location was captured only for this explicit check-in.");setRevision(v=>v+1);}catch(e){if(!networkError(e))throw e;await queueAttendanceStart(userId,args);setPending(await pendingAttendance(userId));setNotice("Network unavailable. Check-in saved encrypted on this device for later sync.");}
      setLocationNote("");
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }

  async function finish(session:AttendanceRow|null,pendingStart=false){
    if(!policy||(!session&&!pendingStart)||workNote.trim().length<2){setError("Add a short workday note before ending field work.");return;}
    setBusy(true);setError("");setNotice("");
    try{
      const location=await captureLocation(policy);
      if(policy.location_policy==="required"&&location.permission!=="granted")throw Error("This project requires location permission for checkout.");
      if(policy.location_policy==="preferred"&&location.permission!=="granted"&&locationNote.trim().length<2)throw Error("Add a short reason when preferred location evidence is unavailable.");
      const args:AttendanceCheckoutPayload={p_session:session?.id||"",p_captured_at:new Date().toISOString(),p_latitude:location.latitude,p_longitude:location.longitude,p_accuracy_m:location.accuracy,p_permission_state:location.permission,p_location_note:locationNote.trim(),p_worker_note:workNote.trim(),p_request:crypto.randomUUID(),p_version:session?.version||1};
      if(pendingStart||!navigator.onLine){await queueAttendanceCheckout(userId,selectedAssignment,args);setPending(await pendingAttendance(userId));setNotice("Checkout and submission saved encrypted on this device and will sync when online.");}
      else try{await (rpc as any)("checkout_assignment_work_session",args);setNotice("Workday ended and submitted for review.");setRevision(v=>v+1);}catch(e){if(!networkError(e))throw e;await queueAttendanceCheckout(userId,selectedAssignment,args);setPending(await pendingAttendance(userId));setNotice("Network unavailable. Checkout saved encrypted for later sync.");}
      setWorkNote("");setLocationNote("");
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }

  async function resubmit(row:AttendanceRow){if(workNote.trim().length<2){setError("Add an updated workday note.");return;}await run(()=> (rpc as any)("resubmit_attendance_session",{p_session:row.id,p_worker_note:workNote.trim(),p_version:row.version}),"Attendance correction resubmitted.");setWorkNote("");}
  async function review(action:"approve"|"correction_required"|"reject"){if(!selected)return;if(action!=="approve"&&reviewNote.trim().length<5){setError("Add a review reason of at least 5 characters.");return;}await run(()=> (rpc as any)("review_attendance_session",{p_session:selected.id,p_action:action,p_note:reviewNote.trim(),p_version:selected.version}),action==="approve"?"Attendance approved.":action==="correction_required"?"Correction requested.":"Attendance rejected.");setSelected(null);setReviewNote("");}
  async function adjust(e:FormEvent){e.preventDefault();if(!selected)return;await run(()=> (rpc as any)("adjust_attendance_times",{p_session:selected.id,p_check_in:adjustIn,p_check_out:adjustOut,p_reason:adjustReason,p_version:selected.version}),"Effective times adjusted with immutable history.");setAdjustReason("");setSelected(null);}
  async function savePolicy(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!projectId)return;const f=new FormData(e.currentTarget);await run(()=> (rpc as any)("set_project_attendance_policy",{p_project:projectId,p_timezone:String(f.get("timezone")),p_location_policy:String(f.get("location_policy")),p_max_accuracy_m:Number(f.get("max_accuracy_m"))}),"Attendance policy updated.");}

  const activeRows=useMemo(()=>workspace?.rows||[],[workspace]);
  return <section className="attendance-workspace">
    <header className="attendance-hero">
      <div><span className="eyebrow">{projectView?"PROJECT ATTENDANCE":view==="timesheets"?"MY TIMESHEETS":"MY ATTENDANCE"}</span><h2>{projectView?(manageAttendance?"Attendance & workday review":"Attendance oversight"):view==="timesheets"?"Work session history":"Start and end field work explicitly"}</h2><p>{projectView?(manageAttendance?"Review assignment-bound work sessions. Location evidence is explicit at check-in/out only; FieldLance does not continuously track workers.":"Read-only project attendance oversight. Routine approval remains with the Organization Admin or active Project Manager."):"Check-in/out location is captured only when you explicitly use these controls. No 24/7 or background tracking is performed."}</p></div>
      <button className="secondary" disabled={busy||loading} onClick={()=>setRevision(v=>v+1)}><RefreshCw size={15}/> Refresh</button>
    </header>
    {error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="notice success" role="status">{notice}</p>}
    {!projectId&&pending.length>0&&<div className="notice warning"><WifiOff size={16}/><span>{pending.length} attendance record(s) are waiting on encrypted device sync.</span><button className="secondary" disabled={busy||!navigator.onLine} onClick={()=>void syncPending()}>Sync now</button></div>}

    {manageAttendance&&policy&&<form className="attendance-policy" onSubmit={savePolicy}><div><strong>Attendance policy</strong><p>Project timezone defines the workday. Location can be required, preferred, or not required.</p></div><label>Timezone<input name="timezone" defaultValue={policy.timezone} required/></label><label>Location<select name="location_policy" defaultValue={policy.location_policy}><option value="required">Required</option><option value="preferred">Preferred</option><option value="not_required">Not required</option></select></label><label>Accuracy warning (m)<input name="max_accuracy_m" type="number" min="5" max="5000" step="1" defaultValue={policy.max_accuracy_m}/></label><button className="secondary" disabled={busy}>Save policy</button></form>}

    {!projectId&&view==="attendance"&&<section className="attendance-checkin-panel">
      <div className="attendance-section-heading"><div><span className="eyebrow">ACTIVE ASSIGNMENT</span><h3>Today&apos;s field session</h3></div><Clock3 size={20}/></div>
      {!assignments.length&&!loading&&<p className="notice">No active formal assignment is available for attendance.</p>}
      {assignments.length>0&&<label className="field">Assignment<select value={selectedAssignment} onChange={e=>{setSelectedAssignment(e.target.value);setLocationNote("");setWorkNote("")}}>{assignments.map(a=><option key={a.id} value={a.id}>{a.project_title} · {a.organization_name}</option>)}</select></label>}
      {assignment&&policy&&<div className="attendance-assignment-card"><div><strong>{assignment.project_title}</strong><p>{assignment.organization_name} · {assignment.start_date} → {assignment.end_date} · {human(assignment.compensation_type)}</p><small>Timezone: {policy.timezone} · Location: {human(policy.location_policy)} · Accuracy warning: ±{policy.max_accuracy_m}m</small></div><Badge value={assignment.status}/></div>}
      {assignment&&policy&&!openSession&&!pendingForAssignment&&<><label className="field">Reason if location is unavailable<input value={locationNote} maxLength={500} onChange={e=>setLocationNote(e.target.value)} placeholder={policy.location_policy==="preferred"?"Required only if permission/GPS is unavailable":"Optional"}/></label><button className="primary attendance-main-action" disabled={busy} onClick={()=>void start()}><MapPin size={18}/> Start field work</button></>}
      {openSession&&<div className="attendance-live"><span className="attendance-live-dot"/><div><strong>Field session active</strong><p>Started {timestamp(openSession.check_in_captured_at)} · {openSession.check_in_quality?human(openSession.check_in_quality):"location pending"}</p></div></div>}
      {(openSession||(pendingForAssignment?.hasStart&&!pendingForAssignment.hasCheckout))&&<><label className="field">Workday note<textarea value={workNote} minLength={2} maxLength={2000} onChange={e=>setWorkNote(e.target.value)} placeholder="What work did you complete today?"/></label><label className="field">Reason if checkout location is unavailable<input value={locationNote} maxLength={500} onChange={e=>setLocationNote(e.target.value)}/></label><button className="primary attendance-main-action" disabled={busy} onClick={()=>void finish(openSession,Boolean(!openSession&&pendingForAssignment?.hasStart))}><CheckCircle2 size={18}/> End & submit workday</button></>}
      {pendingForAssignment?.hasCheckout&&<p className="notice warning">This workday is queued on this device and will be submitted when connectivity returns.</p>}
    </section>}

    <section className="attendance-ledger">
      <div className="attendance-section-heading"><div><span className="eyebrow">{projectView?"ATTENDANCE RECORDS":"TIMESHEET"}</span><h3>{projectView?"Work sessions":"Recent workdays"}</h3><p>Raw capture evidence is retained separately from any reviewed effective-time adjustment.</p></div><CalendarClock size={20}/></div>
      <div className="attendance-filters"><label>Status<select value={status} onChange={e=>{setStatus(e.target.value);setPage(0)}}><option value="">All statuses</option>{["open","submitted","approved","correction_required","rejected"].map(v=><option key={v} value={v}>{human(v)}</option>)}</select></label></div>
      {workspace&&<div className="attendance-metrics">{Object.entries(workspace.summary).map(([k,v])=><div key={k}><small>{human(k)}</small><strong>{v}</strong></div>)}</div>}
      {loading&&<p role="status">Loading attendance…</p>}
      <div className="attendance-list">{activeRows.map(row=>{
        const checkInMap=mapLink(row.check_in_latitude,row.check_in_longitude),checkOutMap=mapLink(row.check_out_latitude,row.check_out_longitude);
        return <article className={`attendance-row ${selected?.id===row.id?"selected":""}`} key={row.id}>
          <div className="attendance-row-main"><div><strong>{row.project_title}</strong><p>{projectView?row.volunteer_name:row.organization_name} · {row.work_date}</p></div><Badge value={row.status}/></div>
          <div className="attendance-time-grid"><span><small>Check in</small><strong>{timestamp(row.effective_check_in_at)}</strong></span><span><small>Check out</small><strong>{timestamp(row.effective_check_out_at)}</strong></span><span><small>Duration</small><strong>{duration(row.duration_minutes)}</strong></span><span><small>Payable</small><strong>{row.payable_unit_id?"Linked":row.compensation_type==="daily_rate"&&row.status==="approved"?"Pending link":"—"}</strong></span></div>
          <div className="attendance-location-summary"><span><MapPin size={13}/> In: {row.check_in_quality?human(row.check_in_quality):"—"}{row.check_in_accuracy_m!==null?` ±${Math.round(row.check_in_accuracy_m)}m`:""}{checkInMap&&<a href={checkInMap} target="_blank" rel="noopener noreferrer">Map</a>}</span><span><MapPin size={13}/> Out: {row.check_out_quality?human(row.check_out_quality):"—"}{row.check_out_accuracy_m!==null?` ±${Math.round(row.check_out_accuracy_m)}m`:""}{checkOutMap&&<a href={checkOutMap} target="_blank" rel="noopener noreferrer">Map</a>}</span></div>
          {row.worker_note&&<p className="attendance-note">{row.worker_note}</p>}{row.review_note&&<p className="notice">Review: {row.review_note}</p>}
          {!projectView&&row.status==="correction_required"&&<div className="attendance-correction"><label className="field">Updated workday note<textarea value={workNote} onChange={e=>setWorkNote(e.target.value)} maxLength={2000}/></label><button className="secondary" disabled={busy} onClick={()=>void resubmit(row)}>Resubmit correction</button></div>}
          {manageAttendance&&row.status==="submitted"&&<button className="secondary" onClick={()=>{setSelected(row);setReviewNote("");setAdjustIn(row.effective_check_in_at);setAdjustOut(row.effective_check_out_at||"")}}>Review attendance</button>}
        </article>;
      })}</div>
      {!loading&&!activeRows.length&&<p className="notice">No attendance records match this view.</p>}
      {workspace&&<div className="actions"><button className="secondary" disabled={page===0||busy} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page+1} · {workspace.count} records</span><button className="secondary" disabled={(page+1)*50>=workspace.count||busy} onClick={()=>setPage(p=>p+1)}>Next</button></div>}
    </section>

    {manageAttendance&&selected&&<section className="attendance-review-panel"><div className="attendance-section-heading"><div><span className="eyebrow">REVIEW ATTENDANCE</span><h3>{selected.volunteer_name} · {selected.work_date}</h3></div><ShieldCheck size={20}/></div><p>Raw captured evidence: {timestamp(selected.check_in_captured_at)} → {timestamp(selected.check_out_captured_at)}. Effective times can be adjusted before approval only; every adjustment is retained.</p><label className="field">Review note<textarea value={reviewNote} onChange={e=>setReviewNote(e.target.value)} maxLength={2000} placeholder="Required for correction or rejection"/></label><div className="actions"><button className="primary" disabled={busy} onClick={()=>void review("approve")}>Approve</button><button className="secondary" disabled={busy} onClick={()=>void review("correction_required")}>Request correction</button><button className="danger" disabled={busy} onClick={()=>void review("reject")}>Reject</button><button className="link" type="button" onClick={()=>setSelected(null)}>Close</button></div>
      <form className="attendance-adjust-form" onSubmit={adjust}><h4>Adjust effective times</h4><p>Use ISO timestamps with an explicit offset/Z. Raw captured evidence is never overwritten.</p><label>Effective check-in<input value={adjustIn} onChange={e=>setAdjustIn(e.target.value)} required/></label><label>Effective checkout<input value={adjustOut} onChange={e=>setAdjustOut(e.target.value)} required/></label><label>Reason<textarea value={adjustReason} onChange={e=>setAdjustReason(e.target.value)} minLength={5} maxLength={2000} required/></label><button className="secondary" disabled={busy}>Record adjustment</button></form>
    </section>}
  </section>;
}
