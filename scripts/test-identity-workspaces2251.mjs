import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {schemaDb} from './schema-test-db.mjs';
import {resolveWorkspace, workspaceHome, readPreferredWorkspace, rememberPreferredWorkspace} from '../src/features/workspaces/access.ts';
let passed=0;
async function ok(name,fn){await fn();passed++;console.log('PASS '+name)}
const db=await schemaDb('20261009000800_notifications_communication_center.sql');
const id=n=>`25100000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const rows=async(q,p=[]) => (await db.query(q,p)).rows;
const root=()=>db.exec('RESET ROLE');
async function as(n){await root();await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n):'']);await db.exec('SET ROLE '+(n?'authenticated':'anon'))}
async function call(name,args=[]){return (await rows(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args))[0].result}
const access=()=>call('my_workspace_access');
const enroll=kind=>call('begin_workspace_onboarding',[kind]);
async function signup(n,intent){await root();await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id(n),`user${n}@example.test`,{full_name:`User ${n}`,onboarding_intent:intent,platform_role:'super_admin'}])}
try {
 await signup(1,'organization');
 await db.exec(readFileSync('supabase/migrations/20261009000900_identity_workspace_stabilization.sql','utf8'));
 await ok('legacy access survives migration without invented explicit consent',async()=>{await as(1);const a=await access();assert.equal(a.enrollment,'legacy');assert.equal(a.worker,true);assert.equal((await rows('select * from public.volunteer_profiles where user_id=$1',[id(1)])).length,1)});
 await signup(2,'organization');await signup(3,'worker');await signup(4,'staff');
 await ok('organization signup has no worker profile and opens onboarding',async()=>{await as(2);const a=await access();assert.equal(a.defaultScope,'onboarding');assert.equal(a.worker,false);assert.deepEqual(a.workspaces.map(w=>w.id),['onboarding']);assert.equal((await rows('select * from public.volunteer_profiles')).length,0)});
 await ok('draft worker receives personal workspace before verification',async()=>{await as(3);const a=await access();assert.equal(a.defaultScope,'personal');assert.equal(a.enrollment,'enrolled');assert.equal((await rows('select status from public.volunteer_profiles where user_id=$1',[id(3)]))[0].status,'draft')});
 await ok('forged signup metadata cannot grant staff permission',async()=>{await as(4);assert.equal((await rows('select platform_role from public.accounts where id=$1',[id(4)]))[0].platform_role,'volunteer');assert(!(await access()).workspaces.some(w=>w.id==='poem'));await assert.rejects(()=>enroll('staff'),/Choose worker or organization/)});
 await ok('owner cannot directly forge enrollment or platform role',async()=>{await as(2);await assert.rejects(()=>db.query("update public.accounts set worker_enrollment='enrolled',platform_role='super_admin' where id=$1",[id(2)]),/permission denied/)});
 await ok('new-session resolver ignores forged worker staff and organization preferences',async()=>{await as(3);await as(2);const a=await access();for(const scope of ['personal','poem',id(55)])assert.equal(resolveWorkspace(a,scope),'onboarding')});
 await ok('explicit worker enrollment is idempotent',async()=>{await as(2);await enroll('worker');await enroll('worker');assert.equal((await rows('select * from public.volunteer_profiles where user_id=$1',[id(2)])).length,1);assert.equal((await access()).enrollment,'enrolled')});
 await ok('worker starting organization onboarding retains worker access',async()=>{await as(3);await enroll('organization');const a=await access();for(const scope of ['onboarding','personal'])assert(a.workspaces.some(w=>w.id===scope))});
 await signup(5,'organization');await signup(6,'organization');await signup(7,'organization');
 await root();await db.query("insert into public.organizations(id,name,status) values($1,'Org A','active'),($2,'Org B','active')",[id(101),id(102)]);
 await db.query("insert into public.organization_memberships(organization_id,user_id,role,status) values($1,$2,'ngo_admin','active'),($3,$2,'ngo_admin','active'),($1,$4,'member','active')",[id(101),id(5),id(102),id(6)]);
 await ok('multi-organization admin has only authorized organizations and no worker profile',async()=>{await as(5);const a=await access();assert.equal(a.worker,false);for(const n of [101,102])assert(a.workspaces.some(w=>w.id===id(n)));assert.equal(resolveWorkspace(a,id(102)),id(102))});
 await ok('ordinary member cannot enter admin workspace or promote themselves',async()=>{await as(6);assert(!(await access()).workspaces.some(w=>w.id===id(101)));await assert.rejects(()=>call('set_membership',[id(101),id(6),'ngo_admin','active']),/permission/i)});
 await ok('revoked membership disappears and stale preference falls back',async()=>{await root();await db.query("update public.organization_memberships set status='suspended' where organization_id=$1 and user_id=$2",[id(102),id(5)]);await as(5);const a=await access();assert(!a.workspaces.some(w=>w.id===id(102)));assert.equal(resolveWorkspace(a,id(102)),id(101))});
 await ok('suspended organization excluded despite active membership',async()=>{await root();await db.query("update public.organizations set status='suspended' where id=$1",[id(101)]);await as(5);assert(!(await access()).workspaces.some(w=>w.id===id(101)));await root();await db.query("update public.organizations set status='active' where id=$1",[id(101)])});
 await ok('staff-only account has staff workspace without worker enrollment',async()=>{await root();await db.query("update public.accounts set platform_role='survey_manager' where id=$1",[id(7)]);await as(7);const a=await access();assert.equal(a.defaultScope,'poem');assert.equal(a.worker,false)});
 await ok('suspended account cannot access a workspace or enroll',async()=>{await root();await db.query("update public.accounts set status='suspended' where id=$1",[id(7)]);await as(7);assert.deepEqual((await access()).workspaces,[]);await assert.rejects(()=>enroll('worker'),/Active account/)});
 await ok('enrollment cannot reactivate suspended worker profile',async()=>{await root();await db.query("update public.volunteer_profiles set status='suspended' where user_id=$1",[id(3)]);await as(3);await assert.rejects(()=>enroll('worker'),/suspended/)});
 await ok('resolver does not expose other users organizations',async()=>{await as(4);assert(!(await access()).workspaces.some(w=>w.id===id(101)))});
 await signup(8,'organization');await signup(9,'organization');
 await ok('organization applicant statuses remain isolated from worker access',async()=>{
  await root();await db.query("insert into public.partner_ngo_applications(id,applicant_user_id,organization_name) values($1,$2,'Application only')",[id(201),id(8)]);
  for(const status of ['draft','submitted','changes_requested','rejected','withdrawn']){
   await root();await db.query('update public.partner_ngo_applications set status=$1 where id=$2',[status,id(201)]);await as(8);
   const a=await access();assert.equal(a.defaultScope,'onboarding');assert.equal(a.worker,false);assert.equal(a.applications[0].status,status);
  }
 });
 await root();await db.query("update public.accounts set status='active',platform_role='super_admin' where id=$1",[id(7)]);await as(7);
 const province=await call('save_geography',[null,null,'province','Identity Province','I251','Fixture',true]);
 const division=await call('save_geography',[null,province,'division','Identity Division','I251D','Fixture',true]);
 const district=await call('save_geography',[null,division,'district','Identity District','I251X','Fixture',true]);
 const template=await call('publish_survey_template',['Identity fixture',[{id:'q',label:'Question',type:'text',required:true}]]);
 const dates=(await rows("select (current_date-1)::text start,(current_date+20)::text finish,current_date::text today"))[0];
 const project=await call('create_survey_project',[id(101),'Identity Scoped Project',template,district,10,dates.start,dates.finish,'Verify workspace eligibility','identity-v1','Consent notice for identity test fixture.']);
 await call('set_membership',[id(101),id(8),'member','active']);await call('set_membership',[id(101),id(9),'member','active']);
 await as(5);const manager=await call('assign_project_staff',[project,id(8),'project_manager',[],dates.today,null]);
 const focal=await call('assign_project_staff',[project,id(9),'area_focal_person',[district],dates.today,null]);
 await ok('project manager and focal person retain project access without worker or organization-admin enrollment',async()=>{
  for(const user of [8,9]){await as(user);const a=await access();assert(a.workspaces.some(w=>w.id==='project:'+project));assert(!a.workspaces.some(w=>w.id===id(101)));assert.equal(a.worker,false);assert.equal((await rows('select id from public.survey_projects where id=$1',[project])).length,1)}
 });
 await ok('suspended membership removes project scope even for a platform staff account',async()=>{
  await root();await db.query("update public.accounts set platform_role='survey_manager' where id=$1",[id(8)]);await db.query("update public.organization_memberships set status='suspended' where organization_id=$1 and user_id=$2",[id(101),id(8)]);await as(8);
  const a=await access();assert(a.workspaces.some(w=>w.id==='poem'));assert(!a.workspaces.some(w=>w.id==='project:'+project));
  await root();await db.query("update public.accounts set platform_role='volunteer' where id=$1",[id(8)]);await db.query("update public.organization_memberships set status='active' where organization_id=$1 and user_id=$2",[id(101),id(8)]);
 });
 await ok('future project assignment is excluded even if another role can read project',async()=>{
  await root();await db.query("update public.project_staff_assignments set starts_at=current_date+2 where id=$1",[manager]);await as(8);assert(!(await access()).workspaces.some(w=>w.id==='project:'+project));
  await root();await db.query("update public.project_staff_assignments set starts_at=current_date-2,ends_at=current_date-1 where id=$1",[manager]);await as(8);assert(!(await access()).workspaces.some(w=>w.id==='project:'+project));
 });
 await ok('revoked project assignment loses workspace and backend project read access',async()=>{
  await root();await db.query("update public.project_staff_assignments set status='revoked' where id=$1",[focal]);await as(9);assert(!(await access()).workspaces.some(w=>w.id==='project:'+project));assert.equal((await rows('select id from public.survey_projects where id=$1',[project])).length,0);
 });
 await signup(10,'organization');
 await ok('approval creates organization-admin access for an applicant without any worker profile',async()=>{
  await root();await db.query("insert into public.partner_ngo_applications(id,applicant_user_id,organization_name,status) values($1,$2,'Organization Only Approval','submitted')",[id(202),id(10)]);
  await db.query("insert into public.partner_ngo_application_documents(application_id,applicant_user_id,object_path,file_name,mime_type,byte_size,kind,state,review_status) values($1,$2,'identity-test-proof','proof.pdf','application/pdf',100,'registration_proof','ready','accepted')",[id(202),id(10)]);
  await as(7);const organization=await call('review_partner_ngo_application',[id(202),'approved','Identity-only applicant approved',1]);
  await assert.rejects(()=>call('review_partner_ngo_application',[id(202),'approved','Retry must not duplicate organization',1]),/Submitted/);
  await as(10);const a=await access();assert.equal(a.defaultScope,organization);assert.equal(a.worker,false);assert.equal(a.applications[0].status,'approved');assert.equal((await rows('select * from public.volunteer_profiles where user_id=$1',[id(10)])).length,0);
 });
 await ok('workspace preference is account-scoped and storage failure cannot block login',async()=>{
  const memory=new Map();globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
  rememberPreferredWorkspace(id(1),'personal');rememberPreferredWorkspace(id(5),id(101));assert.equal(readPreferredWorkspace(id(1)),'personal');assert.equal(readPreferredWorkspace(id(5)),id(101));
  globalThis.localStorage={getItem:()=>{throw Error('blocked')},setItem:()=>{throw Error('blocked')}};assert.equal(readPreferredWorkspace(id(1)),null);rememberPreferredWorkspace(id(1),'personal');delete globalThis.localStorage;
 });
 await ok('anonymous resolver and enrollment calls denied',async()=>{await as(null);await assert.rejects(access,/permission denied/);await assert.rejects(()=>enroll('worker'),/permission denied/)});
 await ok('missing eligibility returns access status rather than worker fallback',async()=>{assert.equal(resolveWorkspace({workspaces:[],defaultScope:'personal',worker:false},'personal'),'access');assert.equal(workspaceHome('access'),'Access status');assert.equal(workspaceHome('onboarding'),'Partner NGO application');assert.equal(workspaceHome('project:'+id(123)),'Project workspace')});
 await ok('UI uses universal login optional profile and guarded keyed workspace content',async()=>{const auth=readFileSync('src/features/auth/Auth.tsx','utf8'),shell=readFileSync('src/app/AppShell.tsx','utf8');assert.match(auth,/mode === "signup" &&/);assert.doesNotMatch(auth,/rememberWorkspaceEntryIntent|label: "FieldLance Staff"/);assert.match(auth,/onboarding_intent:/);assert.doesNotMatch(shell,/consumeWorkspaceEntryIntent/);assert.match(shell,/maybeSingle/);assert.match(shell,/nav.some/);assert.match(shell,/key=\{`\$\{session.user.id\}:\$\{scope\}`\}/)});
} finally {await db.close()}
console.log(`\n${passed} identity and workspace scenarios passed.`);
