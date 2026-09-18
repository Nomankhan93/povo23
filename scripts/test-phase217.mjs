import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { schemaDb } from './schema-test-db.mjs';

const db = await schemaDb();
let passed = 0;
const ids = Object.fromEntries(
  ['super','ngoA','ngoB','manager','focal'].map((name,i)=>[
    name,`a1700000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,
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
const deny=(fn,re=/permission|required|immutable|balanced|finance|access|currency|organization|idempotency|different/i)=>assert.rejects(fn,re);

try{
  for(const [name,id] of Object.entries(ids)) await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${name}@example.test`]);
  await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.super]);
  await as('super');

  const orgA=await call('save_organization',[null,{name:'2.17 Finance NGO A',status:'active'}]);
  const orgB=await call('save_organization',[null,{name:'2.17 Finance NGO B',status:'active'}]);
  await call('set_membership',[orgA,ids.ngoA,'ngo_admin','active']);
  await call('set_membership',[orgB,ids.ngoB,'ngo_admin','active']);
  await call('set_membership',[orgA,ids.manager,'member','active']);
  await call('set_membership',[orgA,ids.focal,'member','active']);

  const province=await call('save_geography',[null,null,'province','2.17 Province','A170P','Fixture',true]);
  const division=await call('save_geography',[null,province,'division','2.17 Division','A170D','Fixture',true]);
  const district=await call('save_geography',[null,division,'district','2.17 District','A170X','Fixture',true]);
  const taluka=await call('save_geography',[null,district,'taluka','2.17 Taluka','A170T','Fixture',true]);
  const template=await call('publish_survey_template',['2.17 Finance Template',[{id:'q',label:'Question',type:'text',required:true}]]);
  const dates=(await rows("select ((now() at time zone 'UTC')::date-1)::text start,((now() at time zone 'UTC')::date+30)::text finish,current_date::text today"))[0];
  const project=await call('create_survey_project',[orgA,'2.17 Finance Project',template,district,100,dates.start,dates.finish,'Validate immutable double-entry finance core','v1','Explain the project and obtain consent.']);

  await as('ngoA');
  await call('assign_project_staff',[project,ids.manager,'project_manager',[],dates.today,null]);
  await call('assign_project_staff',[project,ids.focal,'area_focal_person',[taluka],dates.today,null]);

  let clearing,available,reserved,otherAvailable;
  await ok('finance core creates scoped accounts only through POEM finance administration and keeps direct writes closed',async()=>{
    await as('super');
    clearing=await call('create_finance_account',[null,null,null,'POEM:CLEARING:PKR','POEM PKR clearing','asset','poem_clearing','PKR']);
    available=await call('create_finance_account',[orgA,null,null,'ORG:A:AVAILABLE:PKR','NGO A available funds','asset','organization_available','PKR']);
    reserved=await call('create_finance_account',[orgA,project,null,'PROJECT:A:RESERVED:PKR','Project A reserved funds','asset','project_reserved','PKR']);
    otherAvailable=await call('create_finance_account',[orgB,null,null,'ORG:B:AVAILABLE:PKR','NGO B available funds','asset','organization_available','PKR']);
    await as('ngoA');
    await deny(()=>call('create_finance_account',[orgA,null,null,'ORG:A:FAKE:PKR','Unauthorized account','asset','fake_account','PKR']),/finance administration/i);
    await deny(()=>db.query("insert into public.finance_accounts(organization_id,code,name,account_class,purpose,currency,created_by) values($1,'ORG:A:DIRECT:PKR','Direct','asset','direct','PKR',$2)",[orgA,ids.ngoA]),/permission/i);
  });

  await ok('finance read scope is organization-bound; NGO Admin sees own ledger while project staff and other NGOs do not',async()=>{
    await as('ngoA');
    assert.equal((await rows('select id from public.finance_accounts where id=$1',[available])).length,1);
    assert.equal((await rows('select id from public.finance_accounts where id=$1',[otherAvailable])).length,0);
    assert.equal((await rows('select id from public.finance_accounts where id=$1',[clearing])).length,0);
    await as('ngoB');
    assert.equal((await rows('select id from public.finance_accounts where id=$1',[available])).length,0);
    await as('manager');
    assert.equal((await rows('select id from public.finance_accounts where id=$1',[available])).length,0);
    await deny(()=>call('finance_scope_summary',[orgA,null]),/finance access/i);
    await as('focal');
    await deny(()=>call('finance_scope_summary',[orgA,project]),/finance access/i);
  });

  let seedJournal;
  await ok('balanced journal posts atomically and balances are derived from debit and credit postings',async()=>{
    await as('super');
    const key=crypto.randomUUID();
    seedJournal=await call('post_finance_journal',[
      orgA,null,'opening_test','PKR','test_seed','org-a-opening',key,'Seed finance-core test funds',[
        {account_id:available,direction:'debit',amount:'1000.0000',memo:'Organization available funds'},
        {account_id:clearing,direction:'credit',amount:'1000.0000',memo:'POEM clearing counter-entry'},
      ],
    ]);
    assert(seedJournal);
    assert.equal(Number(await call('finance_account_balance',[available])),1000);
    assert.equal(Number(await call('finance_account_balance',[clearing])),-1000);
    const posting=(await rows('select count(*)::int c from public.finance_postings where journal_id=$1',[seedJournal]))[0].c;
    assert.equal(posting,2);
  });

  let transferJournal;let transferKey;let transferPayload;
  await ok('project transfer is balanced, source-scoped and produces separate organization/project derived balances',async()=>{
    await as('super');
    transferKey=crypto.randomUUID();
    transferPayload=[
      {account_id:reserved,direction:'debit',amount:'250.0000',memo:'Move funds into project reserve'},
      {account_id:available,direction:'credit',amount:'250.0000',memo:'Reduce organization available bucket'},
    ];
    transferJournal=await call('post_finance_journal',[
      orgA,project,'internal_transfer','PKR','project_reservation_test',project,transferKey,'Move test funds to project reserve',transferPayload,
    ]);
    assert.equal(Number(await call('finance_account_balance',[available])),750);
    assert.equal(Number(await call('finance_account_balance',[reserved])),250);
    await as('ngoA');
    const orgSummary=await call('finance_scope_summary',[orgA,null]);
    const projectSummary=await call('finance_scope_summary',[orgA,project]);
    assert.equal(orgSummary.accounts.find((x)=>x.id===available).balance,750);
    assert.equal(projectSummary.accounts.find((x)=>x.id===reserved).balance,250);
  });

  await ok('unbalanced, cross-currency and cross-organization postings are rejected before a journal can exist',async()=>{
    await as('super');
    await deny(()=>call('post_finance_journal',[
      orgA,null,'bad_unbalanced','PKR',null,null,crypto.randomUUID(),'Reject unbalanced test journal',[
        {account_id:available,direction:'debit',amount:'20'},
        {account_id:clearing,direction:'credit',amount:'10'},
      ],
    ]),/balanced/i);
    await deny(()=>call('post_finance_journal',[
      orgA,null,'bad_cross_org','PKR',null,null,crypto.randomUUID(),'Reject cross organization posting',[
        {account_id:available,direction:'debit',amount:'10'},
        {account_id:otherAvailable,direction:'credit',amount:'10'},
      ],
    ]),/organization/i);
    const usd=await call('create_finance_account',[null,null,null,'POEM:CLEARING:USD','POEM USD clearing','asset','poem_clearing','USD']);
    await deny(()=>call('post_finance_journal',[
      orgA,null,'bad_currency','PKR',null,null,crypto.randomUUID(),'Reject mixed currency posting',[
        {account_id:available,direction:'debit',amount:'10'},
        {account_id:usd,direction:'credit',amount:'10'},
      ],
    ]),/currency/i);
  });

  await ok('idempotency and source uniqueness return the same journal for exact retries and reject conflicting retries',async()=>{
    await as('super');
    const same=await call('post_finance_journal',[
      orgA,project,'internal_transfer','PKR','project_reservation_test',project,transferKey,'Move test funds to project reserve',transferPayload,
    ]);
    assert.equal(same,transferJournal);
    const sameSourceNewKey=await call('post_finance_journal',[
      orgA,project,'internal_transfer','PKR','project_reservation_test',project,crypto.randomUUID(),'Move test funds to project reserve',transferPayload,
    ]);
    assert.equal(sameSourceNewKey,transferJournal);
    await deny(()=>call('post_finance_journal',[
      orgA,project,'internal_transfer','PKR','project_reservation_test',project,transferKey,'Conflicting retry payload',[
        {account_id:reserved,direction:'debit',amount:'300'},
        {account_id:available,direction:'credit',amount:'300'},
      ],
    ]),/idempotency|different/i);
    assert.equal((await rows("select count(*)::int c from public.finance_journals where reference_type='project_reservation_test' and reference_id=$1",[project]))[0].c,1);
  });

  await ok('posted accounts, journals and postings are append-only even through privileged direct SQL',async()=>{
    await db.exec('RESET ROLE');
    await assert.rejects(()=>db.query("update public.finance_journals set memo='mutated' where id=$1",[transferJournal]),/immutable|reversal/i);
    await assert.rejects(()=>db.query("delete from public.finance_postings where journal_id=$1",[transferJournal]),/immutable|reversal/i);
    await assert.rejects(()=>db.query("update public.finance_accounts set name='mutated' where id=$1",[available]),/immutable/i);
  });

  await ok('reversal creates an opposite balanced journal exactly once and leaves the original journal untouched',async()=>{
    await as('super');
    const reversalKey=crypto.randomUUID();
    const reversal=await call('reverse_finance_journal',[transferJournal,reversalKey,'Reverse test project transfer']);
    const retry=await call('reverse_finance_journal',[transferJournal,reversalKey,'Reverse test project transfer']);
    assert.equal(retry,reversal);
    assert.equal(Number(await call('finance_account_balance',[available])),1000);
    assert.equal(Number(await call('finance_account_balance',[reserved])),0);
    const j=(await rows('select reverses_journal_id,journal_type from public.finance_journals where id=$1',[reversal]))[0];
    assert.equal(j.reverses_journal_id,transferJournal);
    assert.equal(j.journal_type,'reversal');
    const original=(await rows('select memo,reverses_journal_id from public.finance_journals where id=$1',[transferJournal]))[0];
    assert.equal(original.reverses_journal_id,null);
    await deny(()=>call('reverse_finance_journal',[transferJournal,crypto.randomUUID(),'Different reversal request']),/already reversed|different/i);
  });

  await ok('finance core does not replace worker payables and defers funding/reservation/payable bridges to later 2.17 releases',async()=>{
    const migration=readFileSync('supabase/migrations/20261008000600_finance_core_double_entry_ledger.sql','utf8');
    assert.match(migration,/create table public\.finance_accounts/i);
    assert.match(migration,/create table public\.finance_journals/i);
    assert.match(migration,/create table public\.finance_postings/i);
    assert.doesNotMatch(migration,/create table public\.work_payable_units/i);
    assert.doesNotMatch(migration,/create table public\.work_payable_events/i);
    assert.doesNotMatch(migration,/source_payable_event_id/i);
    assert.doesNotMatch(migration,/jazzcash|withdrawal/i);
    assert.equal((await rows("select count(*)::int c from information_schema.tables where table_schema='public' and table_name in ('work_payable_units','work_payable_events','work_payable_receipts','work_contract_amendments')"))[0].c,4);
  });

  console.log(`\n${passed} POEM 2.17.0 finance-core / double-entry scenarios passed.`);
} finally {
  await db.close();
}
