import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {create,act} from 'react-test-renderer';
const require=createRequire(import.meta.url);
function load(file,mocks={}){const module={exports:{}};const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(name=>name in mocks?mocks[name]:require(name),module,module.exports);return module.exports;}
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.window=new EventTarget();Object.assign(window,{setTimeout,clearTimeout,setInterval,clearInterval});
Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
const Null=()=>null,icons=new Proxy({},{get:()=>Null});
const {routePath,parseAppRoute}=load('src/app/routes.ts');
let sourceVisible=true;
const calls=[];
const query={select(){return this},eq(){return this},maybeSingle:async()=>({data:sourceVisible?{id:'source'}:null,error:null})};
const action=load('src/features/notifications/notificationAction.ts',{'../../lib/supabase/client':{db:{from:()=>query},rpc:async(name,args)=>{calls.push({name,args});return sourceVisible?{id:args.p_session}:null;}}});
const context={mode:'personal',currentScope:'personal'};
for(const [kind,page,expected] of [['work_application','My Applications','/app/work/applications/source'],['work_assignment','My Assigned Surveys','/app/work/assignments/source'],['attendance','My Attendance','/app/work/assignments/source/attendance'],['attendance_session','My Attendance','/app/field/attendance/source'],['survey_response','Survey projects','/app/field/projects/project/responses/source'],['beneficiary_case','My Cases','/app/field/cases/source'],['operational_task','Task Center','/app/tasks/source']]){
 const target=action.notificationActionTarget({source_kind:kind,source_ref:'source',project_id:'project',action_page:page},context);
 assert.equal(routePath(target),expected);assert.equal(parseAppRoute(expected).entityId,'source');
}
assert.equal(action.notificationActionTarget({source_kind:null,source_ref:null,action_page:'My Applications'},context).page,'My Applications');
for(const [mode,currentScope] of [['organization','org'],['project','project:project'],['staff','poem']]){
 const target=action.notificationActionTarget({source_kind:'operational_task',source_ref:'source',project_id:'project',organization_id:'org',action_page:'Task Center'},{mode,currentScope,organizationId:'org',projectId:'project'});
 const parsed=parseAppRoute(routePath(target));assert.equal(parsed.entityId,'source');assert.equal(parsed.scopeHint,currentScope);
}
let caseError=Object.assign(new Error('Assigned beneficiary case access required'),{code:'P0001'});
const deniedCase=load('src/features/notifications/notificationAction.ts',{'../../lib/supabase/client':{db:null,rpc:async()=>{throw caseError}}});
assert.equal(await deniedCase.notificationSourceVisible({source_kind:'beneficiary_case',source_ref:'case'}),false);
caseError=new Error('Failed to fetch');await assert.rejects(()=>deniedCase.notificationSourceVisible({source_kind:'beneficiary_case',source_ref:'case'}),/Failed to fetch/);
console.log('PASS executed notification targets preserve exact IDs and legacy attendance/page links');
const row={id:'notification1',user_id:'alice',source_kind:'attendance_session',source_ref:'old-session',action_page:'My Attendance',category:'assignment',priority:'normal',created_at:new Date().toISOString(),read_at:null,archived_at:null,title:'Workday reviewed',body:'test'};
const {Notifications}=load('src/features/notifications/Notifications.tsx',{
 '../../lib/supabase/client':{db:null,rpc:async(name,args)=>{calls.push({name,args});return name==='notification_center'?{items:[row],total:1,unread:0}:null;}},
 './notificationAction':action,'lucide-react':icons
});
let view,navigated=null;
sourceVisible=false;
await act(async()=>{view=create(React.createElement(Notifications,{rows:[row],refresh:async()=>{},onOpenTarget:t=>{navigated=t},currentScope:'personal',mode:'personal',canBroadcast:false}));});
const open=()=>view.root.findAllByType('button').find(n=>n.props.className==='primary'&&n.children.includes('Open'));
await act(async()=>{open().props.onClick();await new Promise(r=>setTimeout(r,0));});
assert.equal(navigated,null);
assert.match(JSON.stringify(view.toJSON()),/no longer available, or your access has changed/);
assert.ok(calls.some(c=>c.name==='mark_notification_read'&&c.args.p_id===row.id));
sourceVisible=true;
await act(async()=>{open().props.onClick();await new Promise(r=>setTimeout(r,0));});
assert.equal(routePath(navigated),'/app/field/attendance/old-session');
await act(async()=>view.unmount());
console.log('PASS rendered notification click retains unavailable feedback and navigates an authorized workday');

const task={id:'outside-queue',title:'Linked distant task',task_type:'manual',source_page:'Task Center',priority:'low',status:'completed',due_at:new Date().toISOString(),description:'Exact target',version:1};
let detail=task;const taskCalls=[];
const {TaskCenter}=load('src/features/operations/TaskCenter.tsx',{'../../lib/supabase/client':{rpc:async(name,args)=>{taskCalls.push({name,args});return name==='operational_task_detail'?detail:name==='operational_task_queue'?{rows:[],count:0}:0;}},'../../shared/ui/FormFields':{human:s=>s},'lucide-react':icons});
await act(async()=>{view=create(React.createElement(TaskCenter,{mode:'personal',onNavigate:()=>{},canCreate:false,initialTaskId:task.id}));});
assert.equal(view.root.findAll(n=>n.props.id==='task-'+task.id).length,1);
await act(async()=>view.root.findAllByType('button').find(n=>n.children.includes('Completed')).props.onClick());
assert.deepEqual(taskCalls.filter(c=>c.name==='operational_task_queue').map(c=>c.args.p_view),['mine','completed']);
assert.equal(view.root.findAll(n=>n.props.id==='task-'+task.id).length,1);
detail=null;
await act(async()=>view.root.findAllByType('button').find(n=>n.children.includes(' Refresh')).props.onClick());
assert.equal(view.root.findAll(n=>n.props.id==='task-'+task.id).length,0);
assert.match(JSON.stringify(view.toJSON()),/task is no longer available/);
await act(async()=>view.unmount());
console.log('PASS linked task renders outside the queue, permits filter changes and clears revoked detail on refresh');

const oldSession={id:'old-session',worker_id:'alice',assignment_id:'old-assignment',project_title:'Historic project',organization_name:'NGO',work_date:'2025-01-01',status:'approved',effective_check_in_at:'2025-01-01T08:00:00Z',effective_check_out_at:'2025-01-01T09:00:00Z',duration_minutes:60,check_in_accuracy_m:null,check_out_accuracy_m:null,check_in_latitude:null,check_in_longitude:null,check_out_latitude:null,check_out_longitude:null};
const attendanceCalls=[];
const {AttendanceWorkspace}=load('src/features/workforce/AttendanceWorkspace.tsx',{
 '../../lib/supabase/client':{db:{from:()=>({select(){return this},eq(){return this},order(){return this},limit:async()=>({data:[],error:null})})},rpc:async(name)=>{attendanceCalls.push(name);return name==='attendance_session_detail'?oldSession:{rows:[],count:0,summary:{},page:0};}},
 '../../shared/ui/FormFields':{Badge:Null,human:s=>s},'lucide-react':icons,
 './attendanceOfflineStore':{pendingAttendance:async()=>[]},'./attendanceDownload':{readAttendanceDownload:async()=>null}
});
await act(async()=>{view=create(React.createElement(AttendanceWorkspace,{userId:'alice',initialSessionId:oldSession.id}));});
assert.equal(view.root.findAll(n=>n.props.id==='attendance-old-session').length,1);
assert.match(JSON.stringify(view.toJSON()),/2025-01-01/);
await act(async()=>{navigator.onLine=false;window.dispatchEvent(new Event('offline'));});
assert.equal(view.root.findAll(n=>n.props.id==='attendance-old-session').length,0);
assert.match(JSON.stringify(view.toJSON()),/Connect to open this linked workday/);
assert.equal(attendanceCalls.filter(n=>n==='attendance_session_detail').length,1);
await act(async()=>view.unmount());
console.log('PASS historic linked workday renders outside the recent list and offline handling preserves a clear connection requirement');
