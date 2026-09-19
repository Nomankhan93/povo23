import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {schemaDb} from './schema-test-db.mjs';

const previousHead='20261009000110_beneficiary_case_request_stabilization.sql';
const db=await schemaDb(previousHead);
let passed=0;
const ids=Object.fromEntries(['super','ngo','pm','focal','collector','otherngo'].map((name,i)=>[name,`a1910000-0000-4000-8000-${String(i+1).padStart(12,'0')}`]));
const rows=async(q,p=[])=>(await db.query(q,p)).rows;
async function as(name){await db.exec('RESET ROLE');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[name?ids[name]:'']);await db.exec(`SET ROLE ${name?'authenticated':'anon'}`)}
async function call(name,args=[]){return (await rows(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args))[0].result}
async function ok(name,fn){await fn();passed+=1;console.log(`PASS ${name}`)}
const deny=(fn,re=/permission|required|approved|active|distribution|changed|schedule|case|request|cancel|status/i)=>assert.rejects(fn,re);
const cid=n=>`b1910000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const rid=n=>`c1910000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const nid=n=>`d1910000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const pid=n=>`e1910000-0000-4000-8000-${String(n).padStart(12,'0')}`;

try{
  for(const [name,id] of Object.entries(ids))await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)',[id,`${name}@example.test`,JSON.stringify({full_name:name.toUpperCase()})]);
  await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.super]);
  await as('super');
  const org=await call('save_organization',[null,{name:'2.19.1 Distribution NGO',status:'active'}]);
  const otherOrg=await call('save_organization',[null,{name:'2.19.1 Other NGO',status:'active'}]);
  await call('set_membership',[org,ids.ngo,'ngo_admin','active']);
  await call('set_membership',[org,ids.pm,'member','active']);
  await call('set_membership',[org,ids.focal,'member','active']);
  await call('set_membership',[otherOrg,ids.otherngo,'ngo_admin','active']);
  const geo=await call('save_geography',[null,null,'province','2.19.1 Province','A191P','Distribution fixture',true]);
  const template=await call('publish_survey_template',['2.19.1 Distribution Template',[{id:'need',label:'Need',type:'text',required:true}]]);
  const dates=(await rows("select ((now() at time zone 'UTC')::date-1)::text start,((now() at time zone 'UTC')::date+30)::text finish,current_date::text today,((now() at time zone 'UTC')::date+7)::text followup,(now()+interval '2 day')::text schedule_start,(now()+interval '2 day 2 hour')::text schedule_end"))[0];
  const project=await call('create_survey_project',[org,'2.19.1 Distribution Project',template,geo,50,dates.start,dates.finish,'Plan approved beneficiary assistance','v1','Explain assistance coordination and obtain consent.']);

  await as('ngo');
  await call('assign_project_staff',[project,ids.pm,'project_manager',[],dates.start,dates.finish]);
  await call('assign_project_staff',[project,ids.focal,'area_focal_person',[geo],dates.start,dates.finish]);

  await db.exec('RESET ROLE');
  const household=(await rows('insert into public.registry_households(project_id,label,geography_id,created_by) values($1,$2,$3,$4) returning id',[project,'Distribution Household',geo,ids.collector]))[0].id;
  const person=(await rows('insert into public.registry_persons(project_id,household_id,full_name,birth_date,created_by) values($1,$2,$3,$4,$5) returning *',[project,household,'Saira Distribution','1988-08-08',ids.collector]))[0];
  const response=(await rows("insert into public.survey_responses(project_id,person_id,collector_id,answers,consent,status,review_note,reviewed_by,reviewed_at,collection_geography_id) values($1,$2,$3,$4::jsonb,$5::jsonb,'approved',$6,$7,now(),$8) returning *",[project,person.id,ids.collector,JSON.stringify({need:'food'}),JSON.stringify({agreed:true,method:'verbal'}),'Approved distribution source',ids.ngo,geo]))[0];

  await as('ngo');
  await call('create_beneficiary_need',[nid(1),response.id,'food','Household needs food support for one month','high',dates.followup,'Approved household assessment']);
  await call('record_assistance',[rid(99),person.id,'goods','education','Historic school support','Previously delivered school materials',null,1,'kit',dates.today,'Historic donor','Receipt PRE-2191',null]);

  await as('pm');
  await call('create_beneficiary_case',[cid(1),person.id,response.id,nid(1),'Food distribution case','Coordinate approved household food assistance','high',dates.followup,'Open from approved household assessment']);
  await call('create_assistance_request',[rid(1),cid(1),nid(1),'goods','food','Monthly food basket','Provide one monthly food basket',null,1,'basket','high',dates.followup]);
  let d=await call('beneficiary_case_detail',[cid(1)]);let r=d.requests.find(x=>x.id===rid(1));
  await call('submit_assistance_request',[rid(1),'Submit food basket request for NGO approval',r.version]);
  d=await call('beneficiary_case_detail',[cid(1)]);r=d.requests.find(x=>x.id===rid(1));
  await as('ngo');
  await call('review_assistance_request',[rid(1),'approve','Approved for controlled distribution planning',r.version]);

  const approvedBefore=(await rows('select * from public.assistance_requests where id=$1',[rid(1)]))[0];
  const historicBefore=(await rows('select * from public.assistance_entries where id=$1',[rid(99)]))[0];

  await db.exec('RESET ROLE');
  await db.exec(readFileSync('supabase/migrations/20261009000200_assistance_distribution_planning.sql','utf8'));

  await ok('upgrade preserves approved requests and delivered assistance without inferring distribution plans',async()=>{
    assert.deepEqual((await rows('select * from public.assistance_requests where id=$1',[rid(1)]))[0],approvedBefore);
    assert.deepEqual((await rows('select * from public.assistance_entries where id=$1',[rid(99)]))[0],historicBefore);
    assert.equal((await rows('select count(*)::int c from public.assistance_distribution_plans'))[0].c,0);
  });

  await ok('only an approved request can create a distribution plan',async()=>{
    await as('pm');
    await call('create_assistance_request',[rid(2),cid(1),nid(1),'service','food','Nutrition counselling','Arrange household nutrition counselling',null,1,'session','medium',dates.followup]);
    await deny(()=>call('create_assistance_distribution_plan',[pid(2),rid(2),'service_referral','Health desk','Case team','Coordinate appointment with service provider','Draft request must not enter planning']),/approved assistance request/i);
  });

  await ok('project manager can create a plan while area focal and another NGO remain outside planning authority',async()=>{
    await as('focal');
    await deny(()=>call('create_assistance_distribution_plan',[pid(1),rid(1),'distribution_site','UC relief point','Field Team A','Verify beneficiary and approved request before handover','Prepare approved request for distribution']),/permission/i);
    await as('otherngo');
    await deny(()=>call('create_assistance_distribution_plan',[pid(1),rid(1),'distribution_site','UC relief point','Field Team A','Verify beneficiary and approved request before handover','Prepare approved request for distribution']),/permission/i);
    await as('pm');
    assert.equal(await call('create_assistance_distribution_plan',[pid(1),rid(1),'distribution_site','UC relief point','Field Team A','Verify beneficiary and approved request before handover','Prepare approved request for distribution']),pid(1));
    const plan=(await rows('select * from public.assistance_distribution_plans where id=$1',[pid(1)]))[0];
    assert.equal(plan.status,'draft');
    assert.equal(plan.request_version,approvedBefore.version);
    assert.equal(plan.request_snapshot.status,'approved');
    assert.equal(plan.geography_id,geo);
  });

  await ok('plan creation is idempotent and one approved request has at most one active plan',async()=>{
    await as('pm');
    assert.equal(await call('create_assistance_distribution_plan',[pid(1),rid(1),'distribution_site','UC relief point','Field Team A','Verify beneficiary and approved request before handover','Prepare approved request for distribution']),pid(1));
    await deny(()=>call('create_assistance_distribution_plan',[pid(1),rid(1),'home_delivery','Home route','Field Team A','Different replay details should fail','Different replay details should fail']),/different details/i);
    await deny(()=>call('create_assistance_distribution_plan',[pid(3),rid(1),'distribution_site','Second venue','Field Team B','Duplicate active plan should not be created','Attempt duplicate active planning']),/active distribution plan/i);
  });

  await ok('draft/scheduled plan edits use optimistic versions and immutable revision history',async()=>{
    await as('pm');
    let plan=(await rows('select * from public.assistance_distribution_plans where id=$1',[pid(1)]))[0];
    await call('update_assistance_distribution_plan',[pid(1),'distribution_site','UC Community Hall','Field Team A','Verify identity, request and basket count before handover','Move venue to larger community hall',plan.version]);
    plan=(await rows('select * from public.assistance_distribution_plans where id=$1',[pid(1)]))[0];
    assert.equal(plan.location_label,'UC Community Hall');
    assert.equal(plan.version,2);
    assert.equal((await rows('select count(*)::int c from public.assistance_distribution_plan_revisions where plan_id=$1',[pid(1)]))[0].c,2);
    await deny(()=>call('update_assistance_distribution_plan',[pid(1),'distribution_site','Stale venue','Field Team A','Stale update should not overwrite current plan','Stale version attempt',1]),/changed/i);
  });

  await ok('distribution queue is scoped and reports approved requests awaiting planning separately',async()=>{
    await as('pm');
    const q=await call('assistance_distribution_plan_queue',[org,project,null,100]);
    assert.equal(q.rows.length,1);
    assert.equal(q.rows[0].id,pid(1));
    assert.equal(q.summary.draft,1);
    assert.equal(q.summary.awaiting_plan,0);
    await as('focal');
    await deny(()=>call('assistance_distribution_plan_queue',[org,project,null,100]),/permission/i);
    await as('otherngo');
    assert.equal((await rows('select * from public.assistance_distribution_plans')).length,0);
  });

  await ok('schedule validation rejects invalid windows and scheduling records a controlled plan state',async()=>{
    await as('pm');
    let plan=(await rows('select * from public.assistance_distribution_plans where id=$1',[pid(1)]))[0];
    await deny(()=>call('schedule_assistance_distribution_plan',[pid(1),dates.schedule_end,dates.schedule_start,'End before start must fail',plan.version]),/Valid distribution schedule/i);
    await call('schedule_assistance_distribution_plan',[pid(1),dates.schedule_start,dates.schedule_end,'Schedule approved food basket distribution',plan.version]);
    plan=(await rows('select * from public.assistance_distribution_plans where id=$1',[pid(1)]))[0];
    assert.equal(plan.status,'scheduled');
    assert.equal(plan.scheduled_by,ids.pm);
    assert.ok(plan.scheduled_start);
  });

  await ok('an on-hold case blocks readiness until the case is reopened',async()=>{
    await as('pm');
    let detail=await call('beneficiary_case_detail',[cid(1)]);
    await call('update_beneficiary_case',[cid(1),detail.case.title,detail.case.summary,detail.case.priority,'on_hold',detail.case.follow_up_on,'Pause case while distribution logistics are reviewed',detail.case.version]);
    let plan=(await rows('select * from public.assistance_distribution_plans where id=$1',[pid(1)]))[0];
    await deny(()=>call('mark_assistance_distribution_plan_ready',[pid(1),'Attempt readiness while case is paused',plan.version]),/case must be open/i);
    detail=await call('beneficiary_case_detail',[cid(1)]);
    await call('update_beneficiary_case',[cid(1),detail.case.title,detail.case.summary,detail.case.priority,'open',detail.case.follow_up_on,'Reopen after logistics review completed',detail.case.version]);
    plan=(await rows('select * from public.assistance_distribution_plans where id=$1',[pid(1)]))[0];
    await call('mark_assistance_distribution_plan_ready',[pid(1),'Team and venue confirmed for planned distribution',plan.version]);
    assert.equal((await rows('select status from public.assistance_distribution_plans where id=$1',[pid(1)]))[0].status,'ready');
  });

  await ok('active distribution plan blocks cancellation of its approved request',async()=>{
    await as('ngo');
    const request=(await rows('select * from public.assistance_requests where id=$1',[rid(1)]))[0];
    await deny(()=>call('cancel_assistance_request',[rid(1),'Attempt request cancellation with active plan',request.version]),/Cancel the active distribution plan/i);
    assert.equal((await rows('select status from public.assistance_requests where id=$1',[rid(1)]))[0].status,'approved');
  });

  await ok('cancelling a plan preserves history and allows one replacement while request remains approved',async()=>{
    await as('pm');
    let plan=(await rows('select * from public.assistance_distribution_plans where id=$1',[pid(1)]))[0];
    await call('cancel_assistance_distribution_plan',[pid(1),'Venue unavailable; replace with a new operational plan',plan.version]);
    plan=(await rows('select * from public.assistance_distribution_plans where id=$1',[pid(1)]))[0];
    assert.equal(plan.status,'cancelled');
    assert.equal(plan.cancellation_reason,'Venue unavailable; replace with a new operational plan');
    assert.equal(await call('create_assistance_distribution_plan',[pid(4),rid(1),'home_delivery','Beneficiary household route','Field Team B','Verify beneficiary before home delivery and record delivery later','Replace cancelled venue plan with home-delivery plan']),pid(4));
    assert.equal((await rows("select count(*)::int c from public.assistance_distribution_plans where request_id=$1 and status<>'cancelled'",[rid(1)]))[0].c,1);
    assert.equal((await rows('select count(*)::int c from public.assistance_distribution_plans where request_id=$1',[rid(1)]))[0].c,2);
  });

  await ok('after every active plan is cancelled an authorized reviewer may cancel the approved request',async()=>{
    await as('pm');
    let replacement=(await rows('select * from public.assistance_distribution_plans where id=$1',[pid(4)]))[0];
    await call('cancel_assistance_distribution_plan',[pid(4),'Beneficiary requested planning cancellation before delivery',replacement.version]);
    await as('ngo');
    const request=(await rows('select * from public.assistance_requests where id=$1',[rid(1)]))[0];
    await call('cancel_assistance_request',[rid(1),'Approved request cancelled after all plans were cancelled',request.version]);
    assert.equal((await rows('select status from public.assistance_requests where id=$1',[rid(1)]))[0].status,'cancelled');
  });

  await ok('planning never creates or mutates delivered assistance records',async()=>{
    assert.deepEqual((await rows('select * from public.assistance_entries where id=$1',[rid(99)]))[0],historicBefore);
    assert.equal((await rows('select count(*)::int c from public.assistance_entries where person_id=$1',[person.id]))[0].c,1);
  });

  await ok('migration remains planning-only and does not couple beneficiary plans to worker payment or finance tables',async()=>{
    const migration=readFileSync('supabase/migrations/20261009000200_assistance_distribution_planning.sql','utf8');
    assert.doesNotMatch(migration,/insert\s+into\s+public\.assistance_entries/i);
    assert.doesNotMatch(migration,/public\.(work_payable_(units|events|receipts)|finance_(accounts|journals|postings)|payment_wallets|withdrawal_requests)/i);
    assert.match(migration,/approved assistance request can be planned/i);
  });

  await ok('case detail and frontend expose plans without claiming delivery',async()=>{
    await as('pm');
    const detail=await call('beneficiary_case_detail',[cid(1)]);
    assert.equal(detail.distribution_plans.length,2);
    const ui=readFileSync('src/features/cases/BeneficiaryCasesWorkspace.tsx','utf8');
    assert.match(ui,/Approved request → plan → schedule → ready/);
    assert.match(ui,/does not record delivery or create an assistance ledger entry/i);
    assert.match(ui,/mark_assistance_distribution_plan_ready/);
    assert.match(ui,/Cancel the active distribution plan before cancelling this approved request/);
  });

  await ok('direct writes and anonymous planning access remain denied',async()=>{
    await as('pm');
    for(const table of ['assistance_distribution_plans','assistance_distribution_plan_revisions'])await deny(()=>db.query(`delete from public.${table}`),/permission denied/i);
    await as(null);
    await deny(()=>db.query('select * from public.assistance_distribution_plans'),/permission denied/i);
    await deny(()=>call('assistance_distribution_plan_queue',[null,null,null,100]));
    await deny(()=>call('create_assistance_distribution_plan',[pid(9),rid(1),'other','Unknown','Unknown','Anonymous planning attempt','Anonymous planning attempt']));
  });

  console.log(`\n${passed} POEM 2.19.1 assistance distribution planning scenarios passed.`);
}finally{await db.close()}
