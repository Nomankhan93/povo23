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
  assert.match(marketplace,/Every published project with open recruitment appears automatically/i);
  assert.match(marketplace,/OPTIONAL DIRECT RECRUITMENT/);
  assert.match(marketplace,/This remains a secondary path\. Published projects are already discoverable in the marketplace/i);
});

await ok('2.38.1 migration follows the 2.38 permission hotfix',async()=>{
  const migrations=readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort();
  const prior='20261013000410_attendance_rls_helper_permissions.sql';
  const current='20261013000420_automatic_project_marketplace_publishing.sql';
  assert.equal(migrations.indexOf(current),migrations.indexOf(prior)+1);
});

const db=await schemaDb('20261013000480_attendance_notification_correctness.sql');
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


  // Seed a real legacy row before the forward migration, not by disabling new guards.
  await as('super');
  await call('set_survey_assignment',[project,ids.worker,true]);
  await as('worker');
  assert.equal(await call('can_collect_project', [project]).catch(()=>null),null);
  assert.equal((await rows('select app_private.can_collect($1) allowed',[project]))[0].allowed,true);
  await db.exec('RESET ROLE');
  await db.exec(readFileSync('supabase/migrations/20261013000490_recruitment_collection_consent.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261013000500_application_table_privileges.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261013000510_collection_definer_helper_permissions.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261013000520_case_worker_recruitment_consent.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261013000530_collection_project_date_guard.sql','utf8'));
  await as('worker');
  await ok('legacy row is preserved but collection is denied including compatibility helper',async()=>{
    assert.equal(await call('can_collect_project',[project]),false);
    await db.exec('RESET ROLE');
    assert.equal((await rows('select app_private.can_collect_before_governance($1) allowed',[project]))[0].allowed,false);
    await as('worker');
    assert.equal((await rows('select active from public.survey_assignments where project_id=$1',[project]))[0].active,true);
  });
  await ok('preserved active legacy rows remain denied in current, future and expired project windows',async()=>{
    for(const [start,end] of [[0,30],[1,30],[-30,-1]]){
      await db.exec('RESET ROLE');
      await db.query("update public.survey_projects set start_date=(now() at time zone 'UTC')::date+$2::integer,end_date=(now() at time zone 'UTC')::date+$3::integer where id=$1",[project,start,end]);
      await as('worker');
      assert.equal(await call('can_collect_project',[project]),false);
      assert.equal((await rows('select app_private.can_collect($1) allowed',[project]))[0].allowed,false);
      assert.equal((await rows('select active from public.survey_assignments where project_id=$1',[project]))[0].active,true);
    }
    await db.exec('RESET ROLE');
    await db.query('update public.survey_projects set start_date=$2,end_date=$3 where id=$1',[project,dates.start,dates.finish]);
  });
  async function denied(label){
    await ok(label,async()=>{
      await as('ngo');
      await assert.rejects(()=>call('set_survey_assignment',[project,ids.worker,true]),/Worker acceptance required/);
      await assert.rejects(()=>call('set_survey_assignment_scope',[project,ids.worker,district,true]),/Worker acceptance required/);
      await as('super');
      await assert.rejects(()=>call('set_survey_assignment',[project,ids.worker,true]),/Worker acceptance required/);
      await db.exec('RESET ROLE');
      await assert.rejects(()=>db.query('update public.survey_assignments set active=true where project_id=$1',[project]),/Worker acceptance required/);
    });
  }
  await denied('no recruitment relationship cannot activate or broaden collection');
  await as('worker');
  await call('set_profile_sharing',[org,true]);
  await denied('permanent share cannot activate collection');
  await as('worker');
  await call('set_profile_sharing',[org,false]);
  const application=await call('apply_work_opportunity',[opportunity,'Available','Consent hardening test',true]);
  await denied('pending application cannot activate collection');
  await as('ngo');
  await call('review_work_application',[application,'selected','Selected for offer',1]);
  await denied('selected application cannot activate collection');
  await as('ngo');
  const offer=await call('create_work_assignment',[project,ids.worker,'application',application,'volunteer','none','PKR',null,10,dates.start,dates.finish,'Formal consent test terms']);
  await denied('offered assignment cannot activate collection');
  await as('worker');
  await assert.rejects(()=>call('set_survey_assignment',[project,ids.worker,true]),/permission required/);
  await assert.rejects(()=>db.query('update public.survey_assignments set active=true where project_id=$1',[project]),/permission denied/);
  await ok('acceptance is sufficient without permanent share and repeat acceptance is idempotent',async()=>{
    await call('respond_work_assignment',[offer,'accepted',1]);
    await call('respond_work_assignment',[offer,'accepted',1]);
    assert.equal(await call('can_collect_project',[project]),true);
    assert.equal((await rows('select count(*)::int n from public.profile_shares where user_id=$1',[ids.worker]))[0].n,0);
  });
  await as('super');
  await call('set_account_access',[ids.worker,'volunteer','suspended']);
  await as('worker');assert.equal(await call('can_collect_project',[project]),false);
  await as('super');await call('set_account_access',[ids.worker,'volunteer','active']);
  await as('worker');assert.equal(await call('can_collect_project',[project]),true);
  console.log('PASS worker suspension removes effective collection without rewriting the contract');
  await as('ngo');
  await call('set_survey_assignment_scope',[project,ids.worker,district,true]);
  await assert.rejects(()=>call('set_survey_assignment_scope',[project,ids.worker,province,true]),/inside this project/);
  await call('set_survey_assignment',[project,ids.worker,false]);
  await as('worker');assert.equal(await call('can_collect_project',[project]),false);
  await as('ngo');await call('set_survey_assignment_scope',[project,ids.worker,district,true]);
  await as('super');await call('moderate_survey_project',[project,'block','Consent hardening moderation check']);
  await as('worker');assert.equal(await call('can_collect_project',[project]),false);
  await as('super');await call('moderate_survey_project',[project,'restore','Consent hardening restoration check']);
  await ok('review and administration remain independent of collection',async()=>{
    await as('ngo');
    assert.equal((await rows('select app_private.can_manage_project($1) manage,app_private.can_review_survey($1) review',[project]))[0].manage,true);
    assert.equal((await rows('select app_private.can_review_survey($1) review',[project]))[0].review,true);
    assert.equal(await call('can_collect_project',[project]),false);
  });
  for(const status of ['declined','cancelled','completed']){
    await db.exec('RESET ROLE');
    await db.query('update public.work_assignments set status=$1 where id=$2',[status,offer]);
    await denied(status+' assignment cannot regain collection');
    await as('worker');assert.equal(await call('can_collect_project',[project]),false);
  }

  await db.exec('RESET ROLE');
  const invited=crypto.randomUUID();
  await db.query('insert into auth.users(id,email) values($1,$2)',[invited,'invitation@hardening.test']);
  await db.query("update public.volunteer_profiles set status='verified',geography_id=$1 where user_id=$2",[district,invited]);
  const invitation=(await rows("insert into public.work_invitations(opportunity_id,organization_id,user_id,volunteer_name,created_by) values($1,$2,$3,'Invitation Worker',$4) returning id",[opportunity,org,invited,ids.ngo]))[0].id;
  ids.invited=invited;
  await as('invited');await call('respond_work_invitation',[invitation,'accepted',1]);
  await as('ngo');
  await ok('accepted invitation alone cannot activate either legacy path',async()=>{
    await assert.rejects(()=>call('set_survey_assignment',[project,invited,true]),/Worker acceptance required/);
    await assert.rejects(()=>call('set_survey_assignment_scope',[project,invited,district,true]),/Worker acceptance required/);
  });
  for(const [name,role] of [['pm','project_manager'],['focal','area_focal_person'],['outsider','ngo_admin']]){
    await db.exec('RESET ROLE');ids[name]=crypto.randomUUID();
    await db.query('insert into auth.users(id,email) values($1,$2)',[ids[name],name+'@hardening.test']);
    await as('super');
    const memberOrg=name==='outsider'?await call('save_organization',[null,{name:'Other hardening organization',status:'active'}]):org;
    await call('set_membership',[memberOrg,ids[name],name==='outsider'?'ngo_admin':'member','active']);
    if(name!=='outsider')await call('assign_project_staff',[project,ids[name],role,name==='focal'?[district]:[],dates.start,dates.finish]);
  }
  await as('outsider');
  await assert.rejects(()=>call('set_survey_assignment',[project,ids.worker,true]),/permission required/);
  await assert.rejects(()=>call('set_survey_assignment_scope',[project,ids.worker,district,true]),/permission required/);
  for(const name of ['pm','focal']){
    await as(name);
    assert.equal((await rows('select app_private.can_review_project_area($1,$2) allowed',[project,district]))[0].allowed,true);
    assert.equal(await call('can_collect_project',[project]),false);
  }
  await as('pm');
  assert.equal((await rows('select app_private.can_manage_project($1) allowed',[project]))[0].allowed,true);
  console.log('PASS cross-organization denial and Project Manager / Area Focal review independence');
  console.log('Recruitment hardening checks passed:',passed);
} finally { await db.close(); }
