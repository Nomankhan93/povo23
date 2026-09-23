import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { schemaDb } from './schema-test-db.mjs';

let passed=0;
async function ok(name,fn){await fn();passed++;console.log('PASS',name)}

const migration=readFileSync('supabase/migrations/20261013000420_automatic_project_marketplace_publishing.sql','utf8');
const marketplace=readFileSync('src/features/workforce/WorkforceMarketplace.tsx','utf8');
const team=readFileSync('src/features/projects/ProjectTeamWorkspace.tsx','utf8');

await ok('2.38.1 makes a published project the canonical automatic marketplace unit',async()=>{
  assert.match(migration,/marketplace_origin text not null default 'manual'/);
  assert.match(migration,/marketplace_current boolean not null default false/);
  assert.match(migration,/work_opportunities_project_auto_current_unique/);
  assert.match(migration,/auto_publish_project_marketplace/);
  assert.match(migration,/visibility='all'/);
});

await ok('automatic project marketplace remains independent of permanent profile sharing',async()=>{
  assert.doesNotMatch(migration,/insert into public\.profile_shares/i);
  assert.match(migration,/recruitment_profile_snapshot/);
  assert.match(migration,/Respond to the existing project invitation instead of applying/);
  assert.match(migration,/invited\.survey_project_id=o\.survey_project_id/);
  assert.match(marketplace,/No permanent Organization profile access is required/);
  assert.match(marketplace,/application-scoped recruitment snapshot/);
});

await ok('automatic listing follows project recruitment state and compensation rollover',async()=>{
  assert.match(migration,/sync_project_marketplace_state/);
  assert.match(migration,/new\.compensation_version is distinct from old\.compensation_version/);
  assert.match(migration,/marketplace_current=false/);
  assert.match(migration,/Automatic project marketplace listing follows the project recruitment plan/);
  assert.match(team,/rolled forward the automatic marketplace listing/);
});

await ok('workforce UX makes organization-first worker search optional',async()=>{
  assert.match(marketplace,/Available projects/);
  assert.match(marketplace,/every published project already has an automatic all-Field-Workers marketplace listing/i);
  assert.match(marketplace,/OPTIONAL DIRECT RECRUITMENT/);
  assert.match(marketplace,/Organizations do not need to search workers first/);
});

await ok('2.38.1 migration follows the 2.38 permission hotfix',async()=>{
  const migrations=readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort();
  const prior='20261013000410_attendance_rls_helper_permissions.sql';
  const current='20261013000420_automatic_project_marketplace_publishing.sql';
  assert.equal(migrations.indexOf(current),migrations.indexOf(prior)+1);
});

const db=await schemaDb();
const ids={super:'a3810000-0000-4000-8000-000000000001',ngo:'a3810000-0000-4000-8000-000000000002',worker:'a3810000-0000-4000-8000-000000000003'};
const rows=async(q,p=[])=>(await db.query(q,p)).rows;
async function as(name){await db.exec('RESET ROLE');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[name?ids[name]:'']);await db.exec(`SET ROLE ${name?'authenticated':'anon'}`)}
async function call(name,args=[]){return (await rows(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args))[0].result}

try{
  for(const [name,id] of Object.entries(ids))await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${name}@phase2381.test`]);
  await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.super]);
  await as('super');
  const org=await call('save_organization',[null,{name:'Automatic Marketplace Organization',status:'active'}]);
  await call('set_membership',[org,ids.ngo,'ngo_admin','active']);
  const province=await call('save_geography',[null,null,'province','Auto Market Province','A381P','Fixture',true]);
  const division=await call('save_geography',[null,province,'division','Auto Market Division','A381D','Fixture',true]);
  const district=await call('save_geography',[null,division,'district','Auto Market District','A381X','Fixture',true]);
  const template=await call('publish_survey_template',['Auto marketplace template',[{id:'q',label:'Question',type:'text',required:true}]]);
  const dates=(await rows("select current_date::text start,(current_date+30)::text finish"))[0];
  const projectDraft=crypto.randomUUID();
  await as('ngo');
  const projectDraftVersion=await call('save_organization_project_draft',[
    projectDraft,org,'Automatic Marketplace Project',template,district,100,dates.start,dates.finish,
    'Automatic marketplace fixture project purpose','a381','Automatic marketplace consent fixture.',0
  ]);
  const project=await call('publish_organization_project_draft',[projectDraft,projectDraftVersion]);

  await ok('Partner Organization project publication automatically creates one current all-worker listing',async()=>{
    const found=await rows("select * from public.work_opportunities where survey_project_id=$1 and marketplace_origin='project_auto' and marketplace_current",[project]);
    assert.equal(found.length,1);
    assert.equal(found[0].visibility,'all');
    assert.equal(found[0].publication_state,'published');
    assert.equal(found[0].applications_open,true);
    assert.equal(found[0].work_mode,'volunteer');
  });

  await db.exec('RESET ROLE');
  await db.query("update public.volunteer_profiles set status='verified',geography_id=$1,details=jsonb_build_object('full_name','Marketplace Worker','skills','Data collection','languages','Sindhi') where user_id=$2",[district,ids.worker]);

  let opportunity;
  await ok('worker discovers the project without permanent Organization profile access',async()=>{
    assert.equal((await rows('select * from public.profile_shares where organization_id=$1 and user_id=$2',[org,ids.worker])).length,0);
    await as('worker');
    const available=await call('available_work_opportunities',[0,null,null,null,'',null,null]);
    assert.equal(available.total,1);
    assert.equal(available.rows[0].survey_project_id,project);
    assert.equal(available.rows[0].marketplace_origin,'project_auto');
    assert.equal(available.rows[0].can_apply,true);
    opportunity=available.rows[0].id;
  });

  let application;
  await ok('application uses bounded snapshot consent and does not create a permanent share',async()=>{
    await as('worker');
    application=await call('apply_work_opportunity',[opportunity,'Available throughout the project period','Interested in this published project.',true]);
    const a=(await rows('select * from public.work_applications where id=$1',[application]))[0];
    assert.equal(a.profile_share_consent,true);
    assert.equal(a.survey_project_id,project);
    assert.equal((await rows('select * from public.profile_shares where organization_id=$1 and user_id=$2',[org,ids.worker])).length,0);
  });

  await ok('compensation change rolls a new current listing without rewriting the old application',async()=>{
    await as('super');
    const comp=await call('project_compensation_status',[project]);
    await call('set_project_compensation_defaults',[project,'paid','daily_rate','PKR',1500,'PKR 1,500 per approved attendance day','Switch future recruitment to paid daily work',comp.version]);
    const autos=await rows("select id,marketplace_current,status,work_mode,compensation_type,rate from public.work_opportunities where survey_project_id=$1 and marketplace_origin='project_auto' order by created_at,id",[project]);
    assert.equal(autos.length,2);
    assert.equal(autos.filter(x=>x.marketplace_current).length,1);
    const current=autos.find(x=>x.marketplace_current);
    assert.equal(current.work_mode,'paid');
    assert.equal(current.compensation_type,'daily_rate');
    assert.equal(Number(current.rate),1500);
    const old=(await rows('select opportunity_id,status from public.work_applications where id=$1',[application]))[0];
    assert.equal(old.opportunity_id,opportunity);
    assert.equal(old.status,'pending');

    await as('worker');
    const available=await call('available_work_opportunities',[0,null,null,null,'',null,null]);
    assert.equal(available.total,1);
    assert.notEqual(available.rows[0].id,opportunity);
    assert.equal(available.rows[0].application_status,'pending');
    assert.equal(available.rows[0].can_apply,false);
  });

  await ok('project recruitment close and reopen control automatic discovery',async()=>{
    await as('super');
    let plan=await call('project_recruitment_status',[project]);
    await call('set_project_recruitment_plan',[project,plan.target,3,'closed','Pause recruitment for validation',plan.version]);
    await as('worker');
    let available=await call('available_work_opportunities',[0,null,null,null,'',null,null]);
    assert.equal(available.total,0);

    await as('super');
    plan=await call('project_recruitment_status',[project]);
    await call('set_project_recruitment_plan',[project,plan.target,3,'open','Reopen recruitment after validation',plan.version]);
    await as('worker');
    available=await call('available_work_opportunities',[0,null,null,null,'',null,null]);
    assert.equal(available.total,1);
  });

  await ok('temporary moderation hides and restore re-enables the automatic listing',async()=>{
    await as('super');
    await call('moderate_survey_project',[project,'block','Temporary marketplace policy review']);
    await as('worker');
    let available=await call('available_work_opportunities',[0,null,null,null,'',null,null]);
    assert.equal(available.total,0);
    await as('super');
    await call('moderate_survey_project',[project,'restore','Marketplace policy review complete']);
    await as('worker');
    available=await call('available_work_opportunities',[0,null,null,null,'',null,null]);
    assert.equal(available.total,1);
  });

  console.log(`\n${passed} FieldLance 2.38.1 Automatic Project Marketplace Publishing scenarios passed.`);
} finally {
  await db.close();
}
