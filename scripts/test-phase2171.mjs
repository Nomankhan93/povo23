import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { schemaDb } from './schema-test-db.mjs';

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

  let fundingJournal;
  await ok('verified organization funding creates available funds through a balanced idempotent journal and no editable balance field',async()=>{
    await as('super');
    const key=crypto.randomUUID();
    fundingJournal=await call('record_organization_funding',[source,1000,key,'Receive verified grant funds']);
    const retry=await call('record_organization_funding',[source,1000,key,'Receive verified grant funds']);
    assert.equal(retry,fundingJournal);
    const available=(await rows("select id from public.finance_accounts where organization_id=$1 and project_id is null and purpose='organization_available' and currency='PKR'",[orgA]))[0];
    assert(available);
    assert.equal(Number(await call('finance_account_balance',[available.id])),1000);
    const count=(await rows("select count(*)::int c from public.finance_journals where journal_type='organization_funding_received' and organization_id=$1",[orgA]))[0].c;
    assert.equal(count,1);
    const cols=(await rows("select column_name from information_schema.columns where table_schema='public' and table_name='organizations' and column_name='balance'")).length;
    assert.equal(cols,0);
  });

  let reserveJournal;
  await ok('NGO Admin can reserve own organization available funds into a project and funding status derives available reserved committed and spent buckets',async()=>{
    await as('ngoA');
    const key=crypto.randomUUID();
    reserveJournal=await call('reserve_project_funding',[project,'PKR',300,key,'Reserve initial field budget']);
    const retry=await call('reserve_project_funding',[project,'PKR',300,key,'Reserve initial field budget']);
    assert.equal(retry,reserveJournal);
    const status=await call('project_funding_status',[project,'PKR']);
    assert.equal(Number(status.organization_available),700);
    assert.equal(Number(status.project_reserved),300);
    assert.equal(Number(status.project_committed),0);
    assert.equal(Number(status.project_spent),0);
    assert.equal(Number(status.project_funding_total),300);
    assert.equal(status.can_manage,true);
    assert.equal(status.can_record_external,false);
  });

  await ok('reservation never overdraws organization available funds and conflicting retries cannot mutate an accepted reservation',async()=>{
    await as('ngoA');
    await deny(()=>call('reserve_project_funding',[project,'PKR',701,crypto.randomUUID(),'Attempt to overdraw available funding']),/insufficient/i);
    const conflictKey=crypto.randomUUID();
    await call('reserve_project_funding',[project,'PKR',50,conflictKey,'Additional approved reserve']);
    await deny(()=>call('reserve_project_funding',[project,'PKR',60,conflictKey,'Different retry payload']),/idempotency|different/i);
    const status=await call('project_funding_status',[project,'PKR']);
    assert.equal(Number(status.organization_available),650);
    assert.equal(Number(status.project_reserved),350);
  });

  await ok('project manager focal and another NGO cannot read or mutate project funding despite operational project roles',async()=>{
    await as('manager');
    await deny(()=>call('project_funding_status',[project,'PKR']),/finance access/i);
    await deny(()=>call('reserve_project_funding',[project,'PKR',10,crypto.randomUUID(),'Manager should not reserve']),/permission/i);
    await as('focal');
    await deny(()=>call('project_funding_status',[project,'PKR']),/finance access/i);
    await as('ngoB');
    await deny(()=>call('reserve_project_funding',[project,'PKR',10,crypto.randomUUID(),'Other NGO should not reserve']),/permission/i);
    const own=await call('project_funding_status',[projectB,'PKR']);
    assert.equal(Number(own.organization_available),0);
  });

  await ok('NGO Admin can release only currently reserved funds back to organization available balance',async()=>{
    await as('ngoA');
    const journal=await call('release_project_funding',[project,'PKR',125,crypto.randomUUID(),'Release unused recruitment reserve']);
    assert(journal);
    let status=await call('project_funding_status',[project,'PKR']);
    assert.equal(Number(status.organization_available),775);
    assert.equal(Number(status.project_reserved),225);
    await deny(()=>call('release_project_funding',[project,'PKR',226,crypto.randomUUID(),'Cannot release more than reserved']),/exceeds/i);
    status=await call('project_funding_status',[project,'PKR']);
    assert.equal(Number(status.project_reserved),225);
  });

  await ok('project funding history is append-only and shows controlled reserve and release journals without exposing generic mutation',async()=>{
    await as('ngoA');
    const history=await call('project_funding_history',[project,'PKR',null,50]);
    assert(history.rows.length>=3);
    assert(history.rows.some((x)=>x.journal_type==='project_funding_reserved'));
    assert(history.rows.some((x)=>x.journal_type==='project_funding_released'));
    await deny(()=>call('post_finance_journal',[orgA,project,'manual_override','PKR',null,null,crypto.randomUUID(),'NGO must not post arbitrary finance entries',[]]),/finance administration/i);
  });

  await ok('funding accounts are standardized by organization project and currency and remain compatible with the 2.17.0 immutable ledger',async()=>{
    const accounts=await rows("select purpose,account_class,count(*)::int c from public.finance_accounts where organization_id=$1 and currency='PKR' group by purpose,account_class order by purpose",[orgA]);
    const purposes=new Map(accounts.map(x=>[x.purpose,{class:x.account_class,count:x.c}]));
    assert.equal(purposes.get('organization_available')?.class,'asset');
    assert.equal(purposes.get('project_reserved')?.class,'asset');
    assert.equal(purposes.get('project_committed')?.class,'asset');
    assert.equal(purposes.get('project_spent')?.class,'expense');
    assert.equal((await rows("select count(*)::int c from public.finance_journals j where j.organization_id=$1 and not exists(select 1 from public.finance_postings p where p.journal_id=j.id)",[orgA]))[0].c,0);
  });

  await ok('2.17.1 adds funding and reservation only; payable-event finance bridge and providers remain deferred',async()=>{
    const migration=readFileSync('supabase/migrations/20261008000700_project_funding_reservation.sql','utf8');
    assert.match(migration,/create table public\.finance_funding_sources/i);
    assert.match(migration,/reserve_project_funding/i);
    assert.match(migration,/release_project_funding/i);
    assert.match(migration,/organization_available/i);
    assert.match(migration,/project_reserved/i);
    assert.doesNotMatch(migration,/source_payable_event_id/i);
    assert.doesNotMatch(migration,/jazzcash|withdrawal/i);
    const ui=readFileSync('src/features/finance/ProjectFundingWorkspace.tsx','utf8');
    const shell=readFileSync('src/app/AppShell.tsx','utf8');
    assert.match(ui,/Project funding & reservation/i);
    assert.match(ui,/organization_available|Organization available/i);
    assert.match(shell,/Project funding/);
    assert.equal((await rows("select count(*)::int c from information_schema.tables where table_schema='public' and table_name in ('work_payable_units','work_payable_events','work_payable_receipts','work_contract_amendments')"))[0].c,4);
  });

  console.log(`\n${passed} POEM 2.17.1 project-funding / reservation scenarios passed.`);
} finally {
  await db.close();
}
