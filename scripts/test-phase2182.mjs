import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {schemaDb} from './schema-test-db.mjs';

const db=await schemaDb();
let passed=0;
const ids=Object.fromEntries(['super','admin2','ngo','worker'].map((name,i)=>[name,`a1820000-0000-4000-8000-${String(i+1).padStart(12,'0')}`]));
const rows=async(q,p=[])=>(await db.query(q,p)).rows;
async function as(name){await db.exec('RESET ROLE');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[name?ids[name]:'']);await db.exec(`SET ROLE ${name?'authenticated':'anon'}`)}
async function call(name,args=[]){return (await rows(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args))[0].result}

async function myWithdrawalRow(id){
  const history=await call('my_e_wallet_withdrawals',[null,50]);
  const row=history.rows.find(row=>row.id===id);
  assert.ok(row,`Personal withdrawal ${id} not found`);
  return row;
}

async function adminWithdrawalRow(id){
  const queue=await call('admin_e_wallet_operations_queue',[null,null,500]);
  const row=queue.rows.find(row=>row.id===id);
  assert.ok(row,`Admin withdrawal ${id} not found`);
  return row;
}
async function ok(name,fn){await fn();passed+=1;console.log(`PASS ${name}`)}
const deny=(fn,re=/permission|required|withdrawal|manual|limit|provider|reference|control|linked|processing/i)=>assert.rejects(fn,re);

try{
  await db.exec(`
    create or replace function extensions.gen_salt(kind text,cost integer) returns text language sql volatile as $$
      select '$mock$'||substr(md5(random()::text||clock_timestamp()::text),1,16)
    $$;
    create or replace function extensions.crypt(secret text,salt text) returns text language sql immutable as $$
      select '$mock$'||split_part(salt,'$',3)||'$'||md5(secret||split_part(salt,'$',3))
    $$;
  `);

  const names={super:'POEM Finance Admin',admin2:'POEM Settlement Admin',ngo:'NGO Administrator',worker:'Ayesha Worker'};
  for(const [name,id] of Object.entries(ids))await db.query(
    'insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)',
    [id,`${name}@example.test`,JSON.stringify({full_name:names[name]})],
  );
  await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.super]);
  await db.query("update public.accounts set platform_role='admin' where id=$1",[ids.admin2]);

  await as('super');
  const org=await call('save_organization',[null,{name:'2.18.2 Manual Settlement NGO',status:'active'}]);
  await call('set_membership',[org,ids.ngo,'ngo_admin','active']);
  const province=await call('save_geography',[null,null,'province','2.18.2 Province','A182P','Fixture',true]);
  const division=await call('save_geography',[null,province,'division','2.18.2 Division','A182D','Fixture',true]);
  const district=await call('save_geography',[null,division,'district','2.18.2 District','A182X','Fixture',true]);
  const taluka=await call('save_geography',[null,district,'taluka','2.18.2 Taluka','A182T','Fixture',true]);
  await db.exec('RESET ROLE');
  await db.query("update public.volunteer_profiles set status='verified',geography_id=$1,details=jsonb_build_object('full_name',$2::text,'skills','Survey','languages','Urdu','availability','Full-time'),version=version+1 where user_id=$3",[taluka,names.worker,ids.worker]);

  await as('super');
  const template=await call('publish_survey_template',['2.18.2 Settlement Template',[{id:'q',label:'Question',type:'text',required:true}]]);
  const dates=(await rows("select ((now() at time zone 'UTC')::date-1)::text start,((now() at time zone 'UTC')::date+30)::text finish,((now() at time zone 'UTC')::date+1)::text opp_start,((now() at time zone 'UTC')::date+10)::text opp_end,(now()+interval '1 day')::text reply,current_date::text today"))[0];
  const project=await call('create_survey_project',[org,'2.18.2 Paid Project',template,district,20,dates.start,dates.finish,'Validate manual settlement','v1','Explain the project and obtain consent.']);

  await as('ngo');
  let recruitment=await call('project_recruitment_status',[project]);
  await call('set_project_recruitment_plan',[project,20,2,'open','Configure settlement recruitment',recruitment.version]);
  let compensation=await call('project_compensation_status',[project]);
  await call('set_project_compensation_defaults',[project,'paid','daily_rate','PKR',500,'PKR 500 approved daily field-work rate','Enable paid work for settlement test',compensation.version]);

  await as('super');
  const source=await call('create_finance_funding_source',[org,'grant','2.18.2 Settlement Grant','EWALLET-MANUAL-1','PKR','Verified manual settlement funding']);
  await call('record_organization_funding',[source,2000,crypto.randomUUID(),'Record manual settlement funding']);
  await as('ngo');
  await call('reserve_project_funding',[project,'PKR',500,crypto.randomUUID(),'Reserve approved earnings for manual settlement test']);
  const opportunity=await call('create_recruitment_opportunity',[project,'Paid settlement test','Recruit one paid collector',taluka,dates.opp_start,dates.opp_end,dates.reply,'paid','Structured terms',1,'Survey','Urdu','all','Available',true]);
  await as('worker');
  const application=await call('apply_work_opportunity',[opportunity,'Available','Settlement application',true]);
  await as('ngo');
  const appRow=(await rows('select version from public.work_applications where id=$1',[application]))[0];
  await call('review_work_application',[application,'selected','Selected for settlement test',appRow.version]);
  const assignment=await call('create_work_assignment',[project,ids.worker,'application',application,'volunteer','none','USD',null,10,dates.start,dates.finish,'Perform approved field work.']);
  await as('worker');
  const offered=(await rows('select version from public.work_assignments where id=$1',[assignment]))[0];
  await call('respond_work_assignment',[assignment,'accepted',offered.version]);
  const attendanceTimes=(await rows(
    "select now()::text start,(now()+interval '1 second')::text finish"
  ))[0];

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
    'Completed approved field work for manual settlement test.',
    crypto.randomUUID(),
    attendanceStarted.version
  ]);

  await as('ngo');

  const attendanceApproved=await call('review_attendance_session',[
    attendanceStarted.id,
    'approve',
    'Verified attendance for manual settlement test.',
    attendanceSubmitted.version
  ]);

  assert.ok(attendanceApproved.payable_unit_id);

  const unit=attendanceApproved.payable_unit_id;
  await as('ngo');
  const unitRow=(await rows('select version from public.work_payable_units where id=$1',[unit]))[0];
  await call('act_work_payable',[unit,'approve',null,'Approve funded manual-settlement entitlement',null,null,null,unitRow.version,crypto.randomUUID(),null]);

  let wallet;
  await as('worker');
  wallet=await call('save_my_e_wallet',['jazzcash',names.worker,'03001234567']);
  await as('super');
  await call('simulate_mock_e_wallet_verification',[wallet,'verified',crypto.randomUUID()]);
  await call('simulate_mock_e_wallet_activation',[wallet,crypto.randomUUID()]);
  await as('worker');
  assert.equal((await call('configure_withdrawal_pin_secure',[null,'654321'])).ok,true);

  await ok('payout policy is readable, finance-admin configurable and protected from ordinary users',async()=>{
    await as('worker');
    const initial=await call('e_wallet_payout_policy',[]);
    assert.equal(Number(initial.minimum_withdrawal),100);
    await deny(()=>call('configure_e_wallet_payout_policy',[100,500,700,150,true]),/finance administration/i);
    await as('super');
    const changed=await call('configure_e_wallet_payout_policy',[100,500,700,150,true]);
    assert.equal(Number(changed.maximum_withdrawal),500);
    assert.equal(Number(changed.dual_control_threshold),150);
  });

  await ok('configured per-request limits reject out-of-policy withdrawals before money is reserved',async()=>{
    await as('worker');
    await deny(()=>call('request_e_wallet_withdrawal',[wallet,50,'654321',crypto.randomUUID()]),/configured payout limits/i);
    await deny(()=>call('request_e_wallet_withdrawal',[wallet,501,'654321',crypto.randomUUID()]),/configured payout limits/i);
  });

  let first;
  await ok('finance admin can approve a requested withdrawal for manual settlement and approval remains idempotent',async()=>{
    await as('worker');
    first=await call('request_e_wallet_withdrawal',[wallet,200,'654321',crypto.randomUUID()]);
    const before=await myWithdrawalRow(first);
    await deny(()=>call('approve_manual_e_wallet_withdrawal',[first,before.version,'Approve manual payout',crypto.randomUUID()]),/finance administration/i);
    await as('super');
    const request=crypto.randomUUID();
    const approved=await call('approve_manual_e_wallet_withdrawal',[first,before.version,'Approve verified manual payout',request]);
    assert.equal(approved.status,'approved');
    const replay=await call('approve_manual_e_wallet_withdrawal',[first,before.version,'Approve verified manual payout',request]);
    assert.equal(replay.idempotent,true);
    const queue=await call('admin_e_wallet_operations_queue',['approved','jazzcash',50]);
    assert.equal(queue.rows.find(r=>r.id===first).provider_mode,'manual');
  });

  await ok('approved withdrawal keeps exact earnings reserved and blocks wallet unlink',async()=>{
    await as('worker');
    const summary=await call('my_withdrawal_summary',['PKR']);
    assert.equal(Number(summary.pending_withdrawals),200);
    assert.equal(Number(summary.available),300);
    await deny(()=>call('unlink_my_e_wallet',[wallet]),/pending withdrawals/i);
  });

  await ok('manual withdrawal enters processing through an idempotent finance-admin operation',async()=>{
    await as('super');
    let row=await adminWithdrawalRow(first);
    const request=crypto.randomUUID();
    const processing=await call('start_manual_e_wallet_withdrawal',[first,row.version,request]);
    assert.equal(processing.status,'processing');
    assert.equal((await call('start_manual_e_wallet_withdrawal',[first,row.version,request])).idempotent,true);
    await deny(()=>call('simulate_mock_e_wallet_provider',[first,'succeeded',crypto.randomUUID()]),/Mock withdrawal required/i);
  });

  await ok('dual-control threshold prevents the approver from settling a large manual withdrawal',async()=>{
    await as('super');
    await deny(()=>call('settle_manual_e_wallet_withdrawal',[first,'JC-TXN-2182-001',dates.today,'Manual JazzCash payout confirmed',crypto.randomUUID()]),/Dual control/i);
  });

  await ok('a second finance admin records the external provider reference and exact settlement posts through payables into finance',async()=>{
    await as('admin2');
    const result=await call('settle_manual_e_wallet_withdrawal',[first,'JC-TXN-2182-001',dates.today,'Manual JazzCash payout confirmed',crypto.randomUUID()]);
    assert.equal(result.status,'succeeded');
    assert.equal(result.external_reference,'JC-TXN-2182-001');
    await as('worker');
    const summary=await call('my_withdrawal_summary',['PKR']);
    assert.equal(Number(summary.paid),200);
    assert.equal(Number(summary.available),300);
    const history=await call('my_e_wallet_withdrawals',[null,50]);
    const row=history.rows.find(r=>r.id===first);
    assert.equal(row.provider_mode,'manual');
    assert.equal(row.settlement_reference,'JC-TXN-2182-001');
    await as('ngo');
    const funding=await call('project_funding_status',[project,'PKR']);
    assert.equal(Number(funding.project_committed),300);
    assert.equal(Number(funding.project_spent),200);
  });

  await ok('provider reconciliation ties allocation, payable payment and finance bridge to the same settled withdrawal',async()=>{
    await as('super');
    const rec=await call('admin_e_wallet_provider_reconciliation',['succeeded','jazzcash',50]);
    const row=rec.rows.find(r=>r.withdrawal_id===first);
    assert.ok(row);
    assert.equal(row.matched,true);
    assert.equal(row.issue,null);
    assert.equal(row.settlement_reference,'JC-TXN-2182-001');
    assert.equal(Number(row.payment_total),200);
    assert.equal(row.payment_bridge_count,row.payment_count);
  });

  let failed;
  await ok('manual failure releases reserved earnings without creating payment events',async()=>{
    await as('worker');
    failed=await call('request_e_wallet_withdrawal',[wallet,100,'654321',crypto.randomUUID()]);
    await as('super');
    let row=await adminWithdrawalRow(failed);
    await call('approve_manual_e_wallet_withdrawal',[failed,row.version,'Approve second manual payout',crypto.randomUUID()]);
    row=await adminWithdrawalRow(failed);
    await call('start_manual_e_wallet_withdrawal',[failed,row.version,crypto.randomUUID()]);
    const result=await call('fail_manual_e_wallet_withdrawal',[failed,'WALLET_UNAVAILABLE','Provider wallet was unavailable',crypto.randomUUID()]);
    assert.equal(result.status,'failed');
    await as('worker');
    const summary=await call('my_withdrawal_summary',['PKR']);
    assert.equal(Number(summary.available),300);
  });

  await ok('manual external references cannot be reused and a settled payout can be reversed with a distinct provider reference',async()=>{
    await as('worker');
    const reversible=await call('request_e_wallet_withdrawal',[wallet,100,'654321',crypto.randomUUID()]);
    await as('super');
    let row=await adminWithdrawalRow(reversible);
    await call('approve_manual_e_wallet_withdrawal',[reversible,row.version,'Approve reversible manual payout',crypto.randomUUID()]);
    row=await adminWithdrawalRow(reversible);
    await call('start_manual_e_wallet_withdrawal',[reversible,row.version,crypto.randomUUID()]);
    await deny(()=>call('settle_manual_e_wallet_withdrawal',[reversible,'JC-TXN-2182-001',dates.today,'Attempt duplicate provider reference',crypto.randomUUID()]),/already recorded/i);
    await call('settle_manual_e_wallet_withdrawal',[reversible,'JC-TXN-2182-002',dates.today,'Second manual payout confirmed',crypto.randomUUID()]);
    const reversed=await call('reverse_manual_e_wallet_withdrawal',[reversible,'JC-REV-2182-002','Provider transaction reversed',crypto.randomUUID()]);
    assert.equal(reversed.status,'reversed');
    const rec=await call('admin_e_wallet_provider_reconciliation',['reversed','jazzcash',50]);
    const recRow=rec.rows.find(r=>r.withdrawal_id===reversible);
    assert.equal(recRow.matched,true);
    assert.equal(recRow.reversal_reference,'JC-REV-2182-002');
    await as('worker');
    const summary=await call('my_withdrawal_summary',['PKR']);
    assert.equal(Number(summary.paid),200);
    assert.equal(Number(summary.available),300);
  });

  await ok('manual operation history is not directly exposed and 2.18.2 remains JazzCash/Easypaisa only',async()=>{
    await as('worker');
    await deny(()=>db.query('select * from public.e_wallet_manual_operations'),/permission denied/i);
    const migration=readFileSync('supabase/migrations/20261008000930_withdrawal_operations_manual_settlement.sql','utf8');
    const ui=readFileSync('src/features/payments/WithdrawalOperationsWorkspace.tsx','utf8');
    assert.match(migration,/dual_control_threshold/i);
    assert.match(migration,/admin_e_wallet_provider_reconciliation/i);
    assert.match(ui,/Manual settlement/i);
    assert.doesNotMatch(migration+ui,/IBAN|Bank Account|bank transfer/i);
  });

  console.log(`\n${passed} POEM 2.18.2 withdrawal operations / manual settlement scenarios passed.`);
} finally {await db.close()}
