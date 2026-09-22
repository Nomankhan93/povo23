import assert from 'node:assert/strict';
import { schemaDb } from './schema-test-db.mjs';
import { readFileSync } from 'node:fs';

const db = await schemaDb();
let passed = 0;
const ids = Object.fromEntries(
  ['super','ngoA1','ngoA2','ngoB','member'].map((name,i)=>[
    name,`a1510000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,
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
const deny=(fn,re=/permission|required|access|locked|template|Organization Admin|NGO Admin|moderation/i)=>assert.rejects(fn,re);
const questions=[{id:'need',label:'Primary need',type:'text',required:true}];

try{
  for(const [name,id] of Object.entries(ids)) await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${name}@example.test`]);
  await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.super]);
  await as('super');
  const orgA=await call('save_organization',[null,{name:'2.15.1 NGO A',status:'active'}]);
  const orgB=await call('save_organization',[null,{name:'2.15.1 NGO B',status:'active'}]);
  await call('set_membership',[orgA,ids.ngoA1,'ngo_admin','active']);
  await call('set_membership',[orgA,ids.ngoA2,'ngo_admin','active']);
  await call('set_membership',[orgA,ids.member,'member','active']);
  await call('set_membership',[orgB,ids.ngoB,'ngo_admin','active']);

  const province=await call('save_geography',[null,null,'province','2.15.1 Province','A151P','Fixture',true]);
  const division=await call('save_geography',[null,province,'division','2.15.1 Division','A151D','Fixture',true]);
  const district=await call('save_geography',[null,division,'district','2.15.1 District','A151X','Fixture',true]);
  const dates=(await rows("select ((now() at time zone 'UTC')::date+1)::text start,((now() at time zone 'UTC')::date+30)::text finish"))[0];
  const globalTemplate=await call('publish_survey_template',['2.15.1 FieldLance Library',questions]);

  async function organizationTemplate(user,org,name){
    await as(user);
    const draft=crypto.randomUUID();
    const v=await call('save_organization_template_draft',[draft,org,name,questions,{},0]);
    return call('publish_organization_template_draft',[draft,v]);
  }
  const templateA=await organizationTemplate('ngoA1',orgA,'2.15.1 NGO A Template');
  const templateB=await organizationTemplate('ngoB',orgB,'2.15.1 NGO B Template');

  const draft=crypto.randomUUID();
  await as('ngoA1');
  let version=await call('save_organization_project_draft',[draft,orgA,'Early draft',null,null,null,null,null,'','','',0]);

  await ok('Organization project draft remains private and incomplete until its Organization publishes it',async()=>{
    assert.equal(version,1);
    await as('ngoA2');
    const visible=await rows('select id,organization_id,created_by,review_status from public.survey_project_drafts where id=$1',[draft]);
    assert.equal(visible.length,1);
    version=await call('save_organization_project_draft',[draft,orgA,'Household Education Survey',templateA,district,500,dates.start,dates.finish,'Assess education access and household barriers','v1','Explain the survey purpose and obtain informed consent before collecting household information.',version]);
    await db.exec('RESET ROLE');
    assert.equal((await rows('select count(*)::int n from public.survey_projects where organization_id=$1',[orgA]))[0].n,0);
  });

  await ok('other Organizations and ordinary members cannot read or publish the private project draft',async()=>{
    await as('ngoB');
    assert.equal((await rows('select id from public.survey_project_drafts where id=$1',[draft])).length,0);
    await deny(()=>call('publish_organization_project_draft',[draft,version]));
    await as('member');
    assert.equal((await rows('select id from public.survey_project_drafts where id=$1',[draft])).length,0);
    await deny(()=>call('publish_organization_project_draft',[draft,version]));
  });

  await ok('project draft accepts FieldLance templates or allowed templates owned by the same Organization',async()=>{
    await as('ngoA1');
    const bad=crypto.randomUUID();
    await deny(()=>call('save_organization_project_draft',[bad,orgA,'Wrong template',templateB,district,100,dates.start,dates.finish,'Assess education access and household barriers','v1','Explain the survey purpose and obtain informed consent before collecting household information.',0]),/allowed published template owned by this Organization/i);
    const globalDraft=crypto.randomUUID();
    const gv=await call('save_organization_project_draft',[globalDraft,orgA,'FieldLance template project',globalTemplate,district,100,dates.start,dates.finish,'Assess education access and household barriers','v1','Explain the survey purpose and obtain informed consent before collecting household information.',0]);
    assert.equal(gv,1);
  });

  let project;
  await ok('Organization Admin directly publishes the project and materializes exactly one operational survey project',async()=>{
    await as('ngoA1');
    const incomplete=crypto.randomUUID();
    const iv=await call('save_organization_project_draft',[incomplete,orgA,'Incomplete',null,null,null,null,null,'','','',0]);
    await deny(()=>call('publish_organization_project_draft',[incomplete,iv]),/Complete project title, template, area, dates, target, purpose and consent before publication/i);
    project=await call('publish_organization_project_draft',[draft,version]);
    assert.ok(project);
    const published=(await rows('select review_status,approved_project_id,version from public.survey_project_drafts where id=$1',[draft]))[0];
    assert.equal(published.approved_project_id,project);
    assert.equal(published.review_status,'approved');
    const operational=(await rows('select organization_id,title,template_id,geography_id,target,status,moderation_status from public.survey_projects where id=$1',[project]))[0];
    assert.equal(operational.organization_id,orgA);
    assert.equal(operational.template_id,templateA);
    assert.equal(operational.status,'active');
    assert.equal(operational.moderation_status,'allowed');
    assert.equal(await call('publish_organization_project_draft',[draft,published.version]),project);
    await db.exec('RESET ROLE');
    assert.equal((await rows('select count(*)::int n from public.survey_projects where organization_id=$1 and title=$2',[orgA,'Household Education Survey']))[0].n,1);
  });

  await ok('blocked template cannot create a new project and template moderation pauses existing dependent projects',async()=>{
    await as('super');
    await call('moderate_survey_template',[templateA,'block','Template is outside lawful programme scope']);
    let state=(await rows('select moderation_status,moderation_origin,moderation_template_id,recruitment_status from public.survey_projects where id=$1',[project]))[0];
    assert.equal(state.moderation_status,'blocked');
    assert.equal(state.moderation_origin,'template');
    assert.equal(state.moderation_template_id,templateA);
    assert.equal(state.recruitment_status,'open');
    assert.equal((await call('project_recruitment_status',[project])).effective_open,false);
    await as('ngoA1');
    const blockedDraft=crypto.randomUUID();
    await deny(()=>call('save_organization_project_draft',[blockedDraft,orgA,'Blocked template project',templateA,district,10,dates.start,dates.finish,'Assess a controlled project template','v1','Explain the project and collect informed consent before any survey response.',0]),/allowed published template owned by this Organization/i);
    await as('super');
    await call('moderate_survey_template',[templateA,'restore','Template restriction cleared after governance review']);
    state=(await rows('select moderation_status,recruitment_status from public.survey_projects where id=$1',[project]))[0];
    assert.equal(state.moderation_status,'allowed');
    assert.equal(state.recruitment_status,'open');
    assert.equal((await call('project_recruitment_status',[project])).effective_open,true);
  });

  await ok('FieldLance can block or remove a project after publication and Organization cannot bypass moderation',async()=>{
    await as('ngoA1');
    await deny(()=>call('moderate_survey_project',[project,'block','Unauthorized self moderation']),/FieldLance survey management permission required/i);
    await as('super');
    await call('moderate_survey_project',[project,'remove','Project content is outside platform policy']);
    const state=(await rows('select moderation_status,moderation_reason,recruitment_status from public.survey_projects where id=$1',[project]))[0];
    assert.equal(state.moderation_status,'removed');
    assert.equal(state.recruitment_status,'closed');
    assert.match(state.moderation_reason,/outside platform policy/i);
    assert.equal((await rows("select count(*)::int n from public.content_moderation_events where entity_type='project' and entity_id=$1 and action='removed'",[project]))[0].n,1);
    await call('moderate_survey_project',[project,'restore','Project was corrected and may return to operation']);
    const restored=(await rows('select moderation_status,recruitment_status from public.survey_projects where id=$1',[project]))[0];
    assert.equal(restored.moderation_status,'allowed');
    assert.equal(restored.recruitment_status,'closed');
  });

  await ok('pre-publication project review is retired and UI exposes publish plus post-publication moderation instead of approval queues',async()=>{
    await as('super');
    await assert.rejects(()=>call('review_project_draft',[draft,'approved','Legacy retry',version]),/pre-approval is retired/i);
    const projects=readFileSync('src/features/surveys/SurveyProjects.tsx','utf8');
    const drafts=readFileSync('src/features/surveys/SurveyProjectDrafts.tsx','utf8');
    assert.match(drafts,/publish_organization_project_draft/);
    assert.match(drafts,/Publish project/);
    assert.doesNotMatch(drafts,/Approve & activate|Submit to FieldLance|NGO project review queue/);
    assert.match(projects,/moderate_survey_project/);
    assert.match(projects,/Remove from operation/);
  });

  console.log(`\n${passed} FieldLance project self-publication / moderation compatibility scenarios passed.`);
} finally {
  await db.close();
}
