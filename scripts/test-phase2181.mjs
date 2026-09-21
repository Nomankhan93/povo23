import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {schemaDb} from './schema-test-db.mjs';

const db=await schemaDb();
let passed=0;
const ids=Object.fromEntries(['super','ngo','worker','other'].map((name,i)=>[name,`a1810000-0000-4000-8000-${String(i+1).padStart(12,'0')}`]));
const rows=async(q,p=[])=>(await db.query(q,p)).rows;
async function as(name){await db.exec('RESET ROLE');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[name?ids[name]:'']);await db.exec(`SET ROLE ${name?'authenticated':'anon'}`)}
async function call(name,args=[]){return (await rows(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args))[0].result}
async function ok(name,fn){await fn();passed+=1;console.log(`PASS ${name}`)}
const deny=(fn,re=/permission|required|wallet|withdrawal|PIN|available|provider|reserved|access|linked/i)=>assert.rejects(fn,re);

try{
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
  const org=await call('save_organization',[null,{name:'2.18.1 Wallet Stabilization NGO',status:'active'}]);
  await call('set_membership',[org,ids.ngo,'ngo_admin','active']);
  const province=await call('save_geography',[null,null,'province','2.18.1 Province','A181P','Fixture',true]);
  const division=await call('save_geography',[null,province,'division','2.18.1 Division','A181D','Fixture',true]);
  const district=await call('save_geography',[null,division,'district','2.18.1 District','A181X','Fixture',true]);
  const taluka=await call('save_geography',[null,district,'taluka','2.18.1 Taluka','A181T','Fixture',true]);
  await db.exec('RESET ROLE');
  await db.query("update public.volunteer_profiles set status='verified',geography_id=$1,details=jsonb_build_object('full_name',$2::text,'skills','Survey','languages','Urdu','availability','Full-time'),version=version+1 where user_id=$3",[taluka,names.worker,ids.worker]);
  await db.query("update public.volunteer_profiles set status='verified',geography_id=$1,details=jsonb_build_object('full_name',$2::text,'skills','Survey','languages','Urdu','availability','Part-time'),version=version+1 where user_id=$3",[taluka,names.other,ids.other]);

  await as('super');
  const template=await call('publish_survey_template',['2.18.1 Wallet Template',[{id:'q',label:'Question',type:'text',required:true}]]);
  const dates=(await rows("select ((now() at time zone 'UTC')::date-1)::text start,((now() at time zone 'UTC')::date+30)::text finish,((now() at time zone 'UTC')::date+1)::text opp_start,((now() at time zone 'UTC')::date+10)::text opp_end,(now()+interval '1 day')::text reply,current_date::text today"))[0];
  const project=await call('create_survey_project',[org,'2.18.1 Paid Project',template,district,20,dates.start,dates.finish,'Validate stabilized withdrawals','v1','Explain the project and obtain consent.']);

  await as('ngo');
  let recruitment=await call('project_recruitment_status',[project]);
  await call('set_project_recruitment_plan',[project,20,2,'open','Configure stabilization recruitment',recruitment.version]);
  let compensation=await call('project_compensation_status',[project]);
  await call('set_project_compensation_defaults',[project,'paid','daily_rate','PKR',500,'PKR 500 approved daily field-work rate','Enable paid work for wallet stabilization test',compensation.version]);

  await as('super');
  const source=await call('create_finance_funding_source',[org,'grant','2.18.1 Wallet Grant','EWALLET-STABLE-1','PKR','Verified stabilization funding']);
  await call('record_organization_funding',[source,1500,crypto.randomUUID(),'Record stabilization funding']);
  await as('ngo');
  await call('reserve_project_funding',[project,'PKR',500,crypto.randomUUID(),'Reserve approved earnings for stabilization test']);
  const opportunity=await call('create_recruitment_opportunity',[project,'Paid stabilization test','Recruit one paid collector',taluka,dates.opp_start,dates.opp_end,dates.reply,'paid','Structured terms',1,'Survey','Urdu','all','Available',true]);
  await as('worker');
  const application=await call('apply_work_opportunity',[opportunity,'Available','Stabilization application',true]);
  await as('ngo');
  const appRow=(await rows('select version from public.work_applications where id=$1',[application]))[0];
  await call('review_work_application',[application,'selected','Selected for stabilization test',appRow.version]);
  const assignment=await call('create_work_assignment',[project,ids.worker,'application',application,'volunteer','none','USD',null,10,dates.start,dates.finish,'Perform approved field work.']);
  await as('worker');
  const offered=(await rows('select version from public.work_assignments where id=$1',[assignment]))[0];
  await call('respond_work_assignment',[assignment,'accepted',offered.version]);
  const unit=await call('claim_work_payable',[assignment,dates.today,'Completed approved field work for stabilization test']);
  await as('ngo');
  const unitRow=(await rows('select version from public.work_payable_units where id=$1',[unit]))[0];
  await call('act_work_payable',[unit,'approve',null,'Approve funded stabilization entitlement',null,null,null,unitRow.version,crypto.randomUUID(),null]);

  let jazzcash,easypaisa,otherJazz;
  await ok('active wallet number is unique per provider across POEM accounts while the same mobile may exist on another provider',async()=>{
    await as('worker');
    jazzcash=await call('save_my_e_wallet',['jazzcash',names.worker,'03001234567']);
    easypaisa=await call('save_my_e_wallet',['easypaisa',names.worker,'03001234567']);
    assert.ok(jazzcash&&easypaisa);
    await as('other');
    await deny(()=>call('save_my_e_wallet',['jazzcash',names.other,'03001234567']),/already linked to another POEM account/i);
    otherJazz=await call('save_my_e_wallet',['jazzcash',names.other,'03007654321']);
    assert.ok(otherJazz);
  });

  await ok('verification callback identity is provider-scoped, wallet-specific and starts a 24-hour activation hold',async()=>{
    const eventKey=crypto.randomUUID();
    await as('super');
    assert.equal(await call('simulate_mock_e_wallet_verification',[jazzcash,'verified',eventKey]),'verified');
    assert.equal(await call('simulate_mock_e_wallet_verification',[jazzcash,'verified',eventKey]),'verified');
    await deny(()=>call('simulate_mock_e_wallet_verification',[otherJazz,'verified',eventKey]),/event key reused/i);
    const queue=await call('admin_mock_e_wallet_queue',[]);
    const held=queue.wallets.find(w=>w.id===jazzcash);
    assert.ok(held);
    assert.equal(held.withdrawal_eligible,false);
    await as('worker');
    const wallet=(await call('my_e_wallets',[])).rows.find(w=>w.id===jazzcash);
    assert.equal(wallet.withdrawal_eligible,false);
    assert.ok(wallet.withdrawal_eligible_at);
  });

  await ok('only POEM Admin can bypass the activation hold in mock mode and the override is idempotent',async()=>{
    await as('worker');
    await deny(()=>call('simulate_mock_e_wallet_activation',[jazzcash,crypto.randomUUID()]),/POEM Admin mock-provider access required/i);
    const key=crypto.randomUUID();
    await as('super');
    const first=await call('simulate_mock_e_wallet_activation',[jazzcash,key]);
    const second=await call('simulate_mock_e_wallet_activation',[jazzcash,key]);
    assert.equal(new Date(second).toISOString(),new Date(first).toISOString());
    await as('worker');
    const wallet=(await call('my_e_wallets',[])).rows.find(w=>w.id===jazzcash);
    assert.equal(wallet.withdrawal_eligible,true);
  });

  await ok('legacy PIN mutation RPC is closed and secure PIN changes persist failed-attempt counters',async()=>{
    await as('worker');
    await deny(()=>call('configure_withdrawal_pin',[null,'123456']),/permission denied/i);
    let result=await call('configure_withdrawal_pin_secure',[null,'654321']);
    assert.equal(result.ok,true);
    result=await call('configure_withdrawal_pin_secure',['000000','111111']);
    assert.equal(result.ok,false);
    assert.equal(result.attempts_remaining,4);
    let security=await call('my_withdrawal_security',[]);
    assert.equal(security.failed_attempts,1);
    result=await call('configure_withdrawal_pin_secure',['654321','654321']);
    assert.equal(result.ok,true);
    security=await call('my_withdrawal_security',[]);
    assert.equal(security.failed_attempts,0);
  });

  await ok('five wrong withdrawal PIN checks create a persisted 15-minute lock and correct PIN cannot bypass it',async()=>{
    await as('worker');
    for(let i=0;i<5;i++)assert.equal(await call('request_e_wallet_withdrawal',[jazzcash,100,'000000',crypto.randomUUID()]),null);
    let security=await call('my_withdrawal_security',[]);
    assert.equal(security.failed_attempts,5);
    assert.equal(security.attempts_remaining,0);
    assert.ok(security.locked_until);
    assert.equal(await call('request_e_wallet_withdrawal',[jazzcash,100,'654321',crypto.randomUUID()]),null);
    await db.exec('RESET ROLE');
    await db.query("update public.e_wallet_security set locked_until=now()-interval '1 minute' where user_id=$1",[ids.worker]);
    await as('worker');
    security=await call('my_withdrawal_security',[]);
    assert.equal(security.attempts_remaining,5);
  });

  let withdrawal;
  await ok('request-id replay remains idempotent after account-level serialization and reserves exact payable balance once',async()=>{
    await as('worker');
    const request=crypto.randomUUID();
    withdrawal=await call('request_e_wallet_withdrawal',[jazzcash,200,'654321',request]);
    assert.ok(withdrawal);
    assert.equal(await call('request_e_wallet_withdrawal',[jazzcash,200,'000000',request]),withdrawal);
    const summary=await call('my_withdrawal_summary',['PKR']);
    assert.equal(Number(summary.pending_withdrawals),200);
    assert.equal(Number(summary.available),300);
  });

  await ok('pending payable protection cannot be bypassed by spoofing the old custom settlement GUC',async()=>{
    await as('ngo');
    await rows("select set_config('app.wallet_settlement',$1,false)",[withdrawal]);
    const current=(await rows('select version from public.work_payable_units where id=$1',[unit]))[0];
    await deny(()=>call('act_work_payable',[unit,'adjust',-10,'Attempt spoofed reserved-payable mutation',null,null,null,current.version,crypto.randomUUID(),null]),/reserved by a pending e-wallet withdrawal/i);
  });

  await ok('exact allocation request IDs still allow mock settlement and finance bridge movement without the custom GUC bypass',async()=>{
    await as('super');
    const result=await call('simulate_mock_e_wallet_provider',[withdrawal,'succeeded',crypto.randomUUID()]);
    assert.equal(result.status,'succeeded');
    await as('worker');
    const summary=await call('my_withdrawal_summary',['PKR']);
    assert.equal(Number(summary.paid),200);
    assert.equal(Number(summary.available),300);
    await as('ngo');
    const funding=await call('project_funding_status',[project,'PKR']);
    assert.equal(Number(funding.project_committed),300);
    assert.equal(Number(funding.project_spent),200);
  });

  await ok('verified wallet details remain immutable, direct verification-event access is denied, and default wallet switching remains singular',async()=>{
    await as('super');
    assert.equal(await call('simulate_mock_e_wallet_verification',[easypaisa,'verified',crypto.randomUUID()]),'verified');
    await call('simulate_mock_e_wallet_activation',[easypaisa,crypto.randomUUID()]);
    await as('worker');
    await deny(()=>call('save_my_e_wallet',['jazzcash',names.worker,'03009999999']),/cannot be edited/i);
    await deny(()=>db.query('select * from public.e_wallet_verification_events'),/permission denied/i);
    await call('set_default_e_wallet',[easypaisa]);
    const list=await call('my_e_wallets',[]);
    assert.equal(list.rows.filter(w=>w.is_default).length,1);
    assert.equal(list.rows.find(w=>w.id===easypaisa).is_default,true);
  });

  await ok('2.18.1 source keeps JazzCash/Easypaisa-only scope and exposes hold/lock stabilization in UI',async()=>{
    const migration=readFileSync('supabase/migrations/20261008000920_ewallet_withdrawal_stabilization.sql','utf8');
    const userUi=readFileSync('src/features/payments/EWalletWithdrawalWorkspace.tsx','utf8');
    const adminUi=readFileSync('src/features/payments/MockEWalletSandbox.tsx','utf8');
    assert.match(migration,/15 minutes/i);
    assert.match(migration,/24 hours/i);
    assert.match(migration,/payment_request_id=new\.request_id/i);
    assert.doesNotMatch(migration+userUi+adminUi,/IBAN|Bank Account|bank transfer/i);
    assert.match(userUi,/security activation hold/i);
    assert.match(userUi,/Five failed checks temporarily lock/i);
    assert.match(adminUi,/Activate now \(mock\)/i);
  });

  console.log(`\n${passed} POEM 2.18.1 e-wallet / withdrawal stabilization scenarios passed.`);
} finally {await db.close()}
