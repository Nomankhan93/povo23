import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {indexedDB} from 'fake-indexeddb';
import React from 'react';
import {create,act} from 'react-test-renderer';
const require=createRequire(import.meta.url);
function load(file,mocks,extra=""){const module={exports:{}};const code=ts.transpileModule(readFileSync(file,'utf8')+extra,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(name=>name in mocks?mocks[name]:require(name),module,module.exports);return module.exports;}
globalThis.window=new EventTarget();window.indexedDB=indexedDB;globalThis.indexedDB=indexedDB;
Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
let owner='alice',fail=false,calls=[],onRpc=null;
const mocks={'../../lib/supabase/client':{rpc:async(name,args)=>{calls.push({name,args});if(onRpc)await onRpc(name,args);if(fail)throw Error('Network unavailable');return{id:'session',version:1};}},'../surveys/offlineSurveyStore':{assertOwner:async id=>{if(id!==owner)throw Error('Owner mismatch');}}};
const store=()=>load('src/features/workforce/attendanceOfflineStore.ts',mocks);
let queue=store();
const start={p_assignment:'assignment-a',p_captured_at:new Date().toISOString(),p_latitude:null,p_longitude:null,p_accuracy_m:null,p_permission_state:'not_requested',p_location_note:'',p_request:'start-request'};
const checkout={p_session:'',p_captured_at:new Date().toISOString(),p_latitude:null,p_longitude:null,p_accuracy_m:null,p_permission_state:'not_requested',p_location_note:'',p_worker_note:'Field visit complete',p_request:'checkout-request',p_version:1};
await queue.queueAttendanceStart(owner,start);
assert.equal((await queue.pendingAttendance(owner))[0].hasStart,true);
await queue.queueAttendanceStart(owner,start);
await assert.rejects(()=>queue.queueAttendanceStart(owner,{...start,p_request:'replacement'}),/already exists/);
queue=store(); // Reload module, keep persistent database and non-extractable encryption key.
await queue.queueAttendanceCheckout(owner,start.p_assignment,checkout);
assert.equal((await queue.pendingAttendance(owner))[0].hasCheckout,true);
await assert.rejects(()=>queue.queueAttendanceCheckout(owner,start.p_assignment,{...checkout,p_request:'replacement'}),/already exists/);
await assert.rejects(()=>queue.pendingAttendance('bob'),/Owner mismatch/);
fail=true;assert.equal((await queue.syncAttendanceQueue(owner)).failed,1);assert.equal((await queue.pendingAttendance(owner)).length,1);
fail=false;assert.equal((await queue.syncAttendanceQueue(owner)).synced,1);assert.equal((await queue.pendingAttendance(owner)).length,0);
assert.deepEqual(calls.filter(c=>c.name==='start_assignment_work_session').map(c=>c.args.p_request),['start-request','start-request']);
assert.equal(calls.at(-1).args.p_session,'session');
console.log('PASS attendance first-key write, reload, checkout, ownership and stable retry');
await queue.queueAttendanceStart(owner,start);
onRpc=async name=>{if(name==='start_assignment_work_session'){onRpc=null;await queue.queueAttendanceCheckout(owner,start.p_assignment,checkout);}};
assert.equal((await queue.syncAttendanceQueue(owner)).failed,1);
assert.equal((await queue.pendingAttendance(owner))[0].hasCheckout,true);
assert.equal((await queue.syncAttendanceQueue(owner)).synced,1);
console.log('PASS concurrent checkout is retained when sync removes an older snapshot');
// Verify an unreadable row is surfaced, never silently counted as an empty queue.
await queue.queueAttendanceStart(owner,start);
const database=await new Promise((resolve,reject)=>{const r=indexedDB.open('fieldlance-attendance-offline-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
await new Promise((resolve,reject)=>{const tx=database.transaction('queue','readwrite'),st=tx.objectStore('queue'),r=st.get('alice:assignment-a');r.onsuccess=()=>st.put({...r.result,cipher:{iv:'bad',data:'bad'}});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
await assert.rejects(()=>queue.pendingAttendance(owner),/could not be decrypted/);database.close();
console.log('PASS unreadable encrypted evidence is reported');

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let rows=[],policyCalls=0,checkoutCalls=0,lateResolve=null;
const assignments=[{id:'a',survey_project_id:'p',project_title:'Project P',organization_name:'NGO',status:'active',compensation_type:'none'},{id:'b',survey_project_id:'q',project_title:'Project Q',organization_name:'NGO',status:'active',compensation_type:'none'}];
const policy=id=>({project_id:id,timezone:'UTC',location_policy:'not_required',max_accuracy_m:100,can_manage:false});
const client={db:{from:()=>{const query={select:()=>query,eq:()=>query,order:()=>query,limit:async()=>({data:assignments,error:null})};return query;}},rpc:async(name,args)=>{
  if(name==='attendance_workspace')return{rows,count:rows.length,summary:{open:rows.length},can_manage:false};
  if(name==='project_attendance_policy'){policyCalls++;if(args.p_project==='q')return new Promise(resolve=>{lateResolve=resolve;});return policy(args.p_project);}
  if(name==='start_assignment_work_session'){rows=[{id:'session',assignment_id:'a',status:'open',version:1,check_in_captured_at:start.p_captured_at,check_in_accuracy_m:null,check_out_accuracy_m:null,check_in_latitude:null,check_in_longitude:null,check_out_latitude:null,check_out_longitude:null,duration_minutes:null}];return{id:'session',version:1};}
  if(name==='checkout_assignment_work_session'){checkoutCalls++;rows=[];return{};}throw Error(name);
}};
const {AttendanceWorkspace}=load('src/features/workforce/AttendanceWorkspace.tsx',{'../../lib/supabase/client':client,'./attendanceOfflineStore':{pendingAttendance:async()=>[],syncAttendanceQueue:async()=>({synced:0,failed:0,errors:[]})},'../../shared/ui/FormFields':{Badge:()=>null,human:v=>v||''},'lucide-react':new Proxy({},{get:()=>()=>null})});
let view;await act(async()=>{view=create(React.createElement(AttendanceWorkspace,{userId:'alice'}));});
const text=node=>typeof node==='string'?node:(node?.children||[]).map(text).join('');
const button=label=>view.root.findAllByType('button').find(n=>text(n).includes(label));
assert.ok(button('Start field work'));
await act(async()=>{button('Refresh').props.onClick();});assert.ok(button('Start field work'));assert.ok(policyCalls>=2);
await act(async()=>{await button('Start field work').props.onClick();});
assert.ok(button('End & submit workday'));assert.equal(button('End & submit workday').props.disabled,false);
await act(async()=>{view.root.findByType('textarea').props.onChange({target:{value:'Completed site visit'}});});
await act(async()=>{await button('End & submit workday').props.onClick();});assert.equal(checkoutCalls,1);
console.log('PASS rendered personal attendance retains policy after refresh/start and submits checkout');
await act(async()=>{view.root.findAllByType('select')[0].props.onChange({target:{value:'b'}});});assert.equal(button('Start field work'),undefined);
await act(async()=>{view.root.findAllByType('select')[0].props.onChange({target:{value:'a'}});});
await act(async()=>{lateResolve(policy('q'));});assert.ok(button('Start field work'));
assert.match(text(view.toJSON()),/Project P/);await act(async()=>view.unmount());
console.log('PASS assignment switch discards late policy responses');

const captures=[];
const {FollowupLocationCapture}=load('src/features/cases/DelegatedCasesWorkspace.tsx',{
  '../../lib/supabase/client':{rpc:async(name,args)=>{assert.equal(name,'record_beneficiary_case_followup_location_versioned');captures.push(structuredClone(args));if(captures.length===1)throw Error('Response lost');return{id:'visit',version:4};}},
  '../../app/version':{APP_VERSION:'2.40.1'},
  '../../shared/ui/FormFields':{Badge:()=>null},
  '../../components/ui/WorkflowOverview':{EmptyState:()=>null},
},'\nexport {FollowupLocationCapture};');
await act(async()=>{view=create(React.createElement(FollowupLocationCapture,{followup:{id:'visit',version:3,followup_type:'field_visit'},busy:false,run:async task=>{try{return await task();}catch{return null;}}}));});
await act(async()=>{view.root.findByType('input').props.onChange({target:{value:'Indoor location unavailable'}});});
await act(async()=>{button('Record unavailable').props.onClick();});
assert.equal(button('Record unavailable').props.disabled,true);
assert.ok(button('Retry saved capture'));
await act(async()=>{button('Retry saved capture').props.onClick();});
assert.equal(captures.length,2);assert.deepEqual(captures[0],captures[1]);assert.equal(captures[0].p_version,3);assert.ok(captures[0].p_request_id);
assert.equal(button('Retry saved capture'),undefined);await act(async()=>view.unmount());
console.log('PASS rendered case capture retries unchanged evidence, request ID and expected version');
