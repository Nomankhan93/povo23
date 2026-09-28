import {FieldLanceBrand} from "../../components/ui/FieldLanceBrand";
import {EmptyState,StatusBadge} from "../../components/ui/WorkflowOverview";
import {useCallback,useEffect,useState} from 'react';
import {db,rpc} from '../../lib/supabase/client';
import type {Project,Template,Person,Household,Response} from './model';
import {OfflineShellStatus} from './OfflineShellStatus';
import {SurveyForm} from './SurveyForm';
import {SurveySyncStatus} from './SurveySyncStatus';
import {fieldRecords,putFieldRecord,lockFieldDevice} from './offlineSurveyStore';
import {type LocalAttachment} from './fieldAttachments';
import {deviceInventory,eraseDeviceData,eraseConfirmation,cleanDeviceReceipts} from './fieldDeviceLifecycle';
import {deviceFreshness} from './deviceFreshness';
import {AttendanceWorkspace} from '../workforce/AttendanceWorkspace';
import {syncAttendanceQueue} from '../workforce/attendanceOfflineStore';
import {readAttendanceDownload,downloadAttendance,invalidateAttendanceDownload} from '../workforce/attendanceDownload';
type Bundle={project:Project;template:Template;owner_id:string;downloaded_at:string;valid_until:string;people:Person[];households:Household[];responses:Response[];geography:unknown;blocked?:string};
export function OfflineFieldWorkspace({ownerId,back,initialView='surveys',initialAssignmentId=null}:{ownerId:string;back:()=>void;initialView?:'surveys'|'attendance';initialAssignmentId?:string|null}){
 const [view,setView]=useState(initialView);
 const [attendanceRevision,setAttendanceRevision]=useState(0);
 const [,tick]=useState(0);
 useEffect(()=>{const t=window.setInterval(()=>tick(n=>n+1),30000);return()=>window.clearInterval(t)},[]);
 const [bundles,setBundles]=useState<Bundle[]>([]),[available,setAvailable]=useState<Project[]>([]),[selected,setSelected]=useState<Bundle|null>(null),[editing,setEditing]=useState<Response|null>(null),[collect,setCollect]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[online,setOnline]=useState(navigator.onLine),[inventory,setInventory]=useState<Awaited<ReturnType<typeof deviceInventory>>|null>(null),[files,setFiles]=useState<LocalAttachment[]>([]),[usage,setUsage]=useState<StorageEstimate>({});
 const refresh=useCallback(async()=>{
   const cleanupAt=window.localStorage.getItem("fieldlance-device-erasing:"+ownerId);if(cleanupAt&&Date.now()-Number(cleanupAt)<120000)return;
   try{const [b,i]=await Promise.all([fieldRecords<Bundle>(ownerId,'bundle').catch(()=>{setError('Downloaded project data is unreadable or unavailable. Existing copies are retained.');return []}),deviceInventory(ownerId)]);setBundles(b.map(r=>r.value));setInventory(i);setFiles(i.attachments.map(r=>r.value));setUsage(await navigator.storage?.estimate?.()||{})}catch(e){setInventory(null);setBundles([]);setFiles([]);setSelected(null);setError((e as Error).message)}
 },[ownerId]);
 useEffect(()=>{void refresh();const update=()=>void refresh(),connection=()=>setOnline(navigator.onLine);window.addEventListener('poem:survey-queue-change',update);window.addEventListener('fieldlance:attendance-queue-change',update);window.addEventListener('storage',update);window.addEventListener('online',connection);window.addEventListener('offline',connection);return()=>{window.removeEventListener('poem:survey-queue-change',update);window.removeEventListener('fieldlance:attendance-queue-change',update);window.removeEventListener('storage',update);window.removeEventListener('online',connection);window.removeEventListener('offline',connection)}},[refresh]);
 useEffect(()=>{
   let live=true;
   const sync=async()=>{if(!navigator.onLine)return;try{const result=await syncAttendanceQueue(ownerId,false);if(!live)return;if(result.failed)setError(result.errors.join('; '));if(result.synced){if(await readAttendanceDownload(ownerId)){try{await downloadAttendance(ownerId);}catch{await invalidateAttendanceDownload(ownerId);}}if(live){setAttendanceRevision(n=>n+1);await refresh();}}}catch(e){if(live)setError((e as Error).message)}};
   void sync();window.addEventListener('online',sync);return()=>{live=false;window.removeEventListener('online',sync)};
 },[ownerId,refresh]);
 async function action(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn();await refresh()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function findAssignments(){
   const a=await db!.from('survey_assignments').select('project_id').eq('user_id',ownerId).eq('active',true).limit(200);
   if(a.error)throw a.error;
   if(!a.data?.length){setAvailable([]);return}
   const p=await db!.from('survey_projects').select('*').in('id',a.data.map(r=>r.project_id)).order('title');if(p.error)throw p.error;setAvailable(p.data||[]);
 }
 async function download(id:string){
   try{
     const b=await rpc('download_field_project',{p_project:id}) as unknown as Bundle;
     if(b.owner_id!==ownerId||!b.template||b.template.id!==b.project.template_id)throw Error('Unexpected downloaded project owner/template');
     await putFieldRecord(ownerId,'bundle',id,b);
     if(selected?.project.id===id){setSelected(b);setCollect(false);setEditing(null)}
     setNotice('Project and reference snapshot downloaded. Existing drafts keep their original answers; review current consent when reopening.');
   }catch(e){
     if((e as {code?:string}).code==='P0001'){
       const old=bundles.find(b=>b.project.id===id);if(old)await putFieldRecord(ownerId,'bundle',id,{...old,blocked:(e as Error).message});
       if(selected?.project.id===id){setCollect(false);setSelected(null)}
     }
     throw e;
   }
 }
 async function logout(){
   if(!window.confirm('Lock this device and sign out? Unsynchronized copies will remain encrypted. Only sign back in as this owner to resume. Use Erase device data first on a shared device if you do not want copies retained.'))return;
   lockFieldDevice();await db!.auth.signOut({scope:'local'});back();
 }
 const expired=selected&&!deviceFreshness(selected.downloaded_at,selected.valid_until,selected.blocked).usable;
 return <main className="panel detail field-workspace">
   <FieldLanceBrand variant="compact"/><h1>Offline field workspace</h1><OfflineShellStatus/><p role="status"><StatusBadge tone={online?"success":"warning"}>{online?"Connected":"Offline"}</StatusBadge> {online?'Online — sync rechecks server access':'Offline — collecting against a downloaded snapshot'}</p>
   <div className="actions"><button type="button" disabled={collect||busy} onClick={back}>Main workspace</button><button type="button" disabled={collect||busy} onClick={()=>lockFieldDevice()}>Lock device</button><button type="button" disabled={collect||busy} onClick={()=>void logout()}>Lock and sign out</button></div>
   <div className="actions"><button disabled={collect||busy} onClick={()=>setView('surveys')}>Downloaded surveys</button><button disabled={collect||busy} onClick={()=>setView('attendance')}>Attendance</button></div>
   <SurveySyncStatus userId={ownerId}/>
   {view==='attendance'&&<AttendanceWorkspace key={attendanceRevision} userId={ownerId} initialAssignmentId={initialAssignmentId}/>}
   <p>Offline app files and downloaded field data are separate. Pages without downloaded data require a connection. Financial actions, case operations and basemaps are not available offline.</p>
   {error&&<p role="alert" className="notice error">{error}</p>}{notice&&<p role="status">{notice}</p>}
   <p>Device storage: {Math.round((usage.usage||0)/1048576)} MiB used{usage.quota?` of ${Math.round(usage.quota/1048576)} MiB estimated quota`:''}. Downloaded access expires after at most seven days. Remote revocation is checked when connected.</p>
   {usage.quota&&(usage.usage||0)>usage.quota*.8&&<p role="alert">Storage is above 80%. Sync and clean acknowledged copies before continuing.</p>}
   <button type="button" disabled={busy||collect} onClick={()=>void action(async()=>{const granted=await navigator.storage?.persist?.();setNotice(granted?'Persistent storage granted by browser.':'Browser did not grant persistence. Keep regular server backups and do not clear browser data before sync.')})}>Request persistent device storage</button>
   {view==='surveys'&&!collect&&<>
   <h2>Assigned project downloads</h2><button disabled={!online||busy} onClick={()=>void action(findAssignments)}>Find my assignments</button><p>Lists up to 200 assignments. Downloads include the pinned template, policy/consent, geography and up to 200 own reference people, households and editable responses per project. Use online registry search for additional records.</p>
   {available.map(p=><p key={p.id}>{p.title} <button disabled={busy||!online} onClick={()=>void action(()=>download(p.id))}>Download / refresh</button></p>)}
   <h2>On this device</h2>{!bundles.length&&<EmptyState>No projects downloaded yet. Connect and find your assignments to prepare for field work.</EmptyState>}{bundles.map(b=><article className="document-row" key={b.project.id}><strong>{b.project.title}</strong><p>Template v{b.template.version} · policy {b.project.governance_version} · {deviceFreshness(b.downloaded_at,b.valid_until,b.blocked).label}</p>{b.blocked&&<p role="alert">{b.blocked}</p>}<button disabled={busy} onClick={()=>{setSelected(b);setEditing(null);setCollect(false)}}>Open downloaded project</button><button disabled={busy||!online} onClick={()=>void action(()=>download(b.project.id))}>Refresh access and policy</button></article>)}
   {selected&&<section><h2>{selected.project.title}</h2>{expired?<p role="alert">Downloaded access expired or was denied. Existing data is retained. Reconnect and refresh before collecting.</p>:<><button onClick={()=>{setEditing(null);setCollect(true)}}>Start survey / open local draft</button>{selected.responses.map(r=><p key={r.id}>{r.status} · {r.id} <button onClick={()=>{setEditing(r);setCollect(true)}}>Open response / recovery draft</button></p>)}</>}</section>}
   </>}
   {view==='surveys'&&selected&&collect&&!expired&&<SurveyForm key={selected.project.id+':'+(editing?.id||'new')+':'+selected.downloaded_at} project={selected.project} template={selected.template} response={editing} people={selected.people} households={selected.households} userId={ownerId} busy={busy} cancel={()=>setCollect(false)} onSaved={()=>{setCollect(false);void refresh()}} onQueued={()=>{setCollect(false);void refresh()}}/>}
   <h2>Device inventory</h2><button disabled={busy} onClick={()=>void refresh()}>Refresh device status</button>
   <h2>Per-survey device status</h2>
   {inventory?.surveys.drafts.map(r=><p className="device-record" key={r.id}>Saved locally · project {r.projectId} · {r.responseId||'new survey draft'}</p>)}
   {inventory?.surveys.queue.map(r=><p className={"device-record "+(r.status==='failed'?'failed':'')} key={r.id}>{r.status} · project {r.projectId} · request {r.id.split(':').pop()} {r.error&&`— ${r.error}`}</p>)}
   {inventory?.surveys.receipts.map(r=><p className="device-record synced" key={r.id}>Synchronized · response {r.responseId} · {new Date(r.updatedAt).toLocaleString()}</p>)}
   {inventory&&!inventory.surveys.drafts.length&&!inventory.surveys.queue.length&&!inventory.surveys.receipts.length&&<EmptyState>No device surveys yet. Start from a downloaded project.</EmptyState>}
   <h2>Attendance device status</h2>
   {!inventory?.attendance.length&&<EmptyState>No attendance records on this device.</EmptyState>}
   {inventory?.attendance.map(r=><p className={'device-record '+r.status} key={r.id}>{r.status==='synced'?'Synchronized':r.status} · assignment {r.assignmentId} · {r.hasCheckout?'checkout pending':r.hasStart?'check-in pending':r.status==='synced'?'server accepted':'saved evidence'} · {new Date(r.updatedAt).toLocaleString()}{r.error&&` — ${r.error}`}</p>)}
   <button disabled={busy||!online||!inventory?.attendance.some(r=>r.status!=='synced')} onClick={()=>void action(async()=>{const result=await syncAttendanceQueue(ownerId,true);setNotice(`${result.synced} attendance records synchronized. ${result.failed} failed. ${result.errors.join('; ')}`);if(result.synced&&await readAttendanceDownload(ownerId)){try{await downloadAttendance(ownerId);}catch{await invalidateAttendanceDownload(ownerId);}}setAttendanceRevision(n=>n+1);})}>Retry / sync attendance</button>
   <h2>Device attachments</h2>{!files.length&&<EmptyState>No attachments stored on this device.</EmptyState>}{files.map(f=><p className="device-record" key={f.id}>{f.filename} · {f.state} · {f.size?Math.round(f.offset/f.size*100):0}% server-confirmed{f.error&&` — ${f.error}`}</p>)}
   <p>Sync runs while FieldLance is open, on reconnection and from Sync now. Closing the app pauses uploads; reopen to resume. Background Sync support is not required.</p>
   <div className="actions"><button disabled={busy||collect} onClick={()=>void action(async()=>{await cleanDeviceReceipts(ownerId);setNotice('Acknowledged device copies cleaned. Server records remain unchanged.')})}>Clean acknowledged copies</button><button className="danger-action" disabled={busy||collect} onClick={()=>{void action(async()=>{const current=await deviceInventory(ownerId);if(window.prompt(eraseConfirmation(current))!=='ERASE')return;await eraseDeviceData(ownerId);setSelected(null);setAttendanceRevision(n=>n+1);setNotice('Your device copies were erased. Server records are unchanged.')})}}>Erase my device data</button></div>
 </main>;
}
