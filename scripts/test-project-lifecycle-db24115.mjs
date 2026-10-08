import assert from 'node:assert/strict';
import {schemaDb} from './schema-test-db.mjs';
import {acceptCollectionFixture} from './accepted-collection-fixture.mjs';

const db=await schemaDb();
let passed=0;
const ids=Object.fromEntries(['super','ngo','manager','member','workerA','workerB','workerC'].map((name,i)=>[
  name,`a4150000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,
]));
const rows=async(q,p=[])=>(await db.query(q,p)).rows;
async function as(name){
  await db.exec('RESET ROLE');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[name?ids[name]:'']);
  await db.exec(`SET ROLE ${name?'authenticated':'anon'}`);
}
async function call(name,args){
  return (await rows(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args))[0].result;
}
async function ok(name,fn){await fn();passed+=1;console.log('PASS',name)}
const feedback={professionalism:5,communication:5,field_discipline:5,data_quality:5,task_completion:5};

try{
  for(const [name,id] of Object.entries(ids)) await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${name}@example.test`]);
  await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.super]);
  await as('super');

  const org=await call('save_organization',[null,{name:'2.41.15 Lifecycle NGO',status:'active'}]);
  await call('set_membership',[org,ids.ngo,'ngo_admin','active']);
  await call('set_membership',[org,ids.manager,'member','active']);
  await call('set_membership',[org,ids.member,'member','active']);

  const geo=await call('save_geography',[null,null,'province','2.41.15 Province','L415','Fixture',true]);
  await db.exec('RESET ROLE');
  for(const who of ['workerA','workerB','workerC']){
    await db.query("update public.volunteer_profiles set status='verified',geography_id=$1,details=jsonb_build_object('full_name',$2::text,'skills','Survey','languages','Urdu'),version=version+1 where user_id=$3",[geo,who,ids[who]]);
  }

  await as('super');
  const template=await call('publish_survey_template',['2.41.15 Lifecycle Template',[{id:'q',label:'Question',type:'text',required:true}]]);
  const dates=(await rows("select ((now() at time zone 'UTC')::date-1)::text start,((now() at time zone 'UTC')::date+14)::text finish,(now() at time zone 'UTC')::date::text today"))[0];
  const project=await call('create_survey_project',[org,'2.41.15 Lifecycle Project',template,geo,20,dates.start,dates.finish,'Project lifecycle authorization regression','24115','Consent notice for disposable lifecycle fixture.']);

  await as('ngo');
  await call('assign_project_staff',[project,ids.manager,'project_manager',[],dates.today,null]);

  await acceptCollectionFixture(db,project,ids.workerA);
  await acceptCollectionFixture(db,project,ids.workerB);
  await acceptCollectionFixture(db,project,ids.workerC);

  await ok('Project Manager completes an accepted assignment and collection is revoked',async()=>{
    await db.exec('RESET ROLE');
    const assignment=(await rows("select id,version from public.work_assignments where survey_project_id=$1 and user_id=$2 and status='active'",[project,ids.workerA]))[0];
    assert.ok(assignment);
    await as('manager');
    await call('complete_work_assignment',[assignment.id,feedback,'Completed after verified project delivery',assignment.version]);
    await db.exec('RESET ROLE');
    const work=(await rows('select status,completed_by from public.work_assignments where id=$1',[assignment.id]))[0];
    const collection=(await rows('select active from public.survey_assignments where project_id=$1 and user_id=$2',[project,ids.workerA]))[0];
    assert.equal(work.status,'completed');
    assert.equal(work.completed_by,ids.manager);
    assert.equal(collection.active,false);
  });

  await ok('Project Manager cancels an accepted assignment and collection is revoked',async()=>{
    await db.exec('RESET ROLE');
    const assignment=(await rows("select id,version from public.work_assignments where survey_project_id=$1 and user_id=$2 and status='active'",[project,ids.workerB]))[0];
    assert.ok(assignment);
    await as('manager');
    await call('cancel_work_assignment',[assignment.id,'Field assignment cancelled after project replanning',assignment.version]);
    await db.exec('RESET ROLE');
    const work=(await rows('select status,cancelled_by from public.work_assignments where id=$1',[assignment.id]))[0];
    const collection=(await rows('select active from public.survey_assignments where project_id=$1 and user_id=$2',[project,ids.workerB]))[0];
    assert.equal(work.status,'cancelled');
    assert.equal(work.cancelled_by,ids.manager);
    assert.equal(collection.active,false);
  });

  await ok('ordinary Organization member cannot finalize project assignments',async()=>{
    await db.exec('RESET ROLE');
    const assignment=(await rows("select id,version from public.work_assignments where survey_project_id=$1 and user_id=$2 and status='active'",[project,ids.workerC]))[0];
    assert.ok(assignment);
    await as('member');
    await assert.rejects(()=>call('complete_work_assignment',[assignment.id,feedback,'Unauthorized completion attempt should be denied',assignment.version]),/Project workforce management permission required/i);
    await assert.rejects(()=>call('cancel_work_assignment',[assignment.id,'Unauthorized cancellation attempt should be denied',assignment.version]),/Project workforce management permission required/i);
  });

  await ok('assignment outcome notifications preserve exact worker/project context',async()=>{
    await db.exec('RESET ROLE');
    const notices=await rows("select user_id,event_type,action_page,project_id,source_kind,source_ref from public.notifications where project_id=$1 and event_type in ('work_assignment_completed','work_assignment_cancelled') order by id",[project]);
    assert.equal(notices.length,2);
    assert.deepEqual(notices.map(n=>n.event_type),['work_assignment_completed','work_assignment_cancelled']);
    assert.equal(notices.every(n=>n.action_page==='My Assigned Surveys'&&n.source_kind==='work_assignment'&&n.source_ref),true);
  });

  console.log(`\n${passed} FieldLance 2.41.15 migrated-schema lifecycle scenarios passed.`);
}finally{
  await db.close();
}
