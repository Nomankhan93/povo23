import assert from 'node:assert/strict';import {schemaDb} from './schema-test-db.mjs';
const db=await schemaDb();let passed=0;const ids=Object.fromEntries(['super','manager','ngo','otherngo','a','b'].map((n,i)=>[n,`62000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`]));
const rows=async(q,p=[]) => (await db.query(q,p)).rows;async function as(n){await db.exec('RESET ROLE');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[n]||'']);await db.exec('SET ROLE '+(n?'authenticated':'anon'))}async function call(n,a){return (await rows(`select public.${n}(${a.map((_,i)=>'$'+(i+1)).join(',')}) result`,a))[0].result}const deny=(f,re=/required|permission|access|changed|eligible|balance|blocked/i)=>assert.rejects(f,re);async function ok(n,f){await f();passed++;console.log('PASS '+n)}
try{
for(const [name,id] of Object.entries(ids))await db.query('insert into auth.users(id,email) values($1,$2)',[id,name+'@example.test']);await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.super]);await as('super');await call('set_account_access',[ids.manager,'survey_manager','active']);const org=await call('save_organization',[null,{name:'Payable NGO',status:'active'}]),other=await call('save_organization',[null,{name:'Other NGO',status:'active'}]);await call('set_membership',[org,ids.ngo,'ngo_admin','active']);await call('set_membership',[other,ids.otherngo,'ngo_admin','active']);const geo=await call('save_geography',[null,null,'province','Test Province','P212','Synthetic fixture',true]);
await db.exec('RESET ROLE');await db.query("update public.volunteer_profiles set status='verified' where user_id in ($1,$2)",[ids.a,ids.b]);await as('a');await call('set_profile_sharing',[org,true]);await as('b');await call('set_profile_sharing',[org,true]);
await as('manager');const template=await call('publish_survey_template',['Payable survey',[{id:'name',type:'text',label:'Name',required:true}]]);const dates=(await rows("select (current_date-1)::text start,(current_date+3)::text end,current_date::text today"))[0];const project=await call('create_survey_project',[org,'Payable field pilot',template,geo,100,dates.start,dates.end,'Assess needs','v1','Explain collection and use before survey consent.']);

await as('super');
const fundingSource=await call('create_finance_funding_source',[
  org,
  'grant',
  'Legacy payable regression funding',
  'P212-FUNDING-1',
  'PKR',
  'Funding fixture for payable regression tests after the 2.17.2 finance bridge'
]);

await call('record_organization_funding',[
  fundingSource,
  500,
  crypto.randomUUID(),
  'Record funding for legacy payable regression tests'
]);

await as('ngo');
await call('reserve_project_funding',[
  project,
  'PKR',
  500,
  crypto.randomUUID(),
  'Reserve compensation funding for legacy payable regression tests'
]);

await as('manager');
await call('set_survey_assignment',[project,ids.a,true]);
async function fixture(type,user='a',status='active') {await db.exec('RESET ROLE');return (await rows("insert into public.work_assignments(survey_project_id,organization_id,user_id,volunteer_name,organization_name,project_title,source_kind,work_mode,compensation_type,rate,target_surveys,start_date,end_date,status,offered_by,responded_at) values($1,$2,$3,'Volunteer','NGO','Project','shortlist','paid',$4,120.25,100,$5,$6,$7,$8,now()-interval '1 day') returning id",[project,org,ids[user],type,dates.start,dates.end,status,ids.ngo]))[0].id}
const assignment=await fixture('per_verified_survey');await as('a');const response=await call('save_survey_response',[null,project,null,null,'Person','1990-01-01','Household',{name:'Person'},{agreed:true,method:'verbal',capture_authority:'self',governance_version:0},true,0,crypto.randomUUID()]);
await ok('submission alone creates no payable',async()=>assert.equal((await rows('select * from public.work_payable_units')).length,0));
await as('ngo');const v=(await rows('select version from public.survey_responses where id=$1',[response]))[0].version;await call('review_survey_response',[response,'approved','Reviewed independently',v]);let u=(await rows('select * from public.work_payable_units'))[0];assert(u);
await ok('accepted survey creates one immutable rate candidate',async()=>{assert.equal(Number(u.rate),120.25);assert.equal(u.status,'pending');assert.equal(await call('reconcile_survey_payable',[response]),u.id);assert.equal((await rows('select * from public.work_payable_units')).length,1)});
const current=async()=> (await rows('select * from public.work_payable_units where id=$1',[u.id]))[0];
const args=async(action,amount=null,extra={})=>[u.id,action,amount,'Detailed accounting reason',extra.reference??null,extra.date??null,extra.reverses??null,(await current()).version,extra.request??crypto.randomUUID(),extra.receipt??null];
await as('a');await ok('volunteer cannot approve own payable',async()=>deny(async()=>call('act_work_payable',await args('approve'))));
await as('otherngo');await ok('other NGO cannot read statements or units',async()=>{assert.equal((await rows('select * from public.work_payable_units')).length,0);await deny(()=>call('work_payable_statement',[assignment,0]))});
await as('manager');await ok('survey manager has no automatic finance access',async()=>deny(()=>call('work_payable_statement',[assignment,0])));
await as('ngo');await ok('direct journal and unit writes denied',async()=>{await deny(()=>db.exec("update public.work_payable_units set rate=999"));await deny(()=>db.exec('delete from public.work_payable_events'))});
const approve=await args('approve'),approval=await call('act_work_payable',approve);
await ok('approval replay returns same journal event',async()=>{assert.equal(await call('act_work_payable',approve),approval);const changed=[...approve];changed[3]='Different reason';await deny(()=>call('act_work_payable',changed),/different/)});
await ok('stale financial action rejected',async()=>{const stale=[...approve];stale[1]='dispute';stale[8]=crypto.randomUUID();await deny(()=>call('act_work_payable',stale),/changed/)});
const receipt=await call('reserve_payable_receipt',[assignment,'voucher.pdf','application/pdf',100]);
await ok('receipt requires actual matching private object',async()=>deny(async()=>call('act_work_payable',await args('pay',50.10,{reference:'BANK-001',date:dates.today,receipt})),/receipt/));
await db.query("insert into storage.objects(bucket_id,name,metadata) values('work-payable-receipts',$1,$2)",[receipt,{size:100,mimetype:'application/pdf'}]);
await as('a');await ok('unattached receipt remains private to uploader',async()=>{assert.equal((await rows("select * from storage.objects where bucket_id='work-payable-receipts'")).length,0);await deny(()=>call('authorize_payable_receipt',[receipt]))});await as('otherngo');await ok('foreign NGO cannot reserve or view receipts',async()=>{await deny(()=>call('reserve_payable_receipt',[assignment,'foreign.pdf','application/pdf',100]));await deny(()=>call('authorize_payable_receipt',[receipt]))});await as('ngo');
const pay=await args('pay',50.10,{reference:'BANK-001',date:dates.today,receipt});const payment=await call('act_work_payable',pay);
await ok('partial payment and replay preserve exact decimals',async()=>{assert.equal(await call('act_work_payable',pay),payment);const s=await call('work_payable_statement',[assignment,0]);assert.equal(Number(s.totals.balance),70.15);assert.equal(s.rows[0].settlement_status,'partially_paid')});
await as('a');await ok('paid receipt is accessible to its volunteer',async()=>assert.equal(await call('authorize_payable_receipt',[receipt]),receipt));await as('ngo');
await ok('overpayment and invalid precision denied',async()=>{await deny(async()=>call('act_work_payable',await args('pay',100,{reference:'OVER',date:dates.today})));await deny(async()=>call('act_work_payable',await args('pay',1.001,{reference:'BAD',date:dates.today})),/decimals/)});
await ok('duplicate external reference rejected',async()=>deny(async()=>call('act_work_payable',await args('pay',1,{reference:'bank-001',date:dates.today})),/unique/));
await as('a');await call('act_work_payable',await args('dispute'));await as('ngo');await ok('dispute blocks further payment',async()=>deny(async()=>call('act_work_payable',await args('pay',1,{reference:'HOLD',date:dates.today}))));await call('act_work_payable',await args('resolve'));
await db.exec('RESET ROLE');await db.query("update public.survey_responses set status='correction_required',version=version+1 where id=$1",[response]);await as('ngo');
await ok('reversed approval appends adjustment and preserves payment',async()=>{const s=await call('work_payable_statement',[assignment,0]);assert.equal(Number(s.totals.approved),0);assert.equal(Number(s.totals.paid),50.10);assert.equal(Number(s.totals.balance),-50.10);assert.equal(s.rows[0].status,'voided');assert.equal((await rows("select * from public.work_payable_events where kind='payment'")).length,1)});
await call('act_work_payable',await args('reverse_payment',null,{reverses:payment}));await ok('payment reversal is once-only and returns balance to zero',async()=>{assert.equal(Number((await call('work_payable_statement',[assignment,0])).totals.balance),0);await deny(async()=>call('act_work_payable',await args('reverse_payment',null,{reverses:payment})),/Unreversed/)});
await db.exec('RESET ROLE');await db.query("update public.survey_responses set status='approved',version=version+1 where id=$1",[response]);await as('ngo');await ok('reapproval reuses unit with fresh financial approval required',async()=>{assert.equal((await current()).status,'pending');assert.equal((await rows('select * from public.work_payable_units')).length,1)});await call('act_work_payable',await args('approve'));
await ok('retroactive contract amendment refused',async()=>deny(()=>call('offer_work_amendment',[assignment,150,dates.today,'Retroactive terms change'])));
const amendment=await call('offer_work_amendment',[assignment,150,dates.end,'New future agreed rate']);await ok('NGO cannot accept for volunteer',async()=>deny(()=>call('respond_work_amendment',[amendment,'accepted'])));await as('a');await call('respond_work_amendment',[amendment,'accepted']);await as('ngo');await ok('accepted future rate leaves existing earned units unchanged',async()=>{assert.equal(Number((await current()).rate),120.25);assert.equal((await rows('select status from public.work_contract_amendments where id=$1',[amendment]))[0].status,'accepted')});await db.exec('RESET ROLE');await ok('effective terms choose agreed rate by work date',async()=>{const x=(await rows('select app_private.payable_effective_terms(w,$2::date) terms from public.work_assignments w where id=$1',[assignment,dates.end]))[0].terms;assert.equal(Number(x.rate),150);const y=(await rows('select app_private.payable_effective_terms(w,$2::date) terms from public.work_assignments w where id=$1',[assignment,dates.today]))[0].terms;assert.equal(Number(y.rate),120.25)});
await db.exec('RESET ROLE');await ok('contract rate cannot mutate',async()=>deny(()=>db.query('update public.work_assignments set rate=999 where id=$1',[assignment]),/immutable/));
const daily=await fixture('daily_rate','b');
await as('b');

const attendanceTimes=(await rows(
  "select (now()-interval '2 hours')::text start,(now()-interval '30 minutes')::text finish"
))[0];

const dailyStarted=await call('start_assignment_work_session',[
  daily,
  attendanceTimes.start,
  24.8607,
  67.0011,
  20,
  'granted',
  '',
  crypto.randomUUID()
]);

const dailySubmitted=await call('checkout_assignment_work_session',[
  dailyStarted.id,
  attendanceTimes.finish,
  24.8610,
  67.0020,
  25,
  'granted',
  '',
  'Worked field attendance',
  crypto.randomUUID(),
  dailyStarted.version
]);

await as('ngo');

await call('review_attendance_session',[
  dailyStarted.id,
  'approve',
  'Verified attendance for payable regression.',
  dailySubmitted.version
]);

await as('b');

const dailyWorkDate=String(dailyStarted.work_date).slice(0,10);

const day=await call('claim_work_payable',[
  daily,
  dailyWorkDate,
  'Worked field attendance'
]);

await ok(
  'one attendance-backed claim per assignment per day',
  async()=>assert.equal(
    await call('claim_work_payable',[
      daily,
      dailyWorkDate,
      'Retry attendance claim'
    ]),
    day
  )
);

await ok(
  'future attendance rejected',
  async()=>deny(
    ()=>call('claim_work_payable',[
      daily,
      dates.end,
      'Future date claim'
    ])
  )
);
await as('super');await call('set_membership',[org,ids.b,'ngo_admin','active']);await as('b');u=(await rows('select * from public.work_payable_units where id=$1',[day]))[0];await ok('NGO admin cannot approve their own earnings',async()=>deny(async()=>call('act_work_payable',await args('approve'))));await as('ngo');await call('act_work_payable',await args('approve'));
await db.exec('RESET ROLE');await db.query("update public.work_assignments set status='cancelled',cancelled_at=now() where id=$1",[daily]);const fixed=await fixture('fixed_assignment','b');await as('b');await ok('fixed payment requires completed assignment',async()=>deny(()=>call('claim_work_payable',[fixed,dates.today,'Fixed work completed'])));await db.exec('RESET ROLE');await db.query("update public.work_assignments set status='completed',completed_at=now() where id=$1",[fixed]);await as('b');const f=await call('claim_work_payable',[fixed,dates.today,'Fixed work completed']);assert.equal(await call('claim_work_payable',[fixed,dates.today,'Same fixed completion']),f);
await db.exec('RESET ROLE');await ok('journal cannot be rewritten even by maintenance SQL',async()=>deny(()=>db.query("update public.work_payable_events set note='Rewrite' where id=$1",[payment]),/append-only/));
await db.exec('BEGIN');await db.query("insert into public.work_payable_units(assignment_id,source_kind,work_date,rate,currency,terms_snapshot,note,created_by) select $1,'day',current_date-i,120.25,'PKR','{}','Pagination fixture',$2 from generate_series(10,60) i",[daily,ids.b]);await as('b');await ok('statement pages are stable and totals include all units',async()=>{const x=await call('work_payable_statement',[daily,0]),y=await call('work_payable_statement',[daily,1]);assert.equal(x.count,52);assert.equal(x.rows.length,50);assert.equal(y.rows.length,2);assert.equal(new Set([...x.rows,...y.rows].map(r=>r.id)).size,52);assert.equal(x.totals.approved,y.totals.approved)});await db.exec('RESET ROLE;ROLLBACK');
await as('super');await call('set_membership',[org,ids.ngo,'ngo_admin','suspended']);await as('ngo');await ok('suspended NGO membership blocks finance access',async()=>deny(()=>call('work_payable_statement',[assignment,0])));
await as(null);await ok('anonymous accounting access denied',async()=>deny(()=>call('work_payable_statement',[assignment,0])));
console.log(`${passed} workforce payable SQL scenarios passed`);
}finally{await db.close()}
