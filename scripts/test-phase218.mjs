import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {schemaDb} from './schema-test-db.mjs';

const db=await schemaDb();
let passed=0;
const ids=Object.fromEntries(['super','ngo','worker','other'].map((name,i)=>[name,`a1800000-0000-4000-8000-${String(i+1).padStart(12,'0')}`]));
const rows=async(q,p=[])=>(await db.query(q,p)).rows;
async function as(name){await db.exec('RESET ROLE');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[name?ids[name]:'']);await db.exec(`SET ROLE ${name?'authenticated':'anon'}`)}
async function call(name,args=[]){return (await rows(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args))[0].result}
async function ok(name,fn){await fn();passed+=1;console.log(`PASS ${name}`)}
const deny=(fn,re=/permission|required|wallet|withdrawal|PIN|available|provider|reserved|access/i)=>assert.rejects(fn,re);

try{
  // PGlite does not ship Supabase's pgcrypto extension. These test-only functions mimic the crypt API shape;
  // production/local Supabase must use the real extensions.crypt/gen_salt implementation.
  await db.exec(`
    create or replace function extensions.gen_salt(kind text,cost integer) returns text language sql volatile as $$
      select '$mock$'||substr(md5(random()::text||clock_timestamp()::text),1,16)
    $$;
    create or replace function extensions.crypt(secret text,salt text) returns text language sql immutable as $$
      select '$mock$'||split_part(salt,'$',3)||'$'||md5(secret||split_part(salt,'$',3))
    $$;
  `);

  const names={super:'POEM Finance Admin',ngo:'NGO Administrator',worker:'Ayesha Worker',other:'Other Volunteer'};
  for(const [name,id] of Object.entries(ids))await db.query(
    'insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)',
    [id,`${name}@example.test`,JSON.stringify({full_name:names[name]})],
  );
  await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.super]);
  await as('super');

  const org=await call('save_organization',[null,{name:'2.18.0 E-Wallet NGO',status:'active'}]);
  await call('set_membership',[org,ids.ngo,'ngo_admin','active']);
  const province=await call('save_geography',[null,null,'province','2.18 Province','A180P','Fixture',true]);
  const division=await call('save_geography',[null,province,'division','2.18 Division','A180D','Fixture',true]);
  const district=await call('save_geography',[null,division,'district','2.18 District','A180X','Fixture',true]);
  const taluka=await call('save_geography',[null,district,'taluka','2.18 Taluka','A180T','Fixture',true]);
  await db.exec('RESET ROLE');
  await db.query("update public.volunteer_profiles set status='verified',geography_id=$1,details=jsonb_build_object('full_name',$2::text,'skills','Survey','languages','Urdu','availability','Full-time'),version=version+1 where user_id=$3",[taluka,names.worker,ids.worker]);

  await as('super');
  const template=await call('publish_survey_template',['2.18 Wallet Template',[{id:'q',label:'Question',type:'text',required:true}]]);
  const dates=(await rows("select ((now() at time zone 'UTC')::date-1)::text start,((now() at time zone 'UTC')::date+30)::text finish,((now() at time zone 'UTC')::date+1)::text opp_start,((now() at time zone 'UTC')::date+10)::text opp_end,(now()+interval '1 day')::text reply,current_date::text today"))[0];
  const project=await call('create_survey_project',[org,'2.18 Paid Project',template,district,20,dates.start,dates.finish,'Validate e-wallet withdrawals','v1','Explain the project and obtain consent.']);

  await as('ngo');
  let recruitment=await call('project_recruitment_status',[project]);
  await call('set_project_recruitment_plan',[project,20,1,'open','Configure wallet test recruitment',recruitment.version]);
  let compensation=await call('project_compensation_status',[project]);
  await call('set_project_compensation_defaults',[project,'paid','daily_rate','PKR',500,'PKR 500 approved daily field-work rate','Enable paid work for e-wallet test',compensation.version]);

  await as('super');
  const source=await call('create_finance_funding_source',[org,'grant','2.18 Wallet Grant','EWALLET-GRANT-1','PKR','Verified sandbox funding']);
  await call('record_organization_funding',[source,1000,crypto.randomUUID(),'Record sandbox project funding']);
  await as('ngo');
  await call('reserve_project_funding',[project,'PKR',500,crypto.randomUUID(),'Reserve approved earnings for wallet test']);

  await as('worker');

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
  const application=await call('apply_work_opportunity',[opportunity,'Available','Wallet test application',true]);
  await as('ngo');
  const appRow=(await rows('select version from public.work_applications where id=$1',[application]))[0];
  await call('review_work_application',[application,'selected','Selected for wallet test',appRow.version]);
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
    'Completed approved field work for withdrawal test.',
    crypto.randomUUID(),
    attendanceStarted.version
  ]);

  await as('ngo');

  const attendanceApproved=await call('review_attendance_session',[
    attendanceStarted.id,
    'approve',
    'Verified attendance for withdrawal test.',
    attendanceSubmitted.version
  ]);

  assert.ok(attendanceApproved.payable_unit_id);

  const unit=attendanceApproved.payable_unit_id;
  await as('ngo');
  const unitRow=(await rows('select version from public.work_payable_units where id=$1',[unit]))[0];
  await call('act_work_payable',[unit,'approve',null,'Approve funded wallet-test entitlement',null,null,null,unitRow.version,crypto.randomUUID(),null]);

  await ok('2.18.0 exposes only JazzCash/Easypaisa RPC surfaces while sensitive wallet tables remain RPC-only',async()=>{
    const migration=readFileSync('supabase/migrations/20261008000900_ewallet_mock_withdrawal_sandbox.sql','utf8');
    assert.match(migration,/provider in \('jazzcash','easypaisa'\)/i);
    assert.doesNotMatch(migration,/bank_account|iban|bank transfer/i);
    await as('worker');
    await deny(()=>db.query('select * from public.e_wallets'),/permission denied/i);
    await deny(()=>call('save_my_e_wallet',['bank',names.worker,'03001234567']),/JazzCash or Easypaisa/i);
    await deny(()=>call('admin_mock_e_wallet_queue',[]),/POEM Admin mock-provider access required/i);
    const list=await call('my_e_wallets',[]);
    assert.deepEqual(list.providers,['jazzcash','easypaisa']);
    assert.equal(list.provider_mode,'mock');
  });

  let jazzcash,easypaisa;
  await ok('wallet binding normalizes and masks mobile numbers and mock verification requires POEM-name ownership consistency',async()=>{
    await as('worker');
    jazzcash=await call('save_my_e_wallet',['jazzcash','Wrong Person','03001234567']);
    await deny(()=>call('simulate_mock_e_wallet_verification',[jazzcash,'verified',crypto.randomUUID()]),/POEM Admin mock-provider access required/i);
    await as('super');
    await deny(()=>call('simulate_mock_e_wallet_verification',[jazzcash,'verified',crypto.randomUUID()]),/account title.*match/i);
    let queue=await call('admin_mock_e_wallet_queue',[]);
    assert.ok(queue.wallets.some(w=>w.id===jazzcash));
    await as('worker');
    const same=await call('save_my_e_wallet',['jazzcash',names.worker,'+92 300 1234567']);
    assert.equal(same,jazzcash);
    easypaisa=await call('save_my_e_wallet',['easypaisa',names.worker,'03111234567']);
    await as('super');
    assert.equal(await call('simulate_mock_e_wallet_verification',[jazzcash,'verified',crypto.randomUUID()]),'verified');
    assert.equal(await call('simulate_mock_e_wallet_verification',[easypaisa,'verified',crypto.randomUUID()]),'verified');
    await call('simulate_mock_e_wallet_activation',[jazzcash,crypto.randomUUID()]);
    await call('simulate_mock_e_wallet_activation',[easypaisa,crypto.randomUUID()]);
    await as('worker');
    const list=await call('my_e_wallets',[]);
    assert.equal(list.count,2);
    assert.equal(list.rows.some(r=>r.account_number),false);
    assert.ok(list.rows.every(r=>/^03.*[0-9]{4}$/.test(r.account_masked)));
    assert.equal(list.rows.filter(r=>r.is_default).length,1);
    await call('set_default_e_wallet',[easypaisa]);
    const after=await call('my_e_wallets',[]);
    assert.equal(after.rows.find(r=>r.id===easypaisa).is_default,true);
  });

  await ok('transaction PIN is server-hashed, never readable directly, and required for withdrawals',async()=>{
    await as('worker');
    let security=await call('my_withdrawal_security',[]);
    assert.equal(security.crypto_ready,true);
    assert.equal(security.pin_configured,false);
    let pinResult=await call('configure_withdrawal_pin_secure',[null,'123456']);
    assert.equal(pinResult.ok,true);
    security=await call('my_withdrawal_security',[]);
    assert.equal(security.pin_configured,true);
    await deny(()=>db.query('select * from public.e_wallet_security'),/permission denied/i);
    pinResult=await call('configure_withdrawal_pin_secure',['000000','654321']);
    assert.equal(pinResult.ok,false);
    assert.equal(pinResult.code,'pin_incorrect');
    pinResult=await call('configure_withdrawal_pin_secure',['123456','654321']);
    assert.equal(pinResult.ok,true);
  });

  let withdrawal,requestId;
  await ok('withdrawal request reserves exact approved payable allocations and request IDs are idempotent',async()=>{
    await as('worker');
    let summary=await call('my_withdrawal_summary',['PKR']);
    assert.equal(Number(summary.approved),500);
    assert.equal(Number(summary.paid),0);
    assert.equal(Number(summary.available),500);
    assert.equal(await call('request_e_wallet_withdrawal',[easypaisa,200,'000000',crypto.randomUUID()]),null);
    requestId=crypto.randomUUID();
    withdrawal=await call('request_e_wallet_withdrawal',[easypaisa,200,'654321',requestId]);
    assert.equal(await call('request_e_wallet_withdrawal',[easypaisa,200,'654321',requestId]),withdrawal);
    summary=await call('my_withdrawal_summary',['PKR']);
    assert.equal(Number(summary.pending_withdrawals),200);
    assert.equal(Number(summary.available),300);
    await db.exec('RESET ROLE');
    const alloc=(await db.query('select sum(amount)::numeric total,count(*)::int c from public.e_wallet_withdrawal_allocations where withdrawal_id=$1',[withdrawal])).rows[0];
    assert.equal(Number(alloc.total),200);
    assert.ok(alloc.c>=1);
    await as('worker');
    await deny(()=>call('request_e_wallet_withdrawal',[jazzcash,350,'654321',crypto.randomUUID()]),/exceeds.*available/i);
  });

  await ok('pending withdrawal allocations block competing payable mutations until the provider outcome resolves',async()=>{
    await as('ngo');
    const current=(await rows('select version from public.work_payable_units where id=$1',[unit]))[0];
    await deny(()=>call('act_work_payable',[unit,'adjust',-10,'Attempt adjustment during pending withdrawal',null,null,null,current.version,crypto.randomUUID(),null]),/reserved by a pending e-wallet withdrawal/i);
    await as('worker');
    await deny(()=>call('unlink_my_e_wallet',[easypaisa]),/pending withdrawals/i);
  });

  await ok('mock provider success is callback-idempotent and settles payable events through the existing finance bridge',async()=>{
    await as('worker');
    await deny(()=>call('simulate_mock_e_wallet_provider',[withdrawal,'processing',crypto.randomUUID()]),/POEM Admin mock-provider access required/i);
    await as('super');
    const queue=await call('admin_mock_e_wallet_queue',[]);
    assert.ok(queue.withdrawals.some(w=>w.id===withdrawal));
    const processingKey=crypto.randomUUID();
    let result=await call('simulate_mock_e_wallet_provider',[withdrawal,'processing',processingKey]);
    assert.equal(result.status,'processing');
    result=await call('simulate_mock_e_wallet_provider',[withdrawal,'processing',processingKey]);
    assert.equal(result.idempotent,true);
    const successKey=crypto.randomUUID();
    result=await call('simulate_mock_e_wallet_provider',[withdrawal,'succeeded',successKey]);
    assert.equal(result.status,'succeeded');
    result=await call('simulate_mock_e_wallet_provider',[withdrawal,'succeeded',successKey]);
    assert.equal(result.idempotent,true);
    await as('worker');
    const summary=await call('my_withdrawal_summary',['PKR']);
    assert.equal(Number(summary.paid),200);
    assert.equal(Number(summary.pending_withdrawals),0);
    assert.equal(Number(summary.available),300);
    await as('ngo');
    const funding=await call('project_funding_status',[project,'PKR']);
    assert.equal(Number(funding.project_committed),300);
    assert.equal(Number(funding.project_spent),200);
    const payments=(await rows("select count(*)::int c from public.work_payable_events where unit_id=$1 and kind='payment'",[unit]))[0].c;
    assert.equal(payments,1);
  });

  await ok('mock provider failure and user cancellation release reserved earnings without creating payment events',async()=>{
    await as('worker');
    const failed=await call('request_e_wallet_withdrawal',[jazzcash,100,'654321',crypto.randomUUID()]);
    let summary=await call('my_withdrawal_summary',['PKR']);
    assert.equal(Number(summary.available),200);
    await as('super');
    await call('simulate_mock_e_wallet_provider',[failed,'failed',crypto.randomUUID()]);
    await as('worker');
    summary=await call('my_withdrawal_summary',['PKR']);
    assert.equal(Number(summary.available),300);
    const cancelled=await call('request_e_wallet_withdrawal',[jazzcash,100,'654321',crypto.randomUUID()]);
    const row=(await call('my_e_wallet_withdrawals',[null,50])).rows.find(r=>r.id===cancelled);
    await call('cancel_my_e_wallet_withdrawal',[cancelled,row.version]);
    summary=await call('my_withdrawal_summary',['PKR']);
    assert.equal(Number(summary.available),300);
    const eventCount=(await rows("select count(*)::int c from public.work_payable_events where request_payload->>'withdrawal_id' in ($1,$2)",[failed,cancelled]))[0].c;
    assert.equal(eventCount,0);
  });

  await ok('mock provider reversal restores worker payable balance and reverses project spent back to committed',async()=>{
    await as('worker');
    const reversible=await call('request_e_wallet_withdrawal',[jazzcash,100,'654321',crypto.randomUUID()]);
    await as('super');
    await call('simulate_mock_e_wallet_provider',[reversible,'succeeded',crypto.randomUUID()]);
    await as('worker');
    let summary=await call('my_withdrawal_summary',['PKR']);
    assert.equal(Number(summary.available),200);
    await as('super');
    await call('simulate_mock_e_wallet_provider',[reversible,'reversed',crypto.randomUUID()]);
    await as('worker');
    summary=await call('my_withdrawal_summary',['PKR']);
    assert.equal(Number(summary.available),300);
    await as('ngo');
    const funding=await call('project_funding_status',[project,'PKR']);
    assert.equal(Number(funding.project_committed),300);
    assert.equal(Number(funding.project_spent),200);
  });

  await ok('wallet/withdrawal history is masked and personal while another user cannot access or operate it',async()=>{
    await as('worker');
    const history=await call('my_e_wallet_withdrawals',[null,50]);
    assert.ok(history.rows.length>=4);
    assert.ok(history.rows.every(r=>r.account_masked_snapshot&&!('account_number' in r)));
    await as('other');
    const otherWallets=await call('my_e_wallets',[]);
    const otherHistory=await call('my_e_wallet_withdrawals',[null,50]);
    assert.equal(otherWallets.count,0);
    assert.equal(otherHistory.count,0);
    await deny(()=>call('set_default_e_wallet',[jazzcash]),/Verified own e-wallet/i);
  });

  await ok('2.18.0 UI is personal-wallet focused, mock-labelled and contains no bank-account payout path',async()=>{
    const ui=readFileSync('src/features/payments/EWalletWithdrawalWorkspace.tsx','utf8');
    const adminUi=readFileSync('src/features/payments/MockEWalletSandbox.tsx','utf8');
    const app=readFileSync('src/app/AppShell.tsx','utf8');
    const permissions=readFileSync('docs/PERMISSIONS.md','utf8');
    assert.match(ui,/JazzCash/i);
    assert.match(ui,/Easypaisa/i);
    assert.match(ui,/manual \+ mock/i);
    assert.match(ui,/mock sandbox remains available for development testing/i);
    assert.match(ui,/Transaction PIN/i);
    assert.match(ui,/activation hold/i);
    assert.match(ui,/temporarily lock/i);
    assert.doesNotMatch(ui,/Simulate success/i);
    assert.match(adminUi,/Mock E-Wallet Sandbox/i);
    assert.match(adminUi,/Success/);
    assert.match(adminUi,/Activate now \(mock\)/);
    assert.doesNotMatch(ui+adminUi,/IBAN|Bank Account|bank transfer/i);
    assert.match(app,/E-Wallets & withdrawals/);
    assert.match(app,/E-Wallet sandbox/);
    assert.match(permissions,/mock.*JazzCash.*Easypaisa|JazzCash.*Easypaisa.*mock/is);
  });

  console.log(`\n${passed} POEM 2.18.0 e-wallet binding / mock-withdrawal scenarios passed.`);
} finally {await db.close()}
