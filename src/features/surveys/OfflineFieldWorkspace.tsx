import {useCallback,useEffect,useState} from 'react';
import {FieldLanceBrand} from '../../components/ui/FieldLanceBrand';
import {
  Alert,
  Button,
  Card,
  DataTable,
  Dialog,
  Field,
  MetricCard,
  MobileRecordCard,
  PageHeader,
  SectionHeader,
  StatusBadge,
  Tabs,
  ConfirmDialog,
} from '../../components/ui/FieldLanceUI';
import {EmptyState} from '../../components/ui/WorkflowOverview';
import {db,rpc} from '../../lib/supabase/client';
import {reportDiagnostic,userFacingError} from '../../lib/observability';
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
import styles from './OfflineFieldWorkspace.module.css';

type Bundle={project:Project;template:Template;owner_id:string;downloaded_at:string;valid_until:string;people:Person[];households:Household[];responses:Response[];geography:unknown;blocked?:string};
type View='surveys'|'attendance'|'device';
type Inventory=Awaited<ReturnType<typeof deviceInventory>>;

const views:readonly {id:View;label:string}[]=[
  {id:'surveys',label:'Surveys'},
  {id:'attendance',label:'Attendance'},
  {id:'device',label:'Device'},
];

function storageLabel(bytes:number){return `${Math.round(bytes/1048576)} MiB`;}
function freshnessTone(usable:boolean):'success'|'warning'{return usable?'success':'warning';}

export function OfflineFieldWorkspace({ownerId,back,initialView='surveys',initialAssignmentId=null,initialSessionId=null}:{ownerId:string;back:()=>void;initialView?:'surveys'|'attendance';initialAssignmentId?:string|null;initialSessionId?:string|null}){
 const [view,setView]=useState<View>(initialView);
 const [attendanceRevision,setAttendanceRevision]=useState(0);
 const [,tick]=useState(0);
 useEffect(()=>{const t=window.setInterval(()=>tick(n=>n+1),30000);return()=>window.clearInterval(t)},[]);
 const [bundles,setBundles]=useState<Bundle[]>([]),[available,setAvailable]=useState<Project[]>([]),[selected,setSelected]=useState<Bundle|null>(null),[editing,setEditing]=useState<Response|null>(null),[collect,setCollect]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[online,setOnline]=useState(navigator.onLine),[inventory,setInventory]=useState<Inventory|null>(null),[files,setFiles]=useState<LocalAttachment[]>([]),[usage,setUsage]=useState<StorageEstimate>({});
 const [logoutOpen,setLogoutOpen]=useState(false),[eraseOpen,setEraseOpen]=useState(false),[eraseText,setEraseText]=useState(''),[eraseSnapshot,setEraseSnapshot]=useState<Inventory|null>(null);

 const refresh=useCallback(async()=>{
   const cleanupAt=window.localStorage.getItem('fieldlance-device-erasing:'+ownerId);if(cleanupAt&&Date.now()-Number(cleanupAt)<120000)return;
   try{const [b,i]=await Promise.all([fieldRecords<Bundle>(ownerId,'bundle').catch((e)=>{reportDiagnostic('offline',e,{operation:'read_downloaded_bundles',online:navigator.onLine});setError('Downloaded project data is unreadable or unavailable. Existing copies are retained.');return []}),deviceInventory(ownerId)]);setBundles(b.map(r=>r.value));setInventory(i);setFiles(i.attachments.map(r=>r.value));setUsage(await navigator.storage?.estimate?.()||{})}catch(e){reportDiagnostic('offline',e,{operation:'device_inventory',online:navigator.onLine});setInventory(null);setBundles([]);setFiles([]);setSelected(null);setError(userFacingError(e,'Device data could not be inspected. Existing encrypted copies are retained.'))}
 },[ownerId]);
 useEffect(()=>{void refresh();const update=()=>void refresh(),connection=()=>setOnline(navigator.onLine);window.addEventListener('poem:survey-queue-change',update);window.addEventListener('fieldlance:attendance-queue-change',update);window.addEventListener('storage',update);window.addEventListener('online',connection);window.addEventListener('offline',connection);return()=>{window.removeEventListener('poem:survey-queue-change',update);window.removeEventListener('fieldlance:attendance-queue-change',update);window.removeEventListener('storage',update);window.removeEventListener('online',connection);window.removeEventListener('offline',connection)}},[refresh]);
 useEffect(()=>{
   let live=true;
   const sync=async()=>{if(!navigator.onLine)return;try{const result=await syncAttendanceQueue(ownerId,false);if(!live)return;if(result.failed){reportDiagnostic('offline',new Error('Attendance sync reported failed records'),{operation:'attendance_auto_sync',status:'failed',online:true});setError(result.errors.join('; '));}if(result.synced){if(await readAttendanceDownload(ownerId)){try{await downloadAttendance(ownerId);}catch{await invalidateAttendanceDownload(ownerId);}}if(live){setAttendanceRevision(n=>n+1);await refresh();}}}catch(e){reportDiagnostic('offline',e,{operation:'attendance_auto_sync',online:navigator.onLine});if(live)setError(userFacingError(e,'Attendance sync could not finish. Your device copy remains available for retry.'))}};
   void sync();window.addEventListener('online',sync);return()=>{live=false;window.removeEventListener('online',sync)};
 },[ownerId,refresh]);

 async function action(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn();await refresh()}catch(e){reportDiagnostic('offline',e,{operation:'offline_action',online:navigator.onLine});setError(userFacingError(e,'This offline field action could not be completed. Your existing device data is unchanged.'))}finally{setBusy(false)}}
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
   setLogoutOpen(false);setBusy(true);setError('');
   try{lockFieldDevice();await db!.auth.signOut({scope:'local'});back();}
   catch(e){reportDiagnostic('offline',e,{operation:'offline_sign_out',online:navigator.onLine});setError(userFacingError(e,'This device could not be signed out. Your encrypted field copies remain on this device.'));}
   finally{setBusy(false)}
 }
 async function prepareErase(){
   setBusy(true);setError('');
   try{const current=await deviceInventory(ownerId);setEraseSnapshot(current);setEraseText('');setEraseOpen(true);}
   catch(e){reportDiagnostic('offline',e,{operation:'inspect_before_erase',online:navigator.onLine});setError(userFacingError(e,'Device data could not be inspected, so erase was not started.'));}
   finally{setBusy(false)}
 }
 async function confirmErase(){
   if(eraseText!=='ERASE'||!eraseSnapshot)return;
   setEraseOpen(false);
   await action(async()=>{await eraseDeviceData(ownerId);setSelected(null);setCollect(false);setEditing(null);setAttendanceRevision(n=>n+1);setNotice('Your device copies were erased. Server records are unchanged.');});
 }

 const expired=selected&&!deviceFreshness(selected.downloaded_at,selected.valid_until,selected.blocked).usable;
 const unsyncedTotal=inventory?Object.values(inventory.unsynced).reduce((total,value)=>total+value,0):0;
 const storagePercent=usage.quota?Math.round(((usage.usage||0)/usage.quota)*100):null;

 return <section className={styles.workspace} aria-labelledby="offline-field-title">
   <div className={styles.brand}><FieldLanceBrand variant="compact"/></div>
   <PageHeader id="offline-field-title" eyebrow="FIELD WORKSPACE" title="Offline & mobile field work" description="Prepare survey and attendance data before leaving connectivity, collect against downloaded snapshots, and manage encrypted device copies without widening offline authority." actions={<div className={styles.headerActions}><Button type="button" disabled={collect||busy} onClick={back}>Main workspace</Button><Button type="button" disabled={collect||busy} onClick={()=>lockFieldDevice()}>Lock device</Button><Button type="button" variant="tertiary" disabled={collect||busy} onClick={()=>setLogoutOpen(true)}>Lock & sign out</Button></div>}/>

   <div className={styles.metricGrid}>
     <MetricCard label="Connectivity" value={online?'Connected':'Offline'} detail={online?'Server access can be rechecked':'Offline — collecting against a downloaded snapshot'}/>
     <MetricCard label="Downloaded projects" value={bundles.length} detail="Encrypted on this device"/>
     <MetricCard label="Unsynchronized copies" value={unsyncedTotal} detail="Surveys, attendance and attachments"/>
     <MetricCard label="Device storage" value={storageLabel(usage.usage||0)} detail={storagePercent===null?'Browser quota unavailable':`${storagePercent}% of estimated quota`}/>
   </div>

   <Card className={styles.readinessCard}>
     <SectionHeader title="Field readiness" description="Offline app files and downloaded operational data are separate. Pages without downloaded data require connectivity." actions={<StatusBadge tone={online?'success':'warning'}>{online?'Connected':'Offline'}</StatusBadge>}/>
     <OfflineShellStatus/>
     <SurveySyncStatus userId={ownerId}/>
     <p className={styles.boundary}>Financial actions, case operations and basemaps are not available offline. Sync runs while FieldLance is open, on reconnection and from explicit sync actions; Background Sync support is not required.</p>
   </Card>

   {error&&<Alert tone="danger" title="Field workspace action failed">{error}</Alert>}
   {notice&&<Alert tone="success" title="Field workspace updated">{notice}</Alert>}
   {usage.quota&&(usage.usage||0)>usage.quota*.8&&<Alert tone="warning" title="Device storage above 80%">Sync and clean acknowledged copies before continuing field work.</Alert>}

   <Tabs items={views.map(item=>({...item,disabled:collect||busy}))} activeId={view} onChange={setView} label="Offline field sections"/>

   {view==='surveys'&&!collect&&<>
     <Card className={styles.sectionCard}>
       <SectionHeader title="Assigned project downloads" description="Lists up to 200 active assignments. Downloads include the pinned template, policy/consent, geography and up to 200 of your reference people, households and editable responses per project." actions={<Button type="button" variant="primary" disabled={!online||busy} onClick={()=>void action(findAssignments)}>Find my assignments</Button>}/>
       {!available.length?<EmptyState>Connect and find assignments when you need to prepare or refresh project data.</EmptyState>:<>
         <div className={styles.desktopTable}><DataTable caption="Available survey project downloads"><thead><tr><th>Project</th><th>Availability</th><th>Action</th></tr></thead><tbody>{available.map(p=><tr key={p.id}><td><strong>{p.title}</strong></td><td>{online?'Ready to download':'Connect to download'}</td><td><Button type="button" disabled={busy||!online} onClick={()=>void action(()=>download(p.id))}>Download / refresh</Button></td></tr>)}</tbody></DataTable></div>
         <div className={styles.mobileCards}>{available.map(p=><MobileRecordCard key={p.id} title={p.title} status={<StatusBadge tone={online?'success':'warning'}>{online?'Online':'Offline'}</StatusBadge>} rows={[{label:'Access',value:online?'Ready to download':'Connect to download'}]} action={<Button type="button" disabled={busy||!online} onClick={()=>void action(()=>download(p.id))}>Download / refresh</Button>}/>)}</div>
       </>}
     </Card>

     <Card className={styles.sectionCard}>
       <SectionHeader title="On this device" description="Downloaded access expires after at most seven days. Remote revocation is checked whenever connectivity is available."/>
       {!bundles.length?<EmptyState>No projects downloaded yet. Connect and find your assignments to prepare for field work.</EmptyState>:<>
         <div className={styles.desktopTable}><DataTable caption="Downloaded survey projects"><thead><tr><th>Project</th><th>Template / policy</th><th>Access freshness</th><th>Actions</th></tr></thead><tbody>{bundles.map(b=>{const fresh=deviceFreshness(b.downloaded_at,b.valid_until,b.blocked);return <tr key={b.project.id}><td><strong>{b.project.title}</strong>{b.blocked&&<span className={styles.dangerText}>{b.blocked}</span>}</td><td>Template v{b.template.version} · policy {b.project.governance_version}</td><td><StatusBadge tone={freshnessTone(fresh.usable)}>{fresh.usable?'Usable':'Refresh required'}</StatusBadge><span>{fresh.label}</span></td><td><div className={styles.rowActions}><Button type="button" disabled={busy} onClick={()=>{setSelected(b);setEditing(null);setCollect(false)}}>Open project</Button><Button type="button" disabled={busy||!online} onClick={()=>void action(()=>download(b.project.id))}>Refresh access</Button></div></td></tr>})}</tbody></DataTable></div>
         <div className={styles.mobileCards}>{bundles.map(b=>{const fresh=deviceFreshness(b.downloaded_at,b.valid_until,b.blocked);return <MobileRecordCard key={b.project.id} title={b.project.title} status={<StatusBadge tone={freshnessTone(fresh.usable)}>{fresh.usable?'Usable':'Refresh required'}</StatusBadge>} meta={b.blocked||fresh.label} rows={[{label:'Template',value:`v${b.template.version}`},{label:'Policy',value:String(b.project.governance_version)}]} action={<div className={styles.rowActions}><Button type="button" disabled={busy} onClick={()=>{setSelected(b);setEditing(null);setCollect(false)}}>Open project</Button><Button type="button" disabled={busy||!online} onClick={()=>void action(()=>download(b.project.id))}>Refresh access</Button></div>}/>})}</div>
       </>}
     </Card>

     {selected&&<Card className={styles.sectionCard}>
       <SectionHeader eyebrow="SELECTED PROJECT" title={selected.project.title} description={`Template v${selected.template.version} · policy ${selected.project.governance_version}`}/>
       {expired?<Alert tone="warning" title="Downloaded access cannot be used for collection">Existing data is retained. Reconnect and refresh access before collecting.</Alert>:<>
         <div className={styles.rowActions}><Button variant="primary" type="button" onClick={()=>{setEditing(null);setCollect(true)}}>Start survey / open local draft</Button></div>
         {selected.responses.length?<div className={styles.responseList}>{selected.responses.map(r=><MobileRecordCard key={r.id} title={r.id} status={<StatusBadge>{r.status}</StatusBadge>} action={<Button type="button" onClick={()=>{setEditing(r);setCollect(true)}}>Open response / recovery draft</Button>}/>)}</div>:<p className={styles.helper}>No downloaded editable responses for this project. New collection can still use a local draft.</p>}
       </>}
     </Card>}
   </>}

   {view==='surveys'&&selected&&collect&&!expired&&<Card className={styles.collectionCard}><SurveyForm key={selected.project.id+':'+(editing?.id||'new')+':'+selected.downloaded_at} project={selected.project} template={selected.template} response={editing} people={selected.people} households={selected.households} userId={ownerId} busy={busy} cancel={()=>setCollect(false)} onSaved={()=>{setCollect(false);void refresh()}} onQueued={()=>{setCollect(false);void refresh()}}/></Card>}

   {view==='attendance'&&<Card className={styles.embeddedWorkspace}><AttendanceWorkspace key={attendanceRevision} userId={ownerId} initialAssignmentId={initialAssignmentId} initialSessionId={initialSessionId}/></Card>}

   {view==='device'&&<>
     <Card className={styles.sectionCard}>
       <SectionHeader title="Device storage & lifecycle" description="Encrypted field copies belong to this signed-in account on this browser. Device cleanup never deletes server records." actions={<Button type="button" disabled={busy} onClick={()=>void refresh()}>Refresh device status</Button>}/>
       <p className={styles.helper}>Device storage: {storageLabel(usage.usage||0)} used{usage.quota?` of ${storageLabel(usage.quota)} estimated quota`:''}. Downloaded access expires after at most seven days; remote revocation is checked when connected.</p>
       <div className={styles.rowActions}><Button type="button" disabled={busy||collect} onClick={()=>void action(async()=>{const granted=await navigator.storage?.persist?.();setNotice(granted?'Persistent storage granted by browser.':'Browser did not grant persistence. Keep regular server backups and do not clear browser data before sync.')})}>Request persistent storage</Button><Button type="button" disabled={busy||collect} onClick={()=>void action(async()=>{await cleanDeviceReceipts(ownerId);setNotice('Acknowledged device copies cleaned. Server records remain unchanged.')})}>Clean acknowledged copies</Button><Button type="button" variant="danger" disabled={busy||collect} onClick={()=>void prepareErase()}>Erase my device data</Button></div>
     </Card>

     <div className={styles.deviceGrid}>
       <Card className={styles.inventoryCard}><SectionHeader title="Survey copies" description="Drafts, queued requests and synchronized receipts on this device."/>{inventory?.surveys.drafts.map(r=><div className={styles.deviceRecord} key={r.id}><StatusBadge tone="neutral">Saved locally</StatusBadge><span>Project {r.projectId} · {r.responseId||'new survey draft'}</span></div>)}{inventory?.surveys.queue.map(r=><div className={styles.deviceRecord} key={r.id}><StatusBadge tone={r.status==='failed'?'danger':'warning'}>{r.status}</StatusBadge><span>Project {r.projectId} · request {r.id.split(':').pop()}{r.error&&` · ${r.error}`}</span></div>)}{inventory?.surveys.receipts.map(r=><div className={styles.deviceRecord} key={r.id}><StatusBadge tone="success">Synchronized</StatusBadge><span>Response {r.responseId} · {new Date(r.updatedAt).toLocaleString()}</span></div>)}{inventory&&!inventory.surveys.drafts.length&&!inventory.surveys.queue.length&&!inventory.surveys.receipts.length&&<EmptyState>No device surveys yet. Start from a downloaded project.</EmptyState>}</Card>

       <Card className={styles.inventoryCard}><SectionHeader title="Attendance copies" description="Saved evidence remains retryable until the server acknowledges it."/>{!inventory?.attendance.length&&<EmptyState>No attendance records on this device.</EmptyState>}{inventory?.attendance.map(r=><div className={styles.deviceRecord} key={r.id}><StatusBadge tone={r.status==='synced'?'success':r.status==='failed'?'danger':'warning'}>{r.status==='synced'?'Synchronized':r.status}</StatusBadge><span>Assignment {r.assignmentId} · {r.hasCheckout?'checkout pending':r.hasStart?'check-in pending':r.status==='synced'?'server accepted':'saved evidence'} · {new Date(r.updatedAt).toLocaleString()}{r.error&&` · ${r.error}`}</span></div>)}<Button type="button" disabled={busy||!online||!inventory?.attendance.some(r=>r.status!=='synced')} onClick={()=>void action(async()=>{const result=await syncAttendanceQueue(ownerId,true);setNotice(`${result.synced} attendance records synchronized. ${result.failed} failed. ${result.errors.join('; ')}`);if(result.synced&&await readAttendanceDownload(ownerId)){try{await downloadAttendance(ownerId);}catch{await invalidateAttendanceDownload(ownerId);}}setAttendanceRevision(n=>n+1);})}>Retry / sync attendance</Button></Card>

       <Card className={styles.inventoryCard}><SectionHeader title="Attachments" description="Uploads resume from server-confirmed offsets while FieldLance remains open."/>{!files.length&&<EmptyState>No attachments stored on this device.</EmptyState>}{files.map(f=><div className={styles.deviceRecord} key={f.id}><StatusBadge tone={f.state==='uploaded'?'success':f.state==='failed'?'danger':'warning'}>{f.state}</StatusBadge><span>{f.filename} · {f.size?Math.round(f.offset/f.size*100):0}% server-confirmed{f.error&&` · ${f.error}`}</span></div>)}</Card>
     </div>
   </>}

   <ConfirmDialog open={logoutOpen} title="Lock device and sign out?" description="Unsynchronized copies remain encrypted for this account. Sign back in as the same owner to resume. On a shared device, erase device data first if you do not want local copies retained." confirmLabel="Lock & sign out" busy={busy} onCancel={()=>setLogoutOpen(false)} onConfirm={logout}/>
   <Dialog open={eraseOpen} title="Erase device data" description={eraseSnapshot?eraseConfirmation(eraseSnapshot):'Inspecting device data…'} onClose={()=>{if(!busy){setEraseOpen(false);setEraseText('')}}} actions={<><Button type="button" disabled={busy} onClick={()=>{setEraseOpen(false);setEraseText('')}}>Cancel</Button><Button type="button" variant="danger" disabled={busy||eraseText!=='ERASE'} onClick={()=>void confirmErase()}>Erase device data</Button></>}>
     <Alert tone="danger" title="This only erases device copies">Server records remain unchanged. Close other FieldLance field tabs before confirming.</Alert>
     <Field label="Type ERASE to confirm"><input className="fl-control" autoComplete="off" value={eraseText} onChange={event=>setEraseText(event.target.value)} /></Field>
   </Dialog>
 </section>;
}
