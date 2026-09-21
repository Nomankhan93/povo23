import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {schemaDb} from './schema-test-db.mjs';

const db=await schemaDb();
const ids=Object.fromEntries(['super','ngo','manager','worker','other'].map((n,i)=>[n,`a2260000-0000-4000-8000-${String(i+1).padStart(12,'0')}`]));
const rows=async(q,p=[]) => (await db.query(q,p)).rows;
async function as(name){await db.exec('RESET ROLE');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[name?ids[name]:'']);await db.exec(`SET ROLE ${name?'authenticated':'anon'}`)}
async function call(name,args=[]){return (await rows(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args))[0].result}
const deny=(fn,re=/permission|required|fund|finance|closure|reconcile/i)=>assert.rejects(fn,re);
let passed=0;const ok=async(name,fn)=>{await fn();passed++;console.log(`PASS ${name}`)};

try{
  const migration=readFileSync('supabase/migrations/20261010000100_paid_work_funding_assurance_closure.sql','utf8');
  await ok('2.26 migration preserves the existing ledger/payable architecture and adds guarded commitment plus closure surfaces',async()=>{
    assert.match(migration,/project_funding_commitments/);
    assert.match(migration,/guard_paid_opportunity_funding/);
    assert.match(migration,/advance_project_closure/);
    assert.match(migration,/financially_reconciled/);
    assert.doesNotMatch(migration,/JazzCash|Easypaisa|bank_account|IBAN|live provider/i);
    const ui=readFileSync('src/features/finance/ProjectFundingWorkspace.tsx','utf8');
    assert.match(ui,/PAID WORK FUNDING ASSURANCE/);assert.match(ui,/project_funding_assurance/);assert.match(ui,/PROJECT FINANCE CLOSURE/);assert.match(ui,/advance_project_closure/);assert.match(ui,/Release expired commitments/);
  });
  for(const [name,id] of Object.entries(ids)) await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${name}@example.test`]);
  await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.super]);
  await as('super');
  const org=await call('save_organization',[null,{name:'2.26 Funding Assurance NGO',status:'active'}]);
  await call('set_membership',[org,ids.ngo,'ngo_admin','active']);
  await call('set_membership',[org,ids.manager,'member','active']);
  const province=await call('save_geography',[null,null,'province','2.26 Province','A226P','Fixture',true]);
  const division=await call('save_geography',[null,province,'division','2.26 Division','A226D','Fixture',true]);
  const district=await call('save_geography',[null,division,'district','2.26 District','A226X','Fixture',true]);
  const taluka=await call('save_geography',[null,district,'taluka','2.26 Taluka','A226T','Fixture',true]);
  const template=await call('publish_survey_template',['2.26 Funding Template',[{id:'q',label:'Question',type:'text',required:true}]]);
  const d=(await rows("select ((now() at time zone 'UTC')::date+1)::text start,((now() at time zone 'UTC')::date+30)::text finish,((now() at time zone 'UTC')::date+1)::text opp_start,((now() at time zone 'UTC')::date+10)::text opp_end,(now()+interval '1 day')::text reply"))[0];
  const project=await call('create_survey_project',[org,'2.26 Funded Project',template,district,10,d.start,d.finish,'Validate paid funding assurance and closure','v1','Explain the project before field work.']);
  await as('ngo');
  const comp=await call('project_compensation_status',[project]);
  await call('set_project_compensation_defaults',[project,'paid','daily_rate','PKR',100,'PKR 100 daily rate','Configure funding assurance test',comp.version]);
  await as('super');
  const source=await call('create_finance_funding_source',[org,'grant','2.26 Assurance Grant','A226-GRANT','PKR','Verified funding for assurance test']);
  await call('record_organization_funding',[source,100,crypto.randomUUID(),'Record verified project funding']);
  await as('ngo');
  await call('reserve_project_funding',[project,'PKR',100,crypto.randomUUID(),'Reserve one paid opportunity']);
  await as('ngo');
  const opportunity=await call('create_recruitment_opportunity',[project,'Funded paid opportunity','One funded field assignment',taluka,d.opp_start,d.opp_end,d.reply,'paid','Ignored compatibility text',1,'Survey','Urdu','all','Funded coverage required',true]);
  await ok('published paid opportunity creates an atomic pending funding commitment',async()=>{
    const c=(await rows('select project_id,amount,status from public.project_funding_commitments where opportunity_id=$1',[opportunity]))[0];
    assert.equal(c.project_id,project);assert.equal(Number(c.amount),100);assert.equal(c.status,'pending');
    const assurance=await call('project_funding_assurance',[project,'PKR']);
    assert.equal(Number(assurance.pending_offer_commitment),100);assert.equal(assurance.paid_offer_gate,true);assert.equal(Number(assurance.coverage_available),0);
  });
  await ok('atomic funding gate rejects a second underfunded paid opportunity',async()=>{
    await deny(()=>call('create_recruitment_opportunity',[project,'Unfunded paid opportunity','Should fail without coverage',taluka,d.opp_start,d.opp_end,d.reply,'paid','Ignored',1,'Survey','Urdu','all','No remaining coverage',true]),/Insufficient funded coverage/);
  });
  await db.exec('RESET ROLE');
  await db.query('update public.work_opportunities set reply_by=now()-interval \'1 second\' where id=$1',[opportunity]);
  await as('ngo');
  await call('sweep_expired_project_funding_commitments',[project,100]);
  await ok('expired opportunity commitments release without changing immutable ledger balances',async()=>{
    const c=(await rows('select status,released_at from public.project_funding_commitments where opportunity_id=$1',[opportunity]))[0];
    assert.equal(c.status,'released');assert.ok(c.released_at);
    const assurance=await call('project_funding_assurance',[project,'PKR']);
    assert.equal(Number(assurance.pending_offer_commitment),0);assert.equal(Number(assurance.coverage_available),100);
  });
  await as('ngo');
  await call('advance_project_closure',[project,'collection_closed','Recruitment and field collection are closed']);
  await call('advance_project_closure',[project,'operational_completed','All operational field work is complete']);
  const closure=await call('advance_project_closure',[project,'financially_reconciled','Payables and project finance reconciled']);
  assert.equal(closure.state,'financially_reconciled');
  await ok('closure lifecycle keeps collection, operations, finance and final closure distinct',async()=>{
    const final=await call('advance_project_closure',[project,'fully_closed','Project is fully closed after finance reconciliation']);
    assert.equal(final.state,'fully_closed');assert.equal(final.status,'closed');
    await deny(()=>call('advance_project_closure',[project,'collection_closed','Invalid backwards transition']),/no longer|Financial reconciliation|required/i);
  });
  await as('other');
  await ok('unrelated organization cannot read funding assurance or advance closure',async()=>{
    await deny(()=>call('project_funding_assurance',[project,'PKR']),/finance access|permission|Organization/);
    await deny(()=>call('advance_project_closure',[project,'fully_closed','No access']),/permission|Project management/);
  });
  console.log(`\n${passed} FieldLance 2.26 funding assurance / closure scenarios passed.`);
}finally{await db.close()}
