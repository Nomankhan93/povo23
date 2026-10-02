import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { schemaDb } from './schema-test-db.mjs';

import ts from 'typescript';
const sourceCode=ts.transpileModule(readFileSync('src/features/finance/fundingRequest.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};new Function('module','exports',sourceCode)(mod,mod.exports);
const {executeFundingRequest,retainFundingRequest,readFundingRequest,clearFundingRequest}=mod.exports;
const storage=new Map();globalThis.sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
const db=await schemaDb();
let passed=0;
const ids=Object.fromEntries(['super','ngoA','ngoB','manager','focal'].map((name,i)=>[name,`a1710000-0000-4000-8000-${String(i+1).padStart(12,'0')}`]));
const rows=async(q,p=[]) => (await db.query(q,p)).rows;
async function as(name){await db.exec('RESET ROLE');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[name?ids[name]:'']);await db.exec(`SET ROLE ${name?'authenticated':'anon'}`)}
async function call(name,args){return (await rows(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args))[0].result}
async function ok(name,fn){await fn();passed+=1;console.log(`PASS ${name}`)}
const deny=(fn,re=/permission|required|fund|available|reservation|organization|active|immutable|access|insufficient|exceeds/i)=>assert.rejects(fn,re);

try{
  for(const [name,id] of Object.entries(ids)) await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${name}@example.test`]);
  await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.super]);
  await as('super');

  const orgA=await call('save_organization',[null,{name:'2.17.1 Funding NGO A',status:'active'}]);
  const orgB=await call('save_organization',[null,{name:'2.17.1 Funding NGO B',status:'active'}]);
  await call('set_membership',[orgA,ids.ngoA,'ngo_admin','active']);
  await call('set_membership',[orgB,ids.ngoB,'ngo_admin','active']);
  await call('set_membership',[orgA,ids.manager,'member','active']);
  await call('set_membership',[orgA,ids.focal,'member','active']);

  const province=await call('save_geography',[null,null,'province','2.17.1 Province','A171P','Fixture',true]);
  const division=await call('save_geography',[null,province,'division','2.17.1 Division','A171D','Fixture',true]);
  const district=await call('save_geography',[null,division,'district','2.17.1 District','A171X','Fixture',true]);
  const taluka=await call('save_geography',[null,district,'taluka','2.17.1 Taluka','A171T','Fixture',true]);
  const template=await call('publish_survey_template',['2.17.1 Funding Template',[{id:'q',label:'Question',type:'text',required:true}]]);
  const dates=(await rows("select ((now() at time zone 'UTC')::date-1)::text start,((now() at time zone 'UTC')::date+30)::text finish,current_date::text today"))[0];
  const project=await call('create_survey_project',[orgA,'2.17.1 Funded Project',template,district,100,dates.start,dates.finish,'Validate controlled project funding and reservations','v1','Explain the project and obtain consent.']);
  const projectB=await call('create_survey_project',[orgB,'2.17.1 Other Project',template,district,50,dates.start,dates.finish,'Validate organization isolation','v1','Explain the project and obtain consent.']);

  await as('ngoA');
  await call('assign_project_staff',[project,ids.manager,'project_manager',[],dates.today,null]);
  await call('assign_project_staff',[project,ids.focal,'area_focal_person',[taluka],dates.today,null]);

  let source;
  await ok('only POEM finance authority can register immutable funding sources while NGO Admin can read its own source metadata',async()=>{
    await as('ngoA');
    await deny(()=>call('create_finance_funding_source',[orgA,'grant','Restricted grant','GRANT-001','PKR','Grant source']),/finance administration/i);
    await as('super');
    source=await call('create_finance_funding_source',[orgA,'grant','Restricted grant','GRANT-001','PKR','Grant source for project funding']);
    assert(source);
    await as('ngoA');
    assert.equal((await rows('select id from public.finance_funding_sources where id=$1',[source])).length,1);
    await as('ngoB');
    assert.equal((await rows('select id from public.finance_funding_sources where id=$1',[source])).length,0);
    await db.exec('RESET ROLE');
    await assert.rejects(()=>db.query("update public.finance_funding_sources set name='Changed' where id=$1",[source]),/immutable/i);
  });


  const sent=[];
  const send=async op=>{
    sent.push(structuredClone(op));
    const entries=Object.entries(op.args);
    return (await rows('select public.'+op.name+'('+entries.map(([key],i)=>key+'=>$'+(i+1)).join(',')+') result',entries.map(([,value])=>value)))[0].result;
  };
  const lookup=async op=>(await rows('select id from public.finance_journals where idempotency_key=$1 and organization_id=$2 and created_by=$3',[op.args.p_idempotency_key,op.organization,op.userId])).length===1;
  const count=async key=>(await rows('select count(*)::int n from public.finance_journals where idempotency_key=$1',[key]))[0].n;
  await as('super');
  const receipt={name:'record_organization_funding',organization:orgA,userId:ids.super,uncertain:false,args:{p_source:source,p_amount:1000,p_idempotency_key:crypto.randomUUID(),p_memo:'Verified test grant'}};
  assert.equal((await executeFundingRequest(receipt,send,lookup)).state,'success');
  assert.equal((await executeFundingRequest(receipt,send,lookup)).state,'success');
  assert.equal(await count(receipt.args.p_idempotency_key),1);
  await assert.rejects(()=>send({...receipt,args:{...receipt.args,p_amount:999}}),/idempotency|different|payload/i);
  console.log('PASS funding receipt and identical replay create exactly one journal; changed payload rejected');
  await as('ngoA');
  const reserve={name:'reserve_project_funding',organization:orgA,userId:ids.ngoA,uncertain:false,args:{p_project:project,p_currency:'PKR',p_amount:1000,p_idempotency_key:crypto.randomUUID(),p_reason:'Reserve entire available balance'}};
  assert.equal((await executeFundingRequest(reserve,async op=>{await send(op);throw new TypeError('Response lost')},lookup)).state,'uncertain');
  assert.equal(await count(reserve.args.p_idempotency_key),1);
  await assert.rejects(()=>send(reserve),/Insufficient organization available funds/);
  retainFundingRequest({...reserve,uncertain:true});
  assert.deepEqual(readFundingRequest(ids.ngoA).args,reserve.args);
  assert.equal((await executeFundingRequest(readFundingRequest(ids.ngoA),send,lookup)).state,'success');
  assert.equal(await count(reserve.args.p_idempotency_key),1);
  clearFundingRequest(ids.ngoA);assert.equal(readFundingRequest(ids.ngoA),null);
  console.log('PASS committed/lost reservation reconciles under RLS with original key even after balance exhaustion');
  const release={name:'release_project_funding',organization:orgA,userId:ids.ngoA,uncertain:false,args:{p_project:project,p_currency:'PKR',p_amount:1000,p_idempotency_key:crypto.randomUUID(),p_reason:'Release retained reservation'}};
  assert.equal((await executeFundingRequest(release,async()=>{throw new TypeError('Transport interrupted before commit')},lookup)).state,'uncertain');
  assert.equal((await executeFundingRequest({...release,uncertain:true},send,lookup)).state,'success');
  assert.equal(await count(release.args.p_idempotency_key),1);
  assert.deepEqual(sent.at(-1).args,release.args);
  console.log('PASS uncommitted uncertain release retries with identical key/payload and creates one journal');
  const rejected={...reserve,args:{...reserve.args,p_amount:1001,p_idempotency_key:crypto.randomUUID()}};
  assert.equal((await executeFundingRequest(rejected,send,lookup)).state,'rejected');
  assert.equal(await count(rejected.args.p_idempotency_key),0);
  assert.equal((await executeFundingRequest({...rejected,uncertain:true},send,lookup)).state,'uncertain');
  await as('ngoB');assert.equal(await lookup(reserve),false);
  console.log('PASS confirmed rejection is actionable; uncertain prior outcome cannot be cleared by later rejection; lookup respects isolation');
}finally{await db.close()}
