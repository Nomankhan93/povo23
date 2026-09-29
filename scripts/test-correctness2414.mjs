import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {schemaDb} from './schema-test-db.mjs';

let passed=0;
const ok=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)};
const ids={super:'64110000-0000-4000-8000-000000000001',worker:'64110000-0000-4000-8000-000000000002',outsider:'64110000-0000-4000-8000-000000000003'};
const db=await schemaDb();
const rows=async(sql,params=[])=>(await db.query(sql,params)).rows;
async function as(name){await db.exec('RESET ROLE');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[name?ids[name]:'']);await db.exec('SET ROLE '+(name?'authenticated':'anon'));}
async function call(name,args){return (await rows(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args))[0].result;}
try{
  const fixture=readFileSync('scripts/fixtures/device241/client.js','utf8');
  await ok('browser transport implements current Supabase terminal query methods',async()=>{
    for(const token of ['single:','maybeSingle:','range:','then:'])assert.ok(fixture.includes(token),token);
    assert.ok(fixture.includes("name==='my_workspace_access'"));
  });

  for(const [name,id] of Object.entries(ids))await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${name}@example.test`]);
  await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.super]);
  await db.query("update public.volunteer_profiles set status='verified' where user_id=$1",[ids.worker]);
  await as('super');
  const org=await call('save_organization',[null,{name:'Timezone Payable NGO',status:'active'}]);
  const geo=await call('save_geography',[null,null,'province','Timezone Province','TZ2411','Synthetic corrective fixture',true]);
  const template=await call('publish_survey_template',['Timezone payable template',[{id:'name',type:'text',label:'Name',required:true}]]);
  const dates=(await rows("select (current_date-90)::text start,(current_date+3)::text finish,(current_date-60)::text local_tomorrow,(current_date+2)::text no_evidence_day"))[0];
  const project=await call('create_survey_project',[org,'Timezone payable project',template,geo,10,dates.start,dates.finish,'Verify timezone-backed attendance recovery','v1','Explain collection and use before consent.']);

  await db.exec('RESET ROLE');
  const assignment=(await rows("insert into public.work_assignments(survey_project_id,organization_id,user_id,volunteer_name,organization_name,project_title,source_kind,work_mode,compensation_type,rate,target_surveys,start_date,end_date,status,offered_by,responded_at) values($1,$2,$3,'Worker','Timezone NGO','Timezone payable project','shortlist','volunteer','none',null,10,$4,$5,'active',$6,now()-interval '1 day') returning id",[project,org,ids.worker,dates.start,dates.finish,ids.super]))[0].id;
  const session=(await rows("insert into public.assignment_work_sessions(assignment_id,project_id,organization_id,worker_id,work_date,timezone,location_policy_snapshot,max_accuracy_m_snapshot,check_in_captured_at,effective_check_in_at,check_out_captured_at,effective_check_out_at,status,worker_note,submitted_at,reviewed_by,reviewed_at,review_note,start_request_id) values($1,$2,$3,$4,$5,'Pacific/Kiritimati','not_required',100,now(),now(),now()+interval '1 hour',now()+interval '1 hour','approved','Synthetic approved attendance',now(),$6,now(),'Approved for timezone recovery',gen_random_uuid()) returning id",[assignment,project,org,ids.worker,dates.local_tomorrow,ids.super]))[0].id;


  await ok('linked attendance resolves outside the recent range and checks current access',async()=>{
    await as('worker');
    const recent=await call('attendance_workspace',[null,new Date().toISOString().slice(0,10),new Date().toISOString().slice(0,10),null,0]);
    assert.equal(recent.rows.some(r=>r.id===session),false);
    assert.equal((await call('attendance_session_detail',[session])).id,session);
    await as('outsider');assert.equal(await call('attendance_session_detail',[session]),null);
    await as(null);await assert.rejects(()=>call('attendance_session_detail',[session]),/permission denied/);
  });
  await ok('attendance review emits an exact workday notification',async()=>{
    await db.exec('RESET ROLE');
    await db.query("insert into public.organization_memberships(organization_id,user_id,role,status) values($1,$2,'ngo_admin','active')",[org,ids.super]);
    await db.query("update public.assignment_work_sessions set status='submitted',reviewed_by=null,reviewed_at=null where id=$1",[session]);
    await as('super');await call('review_attendance_session',[session,'reject','Please correct this workday',1]);
    await as('worker');
    const n=(await rows("select source_kind,source_ref,event_type from public.notifications where user_id=$1 and event_type='attendance_rejected'",[ids.worker]))[0];
    assert.equal(n.source_kind,'attendance_session');assert.equal(n.source_ref,session);
  });
  await db.exec('RESET ROLE');
  await db.query("insert into public.operational_tasks(task_type,title,source_ref,source_page,assigned_to,created_by,organization_id,project_id,due_at) select 'manual','Task '||g,g::text,'Task Center',$1,$2,$3,$4,now() from generate_series(1,501) g",[ids.worker,ids.super,org,project]);
  const target=(await rows("insert into public.operational_tasks(task_type,title,source_ref,source_page,assigned_to,created_by,organization_id,project_id,priority,due_at) values('manual','Exact distant task','2414-target','Task Center',$1,$2,$3,$4,'low',now()+interval '300 days') returning id",[ids.worker,ids.super,org,project]))[0].id;
  await ok('exact task lookup works beyond the 500-row queue cap',async()=>{
    await as('worker');const queue=await call('operational_task_queue',['all',org,project,500]);
    assert.equal(queue.rows.length,500);assert.equal(queue.rows.some(r=>r.id===target),false);
    const detail=await call('operational_task_detail',[target,org,project]);assert.equal(detail.id,target);assert.equal(detail.sla_label,'Operational task');
    assert.equal(await call('operational_task_detail',[target,ids.outsider,null]),null);
    assert.equal(await call('operational_task_detail',[target,null,ids.outsider]),null);
  });
  await ok('exact task lookup denies other owners, missing records, revoked assignment and anonymous access',async()=>{
    await as('outsider');assert.equal(await call('operational_task_detail',[target,null,null]),null);
    await as('worker');assert.equal(await call('operational_task_detail',[ids.outsider,null,null]),null);
    await db.exec('RESET ROLE');await db.query('update public.operational_tasks set assigned_to=$1 where id=$2',[ids.outsider,target]);
    await as('worker');assert.equal(await call('operational_task_detail',[target,null,null]),null);
    await as(null);await assert.rejects(()=>call('operational_task_detail',[target,null,null]),/permission denied/);
  });
  console.log(`${passed} 2.41.4 database correctness checks passed`);
}finally{await db.close();}
