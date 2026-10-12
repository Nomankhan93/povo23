import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {schemaDb} from './schema-test-db.mjs';
import {acceptCollectionFixture} from './accepted-collection-fixture.mjs';

let passed=0;
async function ok(name,fn){await fn();passed++;console.log(`PASS ${name}`)}
const read=p=>readFileSync(p,'utf8');
const migrationName='20261013000590_data_integrity_reporting_consistency.sql';
const correctionMigrationName='20261013000600_data_integrity_reporting_security_fix.sql';
const migration=read(`supabase/migrations/${migrationName}`);
const correctionMigration=read(`supabase/migrations/${correctionMigrationName}`);
const packageJson=JSON.parse(read('package.json'));
const lock=JSON.parse(read('package-lock.json'));

await ok('2.43.0 release and migration are registered',async()=>{
  assert.equal(packageJson.version,'2.43.0');
  assert.equal(lock.version,'2.43.0');
  assert.equal(lock.packages[''].version,'2.43.0');
  assert.equal(packageJson.scripts['test:data-integrity-2430'],'node scripts/test-data-integrity2430.mjs');
  const migrations=readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort();
  assert.equal(migrations.length,89);
  assert.equal(migrations.at(-1),correctionMigrationName);
});

await ok('migration repairs survey review task vocabulary without widening task authority',async()=>{
  assert.match(migration,/new\.status in \('submitted','correction_required'\)/);
  assert.doesNotMatch(migration,/new\.status in \('submitted','correction_requested'\)/);
  assert.match(migration,/where sr\.status in \('submitted','correction_required'\)/);
  assert.doesNotMatch(migration,/can_read_operational_task|can_manage_operational_task/);
});

await ok('case reporting derives due date through a permission-safe helper with legacy fallback',async()=>{
  assert.match(correctionMigration,/create or replace function app_private\.analytics_case_due_on\(p_case uuid\)/);
  assert.match(correctionMigration,/security definer/);
  assert.match(correctionMigration,/if v_project is null or not app_private\.can_manage_project\(v_project\) then[\s\S]*return null/);
  assert.match(correctionMigration,/select min\(f\.due_on\)[\s\S]*f\.case_id=p_case[\s\S]*f\.status='scheduled'/);
  assert.match(correctionMigration,/c\.follow_up_on/);
  assert.match(correctionMigration,/language sql stable security invoker[\s\S]*app_private\.analytics_case_due_on\(a\.id\)/);
  assert.doesNotMatch(correctionMigration,/grant\s+select[\s\S]*beneficiary_case_followups/i);
});

await ok('work history waits for operational completion instead of collection closure',async()=>{
  assert.match(migration,/p\.project_closure_state/);
  assert.match(migration,/project_closure_state in \('operational_completed','financially_reconciled','fully_closed'\)/);
  assert.doesNotMatch(migration,/when b\.project_status='closed' and b\.submitted_surveys>0 then 'completed'/);
});

await ok('attendance, payable, recruitment and closure authorities are not redefined by 2.43.0',async()=>{
  for(const term of ['start_assignment_work_session','review_assignment_attendance','work_payable_statement','create_work_assignment','respond_work_assignment','advance_project_closure','project_payable_finance_reconciliation']){
    assert.doesNotMatch(migration,new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${term}`,'i'));
  }
});

const db=await schemaDb();
const ids={super:'a4300000-0000-4000-8000-000000000001',worker:'a4300000-0000-4000-8000-000000000002'};
const rows=async(q,p=[])=>(await db.query(q,p)).rows;
async function as(who){
  await db.exec('RESET ROLE');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who?ids[who]:'']);
  await db.exec(`SET ROLE ${who?'authenticated':'anon'}`);
}
async function call(name,args=[]){return (await rows(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args))[0].result}

try{
  for(const [name,id] of Object.entries(ids)) await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)',[id,`${name}@example.test`,JSON.stringify({full_name:name})]);
  await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.super]);
  await db.query("update public.volunteer_profiles set status='verified',details=jsonb_build_object('full_name','Integrity Worker') where user_id=$1",[ids.worker]);

  await as('super');
  const org=await call('save_organization',[null,{name:'2.43 Integrity NGO',status:'active'}]);
  const geo=await call('save_geography',[null,null,'province','2.43 Province','I430P','Integrity fixture',true]);
  const template=await call('publish_survey_template',['2.43 Integrity Template',[{id:'q',label:'Question',type:'text',required:true}]]);
  const dates=(await rows("select ((now() at time zone 'UTC')::date-2)::text start,((now() at time zone 'UTC')::date+20)::text finish,((now() at time zone 'UTC')::date)::text today,((now() at time zone 'UTC')::date+30)::text later"))[0];
  const project=await call('create_survey_project',[org,'2.43 Integrity Project',template,geo,10,dates.start,dates.finish,'Validate reporting and work-history integrity','v430','Consent notice for integrity regression fixture.']);

  await acceptCollectionFixture(db,project,ids.worker);
  await db.exec('RESET ROLE');
  const household=(await rows('insert into public.registry_households(project_id,label,geography_id,created_by) values($1,$2,$3,$4) returning id',[project,'Integrity household',geo,ids.worker]))[0].id;
  const person=(await rows('insert into public.registry_persons(project_id,household_id,full_name,birth_date,created_by) values($1,$2,$3,$4,$5) returning id',[project,household,'Integrity Person','1990-01-01',ids.worker]))[0].id;
  const approved=(await rows("insert into public.survey_responses(project_id,person_id,collector_id,answers,consent,status,review_note,reviewed_by,reviewed_at,collection_geography_id) values($1,$2,$3,$4::jsonb,$5::jsonb,'approved','Reviewed',$6,now(),$7) returning id",[project,person,ids.worker,JSON.stringify({q:'approved'}),JSON.stringify({agreed:true,method:'verbal'}),ids.super,geo]))[0].id;
  const review=(await rows("insert into public.survey_responses(project_id,person_id,collector_id,answers,consent,status,collection_geography_id) values($1,$2,$3,$4::jsonb,$5::jsonb,'submitted',$6) returning id",[project,person,ids.worker,JSON.stringify({q:'needs correction'}),JSON.stringify({agreed:true,method:'verbal'}),geo]))[0].id;

  await ok('correction-required survey response keeps an actionable review task',async()=>{
    let active=(await rows("select * from public.operational_tasks where task_type='survey_response_review' and source_ref=$1 and status in ('open','in_progress')",[review]))[0];
    assert.ok(active);
    await as('super');
    await call('review_survey_response',[review,'correction_required','Integrity fixture correction required',1]);
    active=(await rows("select * from public.operational_tasks where task_type='survey_response_review' and source_ref=$1 and status in ('open','in_progress') order by created_at desc limit 1",[review]))[0];
    assert.ok(active);
    assert.equal(active.metadata.response_status,'correction_required');
  });

  const caseId='b4300000-0000-4000-8000-000000000001';
  const followupId='c4300000-0000-4000-8000-000000000001';
  await db.exec('RESET ROLE');
  await db.query(`insert into public.beneficiary_cases(id,organization_id,project_id,person_id,source_response_id,source_response_version,geography_id,title,summary,priority,status,follow_up_on,identity_snapshot,last_reason,created_by,updated_by)
    values($1,$2,$3,$4,$5,1,$6,'Integrity case','Structured follow-up must drive operational due reporting','high','open',$7,'{}'::jsonb,'Integrity fixture case',$8,$8)`,[caseId,org,project,person,approved,geo,dates.later,ids.super]);
  await db.query(`insert into public.beneficiary_case_followups(id,case_id,organization_id,project_id,person_id,followup_type,due_on,status,last_reason,created_by,updated_by)
    values($1,$2,$3,$4,$5,'phone',$6,'scheduled','Integrity scheduled follow-up',$7,$7)`,[followupId,caseId,org,project,person,dates.today,ids.super]);

  await ok('case due helper preserves protected follow-up-table authority',async()=>{
    await db.exec('RESET ROLE');
    const privilege=(await rows("select has_table_privilege('authenticated','public.beneficiary_case_followups','SELECT') allowed"))[0];
    assert.equal(privilege.allowed,false);
    const helper=(await rows("select p.prosecdef,c.relrowsecurity from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_class c where n.nspname='app_private' and p.proname='analytics_case_due_on' and c.oid='public.beneficiary_case_followups'::regclass"))[0];
    assert.equal(helper.prosecdef,true);
    assert.equal(helper.relrowsecurity,true);
    const analytics=(await rows("select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and p.proname='analytics_rows' and pg_get_function_identity_arguments(p.oid)='p_org uuid, p_project uuid, p_geo uuid, p_from date, p_to date'"))[0];
    assert.equal(analytics.prosecdef,false);
    await as('worker');
    const hidden=(await rows('select app_private.analytics_case_due_on($1) due',[caseId]))[0];
    assert.equal(hidden.due,null);
    await as('super');
    const visible=(await rows('select app_private.analytics_case_due_on($1)::text due',[caseId]))[0];
    assert.equal(visible.due,dates.today);
  });

  await ok('operational due-case reporting follows structured scheduled follow-up dates',async()=>{
    await as('super');
    const due=await call('operational_report',[org,project,null,null,null,'cases','__due',0,false]);
    assert.equal(due.total,1);
    assert.equal(due.rows[0].id,caseId);
    assert.equal(String(due.rows[0].due_on).slice(0,10),dates.today);
    await as('super');
    await call('cancel_beneficiary_case_followup',[followupId,'Cancelled integrity fixture follow-up',1]);
    const after=await call('operational_report',[org,project,null,null,null,'cases','__due',0,false]);
    assert.equal(after.total,0);
  });

  await ok('collection closure does not fabricate completion before operational completion',async()=>{
    await as('worker');
    let history=await call('work_experience_history',[ids.worker,0]);
    let item=history.rows.find(row=>row.id===project);
    assert.equal(item.source_kind,'workforce_assignment');
    assert.equal(item.workflow_status,'in_progress');
    assert.equal(item.verified,true);
    await db.exec('RESET ROLE');
    await db.query("update public.survey_projects set status='closed',project_closure_state='collection_closed',collection_closed_at=now() where id=$1",[project]);
    await as('worker');
    history=await call('work_experience_history',[ids.worker,0]);
    item=history.rows.find(row=>row.id===project);
    // The existing project-close trigger cancels active workforce assignments.
    // The 2.43.0 contract is that collection closure must not promote this to completed.
    assert.equal(item.workflow_status,'cancelled');
    assert.notEqual(item.workflow_status,'completed');
    assert.equal(item.verified,true);
    assert.ok(item.end_date);
    await db.exec('RESET ROLE');
    await db.query("update public.survey_projects set project_closure_state='operational_completed',operational_completed_at=now() where id=$1",[project]);
    await as('worker');
    history=await call('work_experience_history',[ids.worker,0]);
    item=history.rows.find(row=>row.id===project);
    assert.equal(item.workflow_status,'completed');
    assert.ok(item.end_date);
  });

  await ok('closed project remains reportable for historical response and case facts',async()=>{
    await as('super');
    const responses=await call('operational_report',[org,project,null,null,null,'responses',null,0,false]);
    const cases=await call('operational_report',[org,project,null,null,null,'cases',null,0,false]);
    assert.ok(responses.total>=2);
    assert.equal(cases.total,1);
  });

  console.log(`\n${passed} FieldLance 2.43.0 data-integrity scenarios passed.`);
}finally{
  await db.close();
}
