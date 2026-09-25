import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {schemaDb} from './schema-test-db.mjs';

let passed=0;
async function ok(name,fn){await fn();passed++;console.log('PASS',name)}
const migration=readFileSync('supabase/migrations/20261013000430_case_ownership_delegated_operations.sql','utf8');
const managerUi=readFileSync('src/features/cases/BeneficiaryCasesWorkspace.tsx','utf8');
const delegatedUi=readFileSync('src/features/cases/DelegatedCasesWorkspace.tsx','utf8');
const routes=readFileSync('src/app/routes.ts','utf8');
const shell=readFileSync('src/app/AppShell.tsx','utf8');

await ok('2.39 adds ownership only on top of the existing case, follow-up and task systems',async()=>{
  assert.match(migration,/create table public\.beneficiary_case_assignments/);
  assert.match(migration,/create table public\.beneficiary_case_assignment_events/);
  assert.doesNotMatch(migration,/create table public\.beneficiary_cases\s*\(/i);
  assert.doesNotMatch(migration,/create table public\.beneficiary_case_followups\s*\(/i);
  assert.doesNotMatch(migration,/create table public\.operational_tasks\s*\(/i);
  assert.match(migration,/refresh_case_followup_tasks/);
});

await ok('delegated access requires explicit ownership plus current project/geography authority',async()=>{
  assert.match(migration,/case_delegate_active/);
  assert.match(migration,/case_owner_eligible/);
  assert.match(migration,/geo_contains\(sa\.collection_geography_id,c\.geography_id\)/);
  assert.match(migration,/owner_role='area_focal_person'/);
  assert.match(migration,/project_staff_areas/);
  assert.match(migration,/Assigned beneficiary case access required/);
});

await ok('manager and personal UX expose ownership, My Cases and My Follow-ups without finance delegation',async()=>{
  assert.match(managerUi,/Case ownership/);
  assert.match(managerUi,/set_beneficiary_case_owner/);
  assert.match(managerUi,/Ownership history/);
  assert.match(delegatedUi,/My Cases/);
  assert.match(delegatedUi,/My Follow-ups/);
  assert.match(delegatedUi,/Assistance approvals, finance and organization administration remain outside this workspace/);
  assert.match(routes,/\/app\/field\/cases/);
  assert.match(routes,/\/app\/field\/follow-ups/);
  assert.match(shell,/DelegatedCasesWorkspace/);
});

await ok('2.39 migration follows the validated 2.38.1 automatic marketplace migration',async()=>{
  const migrations=readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort();
  const prior='20261013000420_automatic_project_marketplace_publishing.sql';
  const current='20261013000430_case_ownership_delegated_operations.sql';
  assert.equal(migrations.indexOf(current),migrations.indexOf(prior)+1);
});

const db=await schemaDb();
const ids={
  super:'a3900000-0000-4000-8000-000000000001',ngo:'a3900000-0000-4000-8000-000000000002',pm:'a3900000-0000-4000-8000-000000000003',
  focal:'a3900000-0000-4000-8000-000000000004',wrongFocal:'a3900000-0000-4000-8000-000000000005',worker:'a3900000-0000-4000-8000-000000000006',
  outsider:'a3900000-0000-4000-8000-000000000007',otherNgo:'a3900000-0000-4000-8000-000000000008'
};
const rows=async(q,p=[])=>(await db.query(q,p)).rows;
async function as(name){await db.exec('RESET ROLE');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[name?ids[name]:'']);await db.exec(`SET ROLE ${name?'authenticated':'anon'}`)}
async function call(name,args=[]){return (await rows(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args))[0].result}
const deny=(fn,re=/permission|required|access|authority|assigned/i)=>assert.rejects(fn,re);
const caseId=n=>`b3900000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const followId=n=>`c3900000-0000-4000-8000-${String(n).padStart(12,'0')}`;

try{
  for(const [name,id] of Object.entries(ids))await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)',[id,`${name}@phase239.test`,JSON.stringify({full_name:name})]);
  await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.super]);
  await as('super');
  const org=await call('save_organization',[null,{name:'2.39 Delegated Cases NGO',status:'active'}]);
  const otherOrg=await call('save_organization',[null,{name:'2.39 Other NGO',status:'active'}]);
  for(const u of ['ngo','pm','focal','wrongFocal'])await call('set_membership',[org,ids[u],u==='ngo'?'ngo_admin':'member','active']);
  await call('set_membership',[otherOrg,ids.otherNgo,'ngo_admin','active']);
  const province=await call('save_geography',[null,null,'province','2.39 Province','C239P','Case ownership fixture',true]);
  const division=await call('save_geography',[null,province,'division','2.39 Division','C239D','Case ownership fixture',true]);
  const districtA=await call('save_geography',[null,division,'district','2.39 District A','C239A','Case ownership fixture',true]);
  const districtB=await call('save_geography',[null,division,'district','2.39 District B','C239B','Case ownership fixture',true]);
  const template=await call('publish_survey_template',['2.39 Case Ownership Template',[{id:'need',label:'Need',type:'text',required:true}]]);
  const dates=(await rows("select (current_date-1)::text start,(current_date+60)::text finish,current_date::text today,(current_date+2)::text soon"))[0];
  const project=await call('create_survey_project',[org,'2.39 Delegated Case Project',template,province,100,dates.start,dates.finish,'Validate delegated case ownership','v1','Explain case follow-up and obtain consent.']);

  await as('ngo');
  await call('assign_project_staff',[project,ids.pm,'project_manager',[],dates.start,dates.finish]);
  await call('assign_project_staff',[project,ids.focal,'area_focal_person',[districtA],dates.start,dates.finish]);
  await call('assign_project_staff',[project,ids.wrongFocal,'area_focal_person',[districtB],dates.start,dates.finish]);

  await db.exec('RESET ROLE');
  await db.query("update public.volunteer_profiles set status='verified',geography_id=$1,details=jsonb_build_object('full_name','Assigned Worker') where user_id=$2",[districtA,ids.worker]);
  await db.query('insert into public.survey_assignments(project_id,user_id,active,collection_geography_id) values($1,$2,true,$3)',[project,ids.worker,districtA]);
  const household=(await rows('insert into public.registry_households(project_id,label,geography_id,created_by) values($1,$2,$3,$4) returning id',[project,'Case Household',districtA,ids.worker]))[0].id;
  const person=(await rows('insert into public.registry_persons(project_id,household_id,full_name,birth_date,created_by) values($1,$2,$3,$4,$5) returning *',[project,household,'Case Beneficiary','1992-02-02',ids.worker]))[0];
  const response=(await rows("insert into public.survey_responses(project_id,person_id,collector_id,answers,consent,status,review_note,reviewed_by,reviewed_at,collection_geography_id) values($1,$2,$3,$4::jsonb,$5::jsonb,'approved',$6,$7,now(),$8) returning *",[project,person.id,ids.worker,JSON.stringify({need:'follow-up'}),JSON.stringify({agreed:true,method:'verbal'}),'Approved case source',ids.ngo,districtA]))[0];

  await as('pm');
  await call('create_beneficiary_case',[caseId(1),person.id,response.id,null,'Delegated follow-up case','Validate named owner and geography-scoped follow-up responsibility','high',dates.today,'Open case for delegated field operations']);
  await call('create_beneficiary_case',[caseId(2),person.id,response.id,null,'Closure ownership case','Validate ownership release when a case is formally closed','medium',null,'Open second case for closure ownership validation']);

  await ok('manager queue starts unassigned and candidates are limited to eligible worker/focal geography',async()=>{
    await as('pm');
    const q=await call('beneficiary_case_queue',[org,project,null,null,100]);
    assert.equal(q.summary.unassigned,2);assert.equal(q.summary.assigned,0);
    const candidates=await call('beneficiary_case_assignment_candidates',[caseId(1)]);
    assert(candidates.some(x=>x.user_id===ids.worker&&x.owner_role==='field_worker'));
    assert(candidates.some(x=>x.user_id===ids.focal&&x.owner_role==='area_focal_person'));
    assert.equal(candidates.some(x=>x.user_id===ids.wrongFocal),false);
  });

  await ok('area focal geography alone does not expose a case until explicit delegation',async()=>{
    await as('focal');
    const q=await call('my_delegated_case_queue',['all',project,100]);
    assert.equal(q.summary.total,0);
    await deny(()=>call('my_delegated_case_detail',[caseId(1)]));
  });

  let workerOwner;
  await ok('project manager assigns a Field Worker and bounded personal case access becomes active',async()=>{
    await as('pm');
    workerOwner=await call('set_beneficiary_case_owner',[caseId(1),ids.worker,'field_worker','Delegate field follow-up to the assigned Field Worker',null,null]);
    const ownership=await call('beneficiary_case_ownership_detail',[caseId(1)]);
    assert.equal(ownership.current_assignment.id,workerOwner);assert.equal(ownership.current_assignment.user_id,ids.worker);assert.equal(ownership.current_assignment.eligible,true);
    await as('worker');
    const q=await call('my_delegated_case_queue',['all',project,100]);assert.equal(q.summary.total,1);assert.equal(q.rows[0].id,caseId(1));
    const detail=await call('my_delegated_case_detail',[caseId(1)]);
    assert.equal(detail.person.full_name,'Case Beneficiary');assert.equal(detail.assignment.owner_role,'field_worker');
    assert.equal(detail.requests,undefined);assert.equal(detail.case.identity_snapshot,undefined);
    assert.equal((await rows('select id from public.beneficiary_cases where id=$1',[caseId(1)])).length,0);
  });

  await ok('delegated worker can schedule follow-up and Task Center assigns the derived SLA task to the owner',async()=>{
    await as('worker');
    await call('create_beneficiary_case_followup',[followId(1),caseId(1),null,null,'field_visit',dates.today,'Visit beneficiary and record the current outcome']);
    await db.exec('RESET ROLE');
    const task=(await rows("select * from public.operational_tasks where source_kind='beneficiary_case_followup' and source_ref=$1 and status in ('open','in_progress')",[followId(1)]))[0];
    assert.ok(task);assert.equal(task.assigned_to,ids.worker);assert.equal(task.assigned_role,'field_worker');
  });

  await ok('reassignment is optimistic, immutable in history and moves follow-up task responsibility',async()=>{
    await as('pm');
    let state=await call('beneficiary_case_ownership_detail',[caseId(1)]);
    const focalOwner=await call('set_beneficiary_case_owner',[caseId(1),ids.focal,'area_focal_person','Reassign field follow-up to the authorized Area Focal',state.current_assignment.id,state.current_assignment.version]);
    state=await call('beneficiary_case_ownership_detail',[caseId(1)]);
    assert.equal(state.current_assignment.id,focalOwner);assert.equal(state.current_assignment.user_id,ids.focal);
    assert.equal(state.history[0].event_type,'reassigned');assert.equal(state.history[0].from_user_id,ids.worker);assert.equal(state.history[0].to_user_id,ids.focal);
    await db.exec('RESET ROLE');
    const task=(await rows("select * from public.operational_tasks where source_ref=$1 and status in ('open','in_progress')",[followId(1)]))[0];assert.equal(task.assigned_to,ids.focal);assert.equal(task.assigned_role,'area_focal_person');
    await as('worker');
    assert.equal((await call('my_delegated_case_queue',['all',project,100])).summary.total,0);
    assert.equal((await rows('select id from public.beneficiary_case_assignment_events where case_id=$1',[caseId(1)])).length,0);
    await as('focal');assert.equal((await call('my_delegated_case_queue',['all',project,100])).summary.total,1);
  });

  await ok('delegated Area Focal can record the scheduled outcome but another account cannot',async()=>{
    await as('outsider');await deny(()=>call('complete_beneficiary_case_followup',[followId(1),'unresolved','Unauthorized outcome attempt','No feedback','No action',null,null,'Unauthorized completion attempt',1]));
    await as('focal');
    await call('complete_beneficiary_case_followup',[followId(1),'unresolved','Beneficiary still requires follow-up after the field visit','Beneficiary asked for another contact','Project Manager should review next action',null,null,'Record delegated field visit outcome',1]);
    const fq=await call('my_delegated_followup_queue',['completed',project,100]);assert.equal(fq.summary.completed,1);assert.equal(fq.rows[0].status,'completed');
  });

  await ok('explicit Area Focal revocation ends live delegated access while preserving ownership history',async()=>{
    await as('ngo');
    const roster=await call('project_staff_roster',[project]);const focalAssignment=roster.find(x=>x.user_id===ids.focal);
    await call('revoke_project_staff',[focalAssignment.id,'End focal access for ownership revocation validation',focalAssignment.version]);
    await as('focal');assert.equal((await call('my_delegated_case_queue',['all',project,100])).summary.total,0);
    await as('pm');const state=await call('beneficiary_case_ownership_detail',[caseId(1)]);assert.equal(state.current_assignment,null);assert.equal(state.history[0].event_type,'eligibility_ended');
  });

  await ok('Field Worker survey-scope revocation ends delegated case access and removes stale Task Center assignment',async()=>{
    await as('pm');
    await call('set_beneficiary_case_owner',[caseId(1),ids.worker,'field_worker','Return case to Field Worker for revocation validation',null,null]);
    await as('worker');
    await call('create_beneficiary_case_followup',[followId(2),caseId(1),null,null,'phone',dates.soon,'Schedule a second follow-up before worker authority revocation']);
    await as('super');await call('set_survey_assignment_scope',[project,ids.worker,districtA,false]);
    await db.exec('RESET ROLE');
    const releasedTask=(await rows("select assigned_to,assigned_role from public.operational_tasks where source_kind='beneficiary_case_followup' and source_ref=$1 and status in ('open','in_progress')",[followId(2)]))[0];
    assert.ok(releasedTask);assert.equal(releasedTask.assigned_to,null);assert.equal(releasedTask.assigned_role,null);
    await as('worker');
    assert.equal((await call('my_delegated_case_queue',['all',project,100])).summary.total,0);
    assert.equal((await rows("select id from public.operational_tasks where source_ref=$1",[followId(2)])).length,0);
    await as('pm');const state=await call('beneficiary_case_ownership_detail',[caseId(1)]);assert.equal(state.current_assignment,null);assert.equal(state.history[0].event_type,'eligibility_ended');
  });

  await ok('case closure ends live ownership but retains assignment/event history',async()=>{
    await db.exec('RESET ROLE');await db.query('update public.survey_assignments set active=true,collection_geography_id=$1 where project_id=$2 and user_id=$3',[districtA,project,ids.worker]);
    await as('pm');
    await call('set_beneficiary_case_owner',[caseId(2),ids.worker,'field_worker','Assign second case before controlled closure',null,null]);
    const d=await call('beneficiary_case_detail',[caseId(2)]);
    await call('close_beneficiary_case',[caseId(2),'administrative_closure','Case completed for delegated ownership closure validation','Close completed ownership fixture',d.case.version]);
    const state=await call('beneficiary_case_ownership_detail',[caseId(2)]);assert.equal(state.current_assignment,null);assert.equal(state.history[0].event_type,'case_closed');assert.ok(state.history.length>=2);
    await as('worker');assert.equal((await call('my_delegated_case_queue',['all',project,100])).rows.some(x=>x.id===caseId(2)),false);
  });

  await ok('cross-organization accounts cannot inspect or mutate case ownership',async()=>{
    await as('otherNgo');
    await deny(()=>call('beneficiary_case_ownership_detail',[caseId(1)]));
    await deny(()=>call('set_beneficiary_case_owner',[caseId(1),ids.worker,'field_worker','Foreign organization assignment attempt',null,null]));
  });

  await ok('ownership tables are direct-write protected and notifications are generated for delegation changes',async()=>{
    await as('worker');await deny(()=>db.query("insert into public.beneficiary_case_assignments(case_id,organization_id,project_id,geography_id,user_id,owner_role,assigned_by) values($1,$2,$3,$4,$5,'field_worker',$5)",[caseId(1),org,project,districtA,ids.worker]),/permission denied/i);
    await db.exec('RESET ROLE');
    const notices=await rows("select count(*)::int c from public.notifications where user_id in ($1,$2) and title in ('Case assigned','Case reassigned','Case responsibility ended')",[ids.worker,ids.focal]);
    assert.ok(notices[0].c>=4);
  });

  console.log(`\n${passed} FieldLance 2.39.0 case ownership / delegated field operations scenarios passed.`);
}finally{await db.close()}
