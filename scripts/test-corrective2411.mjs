import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {schemaDb} from './schema-test-db.mjs';

let passed=0;
const ok=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)};
const ids={super:'64110000-0000-4000-8000-000000000001',worker:'64110000-0000-4000-8000-000000000002'};
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
  const dates=(await rows("select (current_date-1)::text start,(current_date+3)::text finish,(current_date+1)::text local_tomorrow,(current_date+2)::text no_evidence_day"))[0];
  const project=await call('create_survey_project',[org,'Timezone payable project',template,geo,10,dates.start,dates.finish,'Verify timezone-backed attendance recovery','v1','Explain collection and use before consent.']);

  await db.exec('RESET ROLE');
  const assignment=(await rows("insert into public.work_assignments(survey_project_id,organization_id,user_id,volunteer_name,organization_name,project_title,source_kind,work_mode,compensation_type,rate,target_surveys,start_date,end_date,status,offered_by,responded_at) values($1,$2,$3,'Worker','Timezone NGO','Timezone payable project','shortlist','paid','daily_rate',100,10,$4,$5,'active',$6,now()-interval '1 day') returning id",[project,org,ids.worker,dates.start,dates.finish,ids.super]))[0].id;
  const session=(await rows("insert into public.assignment_work_sessions(assignment_id,project_id,organization_id,worker_id,work_date,timezone,location_policy_snapshot,max_accuracy_m_snapshot,check_in_captured_at,effective_check_in_at,check_out_captured_at,effective_check_out_at,status,worker_note,submitted_at,reviewed_by,reviewed_at,review_note,start_request_id) values($1,$2,$3,$4,$5,'Pacific/Kiritimati','not_required',100,now(),now(),now()+interval '1 hour',now()+interval '1 hour','approved','Synthetic approved attendance',now(),$6,now(),'Approved for timezone recovery',gen_random_uuid()) returning id",[assignment,project,org,ids.worker,dates.local_tomorrow,ids.super]))[0].id;

  await as('worker');
  let unit;
  await ok('approved project-timezone workday can recover a daily payable even when date is ahead of UTC current_date',async()=>{
    unit=await call('claim_work_payable',[assignment,dates.local_tomorrow,'Timezone-backed approved attendance recovery']);
    assert.ok(unit);
    const row=(await rows('select assignment_id,source_kind,work_date::text as work_date from public.work_payable_units where id=$1',[unit]))[0];
    assert.equal(row.assignment_id,assignment);assert.equal(row.source_kind,'day');assert.equal(String(row.work_date).slice(0,10),dates.local_tomorrow);
    const link=(await rows('select payable_unit_id from public.assignment_work_sessions where id=$1',[session]))[0];assert.equal(link.payable_unit_id,unit);
  });
  await ok('daily payable recovery remains idempotent',async()=>assert.equal(await call('claim_work_payable',[assignment,dates.local_tomorrow,'Retry approved attendance recovery']),unit));
  await ok('future date without approved attendance remains rejected',async()=>assert.rejects(()=>call('claim_work_payable',[assignment,dates.no_evidence_day,'Unsupported future attendance recovery']),/Approved attendance required/));

  const migration=readFileSync('supabase/migrations/20261013000461_daily_payable_timezone_consistency.sql','utf8');
  await ok('corrective migration keeps UTC date gate only in fixed-assignment branch',async()=>{
    assert.match(migration,/if k='fixed' then[\s\S]*p_day>\(now\(\) at time zone 'UTC'\)::date/);
    assert.match(migration,/else[\s\S]*status='approved'/);
  });
  console.log(`${passed} 2.41.1 corrective regression checks passed`);
}finally{await db.close();}
