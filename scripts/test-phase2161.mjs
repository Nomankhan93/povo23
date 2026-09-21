import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { schemaDb } from './schema-test-db.mjs';

const db = await schemaDb();
let passed = 0;
const ids = Object.fromEntries(
  ['super','ngo','manager','focal','collector'].map((name,i)=>[
    name,`a1610000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,
  ]),
);
const rows = async (q,p=[]) => (await db.query(q,p)).rows;
async function as(name){
  await db.exec('RESET ROLE');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[name ? ids[name] : '']);
  await db.exec(`SET ROLE ${name ? 'authenticated' : 'anon'}`);
}
async function call(name,args){
  return (await rows(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args))[0].result;
}
async function ok(name,fn){await fn();passed+=1;console.log(`PASS ${name}`)}
const deny=(fn,re=/permission|required|immutable|legacy|management|admin/i)=>assert.rejects(fn,re);

try{
  for(const [name,id] of Object.entries(ids)) await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${name}@example.test`]);
  await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.super]);
  await as('super');

  const org=await call('save_organization',[null,{name:'2.16.1 Compensation NGO',status:'active'}]);
  await call('set_membership',[org,ids.ngo,'ngo_admin','active']);
  await call('set_membership',[org,ids.manager,'member','active']);
  await call('set_membership',[org,ids.focal,'member','active']);

  const province=await call('save_geography',[null,null,'province','2.16.1 Province','A161P','Fixture',true]);
  const division=await call('save_geography',[null,province,'division','2.16.1 Division','A161D','Fixture',true]);
  const district=await call('save_geography',[null,division,'district','2.16.1 District','A161X','Fixture',true]);
  const taluka=await call('save_geography',[null,district,'taluka','2.16.1 Taluka','A161T','Fixture',true]);

  await db.exec('RESET ROLE');
  await db.query(
    "update public.volunteer_profiles set status='verified',geography_id=$1,details=jsonb_build_object('full_name',$2::text,'skills','Survey, Data Collection','languages','Urdu','availability','Full-time'),version=version+1 where user_id=$3",
    [taluka,'Compensation Collector',ids.collector],
  );

  await as('super');
  const template=await call('publish_survey_template',['2.16.1 Compensation Template',[{id:'q',label:'Question',type:'text',required:true}]]);
  const dates=(await rows("select ((now() at time zone 'UTC')::date-1)::text start,((now() at time zone 'UTC')::date+30)::text finish,((now() at time zone 'UTC')::date+1)::text opp_start,((now() at time zone 'UTC')::date+10)::text opp_end,(now()+interval '1 day')::text reply,current_date::text today"))[0];
  const project=await call('create_survey_project',[org,'2.16.1 Paid Field Project',template,district,10,dates.start,dates.finish,'Validate project compensation defaults and immutable assignment snapshots','v1','Explain the project and obtain informed consent before collecting survey data.']);

  await as('ngo');
  await call('assign_project_staff',[project,ids.manager,'project_manager',[],dates.today,null]);
  await call('assign_project_staff',[project,ids.focal,'area_focal_person',[taluka],dates.today,null]);
  let recruitment=await call('project_recruitment_status',[project]);
  await call('set_project_recruitment_plan',[project,10,3,'open','Configure compensation test recruitment capacity',recruitment.version]);

  let compensation;
  await ok('compensation defaults are project configuration; NGO Admin can change them while Project Manager is read-only and focal has no global access',async()=>{
    await as('ngo');
    compensation=await call('project_compensation_status',[project]);
    assert.equal(compensation.work_mode,'volunteer');
    assert.equal(compensation.compensation_type,'none');
    assert.equal(compensation.currency,'PKR');
    assert.equal(compensation.rate,null);
    assert.equal(compensation.can_change,true);
    const v=await call('set_project_compensation_defaults',[project,'paid','per_verified_survey','PKR',75.50,'PKR 75.50 for each independently approved survey','Enable paid per-survey field collection',compensation.version]);
    assert.ok(v>compensation.version);
    await as('manager');
    compensation=await call('project_compensation_status',[project]);
    assert.equal(compensation.rate,75.5);
    assert.equal(compensation.can_change,false);
    await deny(()=>call('set_project_compensation_defaults',[project,'paid','per_verified_survey','PKR',80,'Manager cannot change financial commitment','Attempt unauthorized rate change',compensation.version]),/NGO Admin|survey-management/i);
    await as('focal');
    await deny(()=>call('project_compensation_status',[project]),/Project management permission required/i);
  });

  let opportunityA;
  await ok('new recruitment opportunity snapshots authoritative project compensation instead of trusting legacy caller payment fields',async()=>{
    await as('manager');
    opportunityA=await call('create_recruitment_opportunity',[project,'Paid Survey Recruitment','Recruit a survey collector under structured project compensation',taluka,dates.opp_start,dates.opp_end,dates.reply,'unpaid','Caller tries legacy unpaid terms',1,'Survey','Urdu','all','Available during project dates',true]);
    const o=(await rows('select * from public.work_opportunities where id=$1',[opportunityA]))[0];
    assert.equal(o.payment_type,'paid');
    assert.equal(o.work_mode,'paid');
    assert.equal(o.compensation_type,'per_verified_survey');
    assert.equal(Number(o.rate),75.5);
    assert.equal(o.currency,'PKR');
    assert.equal(o.compensation_snapshot_version,2);
    assert.match(o.payment_note,/75\.50|75\.5/);
    await as('ngo');
    const legacy=await call('create_project_opportunity',[project,'Legacy RPC Structured Terms','Legacy RPC must still inherit structured project compensation',taluka,dates.opp_start,dates.opp_end,dates.reply,'unpaid','Caller legacy note',1,'Survey','Urdu']);
    const legacyRow=(await rows('select work_mode,compensation_type,currency,rate,compensation_snapshot_version from public.work_opportunities where id=$1',[legacy]))[0];
    assert.equal(legacyRow.work_mode,'paid');
    assert.equal(legacyRow.compensation_type,'per_verified_survey');
    assert.equal(legacyRow.currency,'PKR');
    assert.equal(Number(legacyRow.rate),75.5);
    assert.equal(legacyRow.compensation_snapshot_version,2);
  });

  let opportunityB;
  await ok('later project-rate change leaves existing opportunity immutable and only future opportunities inherit the new version',async()=>{
    await as('ngo');
    compensation=await call('project_compensation_status',[project]);
    await call('set_project_compensation_defaults',[project,'paid','per_verified_survey','PKR',90,'PKR 90 for each independently approved survey','Raise rate for future recruitment only',compensation.version]);
    let old=(await rows('select rate,compensation_snapshot_version from public.work_opportunities where id=$1',[opportunityA]))[0];
    assert.equal(Number(old.rate),75.5);
    assert.equal(old.compensation_snapshot_version,2);
    await as('manager');
    opportunityB=await call('create_recruitment_opportunity',[project,'Future Rate Recruitment','Recruit future collectors under the revised project compensation',taluka,dates.opp_start,dates.opp_end,dates.reply,'paid','Caller note is not authoritative',1,'Survey','Urdu','all','Future field recruitment',false]);
    const fresh=(await rows('select rate,compensation_snapshot_version from public.work_opportunities where id=$1',[opportunityB]))[0];
    assert.equal(Number(fresh.rate),90);
    assert.equal(fresh.compensation_snapshot_version,3);
  });

  let application;let assignment;
  await ok('formal assignment copies the selected opportunity snapshot and ignores caller-supplied compensation overrides',async()=>{
    await as('collector');
    application=await call('apply_work_opportunity',[opportunityA,'Available throughout the field period','Interested in this paid field assignment',true]);
    await as('manager');
    const a=(await rows('select version from public.work_applications where id=$1',[application]))[0];
    await call('review_work_application',[application,'selected','Selected for formal paid assignment',a.version]);
    assignment=await call('create_work_assignment',[project,ids.collector,'application',application,'volunteer','none','USD',null,5,dates.start,dates.opp_end,'Collect assigned surveys according to consent and data-quality rules.']);
    const w=(await rows('select * from public.work_assignments where id=$1',[assignment]))[0];
    assert.equal(w.work_mode,'paid');
    assert.equal(w.compensation_type,'per_verified_survey');
    assert.equal(w.currency,'PKR');
    assert.equal(Number(w.rate),75.5);
    assert.equal(w.compensation_source,'opportunity_snapshot');
    assert.equal(w.compensation_source_version,2);
    assert.match(w.compensation_note_snapshot,/75\.50/);
  });

  await ok('assignment compensation is immutable once offered and volunteer acceptance confirms the frozen contract',async()=>{
    await db.exec('RESET ROLE');
    await assert.rejects(()=>db.query('update public.work_assignments set rate=999 where id=$1',[assignment]),/immutable|Contract terms/i);
    await as('collector');
    const w=(await rows('select version,status from public.work_assignments where id=$1',[assignment]))[0];
    await call('respond_work_assignment',[assignment,'accepted',w.version]);
    const active=(await rows('select status,rate,currency from public.work_assignments where id=$1',[assignment]))[0];
    assert.equal(active.status,'active');
    assert.equal(Number(active.rate),75.5);
    assert.equal(active.currency,'PKR');
  });

  let response;
  await ok('approved response creates one payable unit from the immutable assignment snapshot and reconciliation remains idempotent',async()=>{
    await as('collector');
    response=await call('save_survey_response',[null,project,null,null,'Paid Survey Person','2010-01-01','Paid Survey Household',{q:'Answer'},{agreed:true,method:'verbal',representative:'Guardian',relationship:'Guardian'},true,0,crypto.randomUUID()]);
    await as('manager');
    await call('review_survey_response',[response,'approved','Approved paid response',1]);
    await db.exec('RESET ROLE');
    let units=await rows('select assignment_id,response_id,rate,currency,terms_snapshot from public.work_payable_units where response_id=$1',[response]);
    assert.equal(units.length,1);
    assert.equal(units[0].assignment_id,assignment);
    assert.equal(Number(units[0].rate),75.5);
    assert.equal(units[0].currency,'PKR');
    assert.equal(units[0].terms_snapshot.compensation_source,'opportunity_snapshot');
    assert.equal(units[0].terms_snapshot.compensation_source_version,2);
    await as('ngo');
    const first=await call('reconcile_survey_payable',[response]);
    const second=await call('reconcile_survey_payable',[response]);
    assert.equal(first,second);
    await db.exec('RESET ROLE');
    units=await rows('select id from public.work_payable_units where response_id=$1',[response]);
    assert.equal(units.length,1);
  });

  await ok('existing payable engine remains authoritative and 2.16.1 does not create a second accounting system',async()=>{
    const migration=readFileSync('supabase/migrations/20261008000400_project_compensation_assignment_contract.sql','utf8');
    assert.doesNotMatch(migration,/create table public\.work_payable_units/i);
    assert.doesNotMatch(migration,/create table public\.work_payable_events/i);
    assert.doesNotMatch(migration,/create or replace function app_private\.sync_survey_payable/i);
    assert.match(migration,/create or replace function app_private\.payable_snapshot/);
    const unique=(await rows("select count(*)::int c from pg_indexes where schemaname='public' and tablename='work_payable_units' and indexdef ilike '%response_id%'"))[0].c;
    assert.ok(unique>=1);
  });

  await ok('2.16.1 UI exposes project defaults and removes free-form compensation editing from formal assignment offers',async()=>{
    const projectUi=readFileSync('src/features/projects/ProjectTeamWorkspace.tsx','utf8');
    const workforce=readFileSync('src/features/workforce/WorkforceMarketplace.tsx','utf8');
    assert.match(projectUi,/COMPENSATION DEFAULTS/);
    assert.match(projectUi,/set_project_compensation_defaults/);
    assert.match(projectUi,/Existing published opportunities, assignment contracts and payable units keep their original terms/);
    assert.match(workforce,/Compensation is inherited from the recruitment opportunity snapshot/);
    assert.match(workforce,/Contract compensation:/);
    assert.doesNotMatch(workforce,/name="compensation"/);
    assert.doesNotMatch(workforce,/name="rate"/);
    assert.match(workforce,/compensation_source_version/);
  });

  console.log(`\n${passed} POEM 2.16.1 compensation / assignment-contract scenarios passed.`);
} finally {
  await db.close();
}
