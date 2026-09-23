import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { schemaDb } from './schema-test-db.mjs';

const db = await schemaDb();
let passed = 0;
const ids = Object.fromEntries(
  ['super','ngo','manager','focal','collector'].map((name,i)=>[
    name,`a1720000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,
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
const deny=(fn,re=/permission|required|reserved|fund|finance|access|immutable|reconciliation/i)=>assert.rejects(fn,re);

try{
  for(const [name,id] of Object.entries(ids)) await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${name}@example.test`]);
  await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.super]);
  await as('super');

  const org=await call('save_organization',[null,{name:'2.17.2 Finance Bridge NGO',status:'active'}]);
  await call('set_membership',[org,ids.ngo,'ngo_admin','active']);
  await call('set_membership',[org,ids.manager,'member','active']);
  await call('set_membership',[org,ids.focal,'member','active']);

  const province=await call('save_geography',[null,null,'province','2.17.2 Province','A172P','Fixture',true]);
  const division=await call('save_geography',[null,province,'division','2.17.2 Division','A172D','Fixture',true]);
  const district=await call('save_geography',[null,division,'district','2.17.2 District','A172X','Fixture',true]);
  const taluka=await call('save_geography',[null,district,'taluka','2.17.2 Taluka','A172T','Fixture',true]);

  await db.exec('RESET ROLE');
  await db.query(
    "update public.volunteer_profiles set status='verified',geography_id=$1,details=jsonb_build_object('full_name',$2::text,'skills','Survey, Data Collection','languages','Urdu','availability','Full-time'),version=version+1 where user_id=$3",
    [taluka,'Finance Bridge Collector',ids.collector],
  );

  await as('super');
  const template=await call('publish_survey_template',['2.17.2 Bridge Template',[{id:'q',label:'Question',type:'text',required:true}]]);
  const dates=(await rows("select ((now() at time zone 'UTC')::date-1)::text start,((now() at time zone 'UTC')::date+30)::text finish,((now() at time zone 'UTC')::date+1)::text opp_start,((now() at time zone 'UTC')::date+11)::text opp_end,(now()+interval '1 day')::text reply,current_date::text today"))[0];
  const project=await call('create_survey_project',[org,'2.17.2 Paid Project',template,district,20,dates.start,dates.finish,'Validate payable to finance bridge and reconciliation','v1','Explain the project and obtain informed consent before field work.']);

  await as('ngo');
  await call('assign_project_staff',[project,ids.manager,'project_manager',[],dates.today,null]);
  await call('assign_project_staff',[project,ids.focal,'area_focal_person',[taluka],dates.today,null]);
  let recruitment=await call('project_recruitment_status',[project]);
  await call('set_project_recruitment_plan',[project,20,1,'open','Configure finance bridge recruitment',recruitment.version]);
  let compensation=await call('project_compensation_status',[project]);
  await call('set_project_compensation_defaults',[project,'paid','daily_rate','PKR',100,'PKR 100 approved daily field-work rate','Enable paid daily work for bridge test',compensation.version]);

  await as('collector');

  const marketplace=await call(
    'available_work_opportunities',
    [0,org,null,'paid','',null,null],
  );

  const automaticOpportunity=marketplace.rows.find(
    row =>
      row.survey_project_id===project &&
      row.marketplace_origin==='project_auto'
  );

  assert(automaticOpportunity);

  const opportunity=automaticOpportunity.id;
  const application=await call('apply_work_opportunity',[opportunity,'Available throughout the assignment','Finance bridge test application',true]);
  await as('manager');
  const applicationRow=(await rows('select version from public.work_applications where id=$1',[application]))[0];
  await call('review_work_application',[application,'selected','Selected for finance bridge test',applicationRow.version]);
  const assignment=await call('create_work_assignment',[project,ids.collector,'application',application,'volunteer','none','USD',null,10,dates.start,dates.finish,'Perform approved field work under the accepted daily-rate contract.']);
  await as('collector');
  const offered=(await rows('select version from public.work_assignments where id=$1',[assignment]))[0];
  await call('respond_work_assignment',[assignment,'accepted',offered.version]);
  const attendanceTimes=(await rows(
    "select now()::text start,(now()+interval '1 second')::text finish"
  ))[0];

  await as('collector');

  const attendanceStarted=await call('start_assignment_work_session',[
    assignment,
    attendanceTimes.start,
    24.8607,
    67.0011,
    20,
    'granted',
    '',
    crypto.randomUUID()
  ]);

  const attendanceSubmitted=await call('checkout_assignment_work_session',[
    attendanceStarted.id,
    attendanceTimes.finish,
    24.8610,
    67.0020,
    25,
    'granted',
    '',
    'Completed documented field work for finance bridge validation.',
    crypto.randomUUID(),
    attendanceStarted.version
  ]);

  await as('manager');

  const attendanceApproved=await call('review_attendance_session',[
    attendanceStarted.id,
    'approve',
    'Verified attendance for finance bridge validation.',
    attendanceSubmitted.version
  ]);

  assert.ok(attendanceApproved.payable_unit_id);

  const unit=attendanceApproved.payable_unit_id;

  await ok('payable finance bridge surfaces are immutable finance-only reconciliation metadata',async()=>{
    await as('ngo');
    assert.equal((await rows('select count(*)::int c from public.finance_payable_event_links'))[0].c,0);
    await deny(()=>db.query("insert into public.finance_payable_event_links(event_id,unit_id,assignment_id,organization_id,project_id,currency,event_kind,bridge_status,approved_before,approved_after,paid_before,paid_after,committed_before,committed_after,spent_before,spent_after) values(gen_random_uuid(),$1,$2,$3,$4,'PKR','accrual','no_movement',0,0,0,0,0,0,0,0)",[unit,assignment,org,project]),/permission/i);
    await as('manager');
    await deny(()=>call('project_payable_finance_reconciliation',[project,'PKR']),/finance access/i);
    await as('focal');
    await deny(()=>call('reconcile_project_payable_finance',[project,'PKR',100]),/NGO Admin|finance permission/i);
  });

  await ok('financial approval is atomic with the bridge and cannot create an unfunded payable commitment',async()=>{
    await as('ngo');
    const before=(await rows('select version from public.work_payable_units where id=$1',[unit]))[0].version;
    await deny(()=>call('act_work_payable',[unit,'approve',null,'Approve only when project reservation exists',null,null,null,before,crypto.randomUUID(),null]),/reserved funds/i);
    const after=(await rows('select version,status from public.work_payable_units where id=$1',[unit]))[0];
    assert.equal(after.version,before);
    assert.equal(after.status,'pending');
    assert.equal((await rows("select count(*)::int c from public.work_payable_events where unit_id=$1 and kind='accrual'",[unit]))[0].c,0);
  });

  let source;
  await ok('verified organization funding and project reservation provide the only budget source for new payable commitments',async()=>{
    await as('super');
    source=await call('create_finance_funding_source',[org,'grant','2.17.2 Bridge Grant','BRIDGE-GRANT-1','PKR','Verified test grant for finance bridge']);
    await call('record_organization_funding',[source,500,crypto.randomUUID(),'Record verified bridge-test grant']);
    await as('ngo');
    await call('reserve_project_funding',[project,'PKR',200,crypto.randomUUID(),'Reserve field-work compensation budget']);
    const status=await call('project_funding_status',[project,'PKR']);
    assert.equal(Number(status.project_reserved),200);
    assert.equal(Number(status.project_committed),0);
    assert.equal(Number(status.project_spent),0);
  });

  let accrualEvent;
  await ok('approving a payable posts one source-linked balanced journal from project reserved to committed funding',async()=>{
    await as('ngo');
    const u=(await rows('select version from public.work_payable_units where id=$1',[unit]))[0];
    const request=crypto.randomUUID();
    accrualEvent=await call('act_work_payable',[unit,'approve',null,'Approve funded daily entitlement',null,null,null,u.version,request,null]);
    assert(accrualEvent);
    const retry=await call('act_work_payable',[unit,'approve',null,'Approve funded daily entitlement',null,null,null,u.version,request,null]);
    assert.equal(retry,accrualEvent);
    const status=await call('project_funding_status',[project,'PKR']);
    assert.equal(Number(status.project_reserved),100);
    assert.equal(Number(status.project_committed),100);
    assert.equal(Number(status.project_spent),0);
    const links=await rows('select * from public.finance_payable_event_links where event_id=$1',[accrualEvent]);
    assert.equal(links.length,1);
    assert.equal(links[0].bridge_status,'posted');
    const journal=(await rows('select journal_type,reference_type,reference_id from public.finance_journals where id=$1',[links[0].journal_id]))[0];
    assert.equal(journal.journal_type,'payable_finance_bridge');
    assert.equal(journal.reference_type,'work_payable_event');
    assert.equal(journal.reference_id,accrualEvent);
  });

  await ok('negative entitlement adjustment releases only unpaid commitment back to project reserved funding',async()=>{
    await as('ngo');
    const u=(await rows('select version from public.work_payable_units where id=$1',[unit]))[0];
    await call('act_work_payable',[unit,'adjust',-20,'Correct approved entitlement before settlement',null,null,null,u.version,crypto.randomUUID(),null]);
    const status=await call('project_funding_status',[project,'PKR']);
    assert.equal(Number(status.project_reserved),120);
    assert.equal(Number(status.project_committed),80);
    assert.equal(Number(status.project_spent),0);
  });

  let paymentEvent;
  await ok('recorded payment moves exactly the paid amount from committed funding to spent and reversal restores commitment',async()=>{
    await as('ngo');
    let u=(await rows('select version from public.work_payable_units where id=$1',[unit]))[0];
    paymentEvent=await call('act_work_payable',[unit,'pay',50,'Record verified partial settlement','BRIDGE-PAY-1',dates.today,null,u.version,crypto.randomUUID(),null]);
    let status=await call('project_funding_status',[project,'PKR']);
    assert.equal(Number(status.project_reserved),120);
    assert.equal(Number(status.project_committed),30);
    assert.equal(Number(status.project_spent),50);
    u=(await rows('select version from public.work_payable_units where id=$1',[unit]))[0];
    await call('act_work_payable',[unit,'reverse_payment',null,'Reverse test payment accounting entry',null,null,paymentEvent,u.version,crypto.randomUUID(),null]);
    status=await call('project_funding_status',[project,'PKR']);
    assert.equal(Number(status.project_reserved),120);
    assert.equal(Number(status.project_committed),80);
    assert.equal(Number(status.project_spent),0);
  });

  await ok('fully paid entitlement becomes spent while a later entitlement withdrawal retains prior payment without creating fake reserve',async()=>{
    await as('ngo');
    let u=(await rows('select version from public.work_payable_units where id=$1',[unit]))[0];
    await call('act_work_payable',[unit,'pay',80,'Record final verified settlement','BRIDGE-PAY-2',dates.today,null,u.version,crypto.randomUUID(),null]);
    let status=await call('project_funding_status',[project,'PKR']);
    assert.equal(Number(status.project_committed),0);
    assert.equal(Number(status.project_spent),80);
    u=(await rows('select version from public.work_payable_units where id=$1',[unit]))[0];
    const adjustment=await call('act_work_payable',[unit,'adjust',-80,'Withdraw entitlement after settlement; prior payment retained',null,null,null,u.version,crypto.randomUUID(),null]);
    status=await call('project_funding_status',[project,'PKR']);
    assert.equal(Number(status.project_reserved),120);
    assert.equal(Number(status.project_committed),0);
    assert.equal(Number(status.project_spent),80);
    const link=(await rows('select bridge_status,journal_id from public.finance_payable_event_links where event_id=$1',[adjustment]))[0];
    assert.equal(link.bridge_status,'no_movement');
    assert.equal(link.journal_id,null);
  });

  await ok('project reconciliation detects matched subledger totals and historical unbridged events can be replayed idempotently',async()=>{
    await as('ngo');
    let summary=await call('project_payable_finance_reconciliation',[project,'PKR']);
    assert.equal(Number(summary.approved_entitlement),0);
    assert.equal(Number(summary.recorded_payments),80);
    assert.equal(Number(summary.expected_committed),0);
    assert.equal(Number(summary.expected_spent),80);
    assert.equal(summary.unbridged_events,0);
    assert.equal(summary.matched,true);

    await db.exec('RESET ROLE');
    const legacyUnit=(await rows(
      "insert into public.work_payable_units(assignment_id,source_kind,work_date,rate,currency,terms_snapshot,note,created_by,status) values($1,'day',$2,25,'PKR','{}'::jsonb,'Historical bridge fixture',$3,'approved') returning id",
      [assignment,dates.finish,ids.ngo],
    ))[0].id;
    await db.exec('alter table public.work_payable_events disable trigger work_payable_finance_bridge');
    await db.query("insert into public.work_payable_events(unit_id,assignment_id,kind,amount,note,actor_id) values($1,$2,'accrual',25,'Historical accrual before bridge',$3)",[legacyUnit,assignment,ids.ngo]);
    await db.exec('alter table public.work_payable_events enable trigger work_payable_finance_bridge');

    await as('ngo');
    summary=await call('project_payable_finance_reconciliation',[project,'PKR']);
    assert.equal(summary.unbridged_events,1);
    assert.equal(summary.matched,false);
    const replay=await call('reconcile_project_payable_finance',[project,'PKR',100]);
    assert.ok(replay.events_processed>=1);
    summary=await call('project_payable_finance_reconciliation',[project,'PKR']);
    assert.equal(summary.unbridged_events,0);
    assert.equal(summary.matched,true);
    const again=await call('reconcile_project_payable_finance',[project,'PKR',100]);
    assert.equal(again.events_processed,0);
  });

  await ok('finance bridge remains an aggregate accounting bridge and does not duplicate the worker entitlement or provider systems',async()=>{
    const migration=readFileSync('supabase/migrations/20261008000800_payable_finance_bridge_reconciliation.sql','utf8');
    assert.match(migration,/finance_payable_event_links/i);
    assert.match(migration,/reference_type.*work_payable_event|work_payable_event.*reference_type/is);
    assert.match(migration,/project_reserved/i);
    assert.match(migration,/project_committed/i);
    assert.match(migration,/project_spent/i);
    assert.doesNotMatch(migration,/create table public\.work_payable_units/i);
    assert.doesNotMatch(migration,/create table public\.work_payable_events/i);
    assert.doesNotMatch(migration,/jazzcash|withdrawal|provider_callback/i);
    assert.equal((await rows("select count(*)::int c from information_schema.tables where table_schema='public' and table_name in ('work_payable_units','work_payable_events','work_payable_receipts','work_contract_amendments')"))[0].c,4);
  });

  await ok('funding workspace exposes bridge reconciliation without granting Project Manager or Focal finance controls',async()=>{
    const ui=readFileSync('src/features/finance/ProjectFundingWorkspace.tsx','utf8');
    const permissions=readFileSync('docs/PERMISSIONS.md','utf8');
    assert.match(ui,/Payable reconciliation/i);
    assert.match(ui,/project_payable_finance_reconciliation/);
    assert.match(ui,/reconcile_project_payable_finance/);
    assert.match(permissions,/Project Manager.*no finance|Project Manager.*finance access/i);
    assert.match(permissions,/Area Focal.*finance/i);
  });

  console.log(`\n${passed} POEM 2.17.2 payable-finance bridge / reconciliation scenarios passed.`);
} finally {
  await db.close();
}
