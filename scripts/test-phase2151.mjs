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
const deny=(fn,re=/permission|required|access|locked|review|template|NGO Admin/i)=>assert.rejects(fn,re);
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
  const globalTemplate=await call('publish_survey_template',['2.15.1 POEM Library',questions]);

  async function approvedNgoTemplate(user,org,name){
    await as(user);
    const draft=crypto.randomUUID();
    let v=await call('save_organization_template_draft',[draft,org,name,questions,{},0]);
    v=await call('submit_template_draft',[draft,v]);
    await as('super');
    return call('review_template_draft',[draft,'approved','Approved project-use template',v]);
  }
  const templateA=await approvedNgoTemplate('ngoA1',orgA,'2.15.1 NGO A Template');
  const templateB=await approvedNgoTemplate('ngoB',orgB,'2.15.1 NGO B Template');

  const draft=crypto.randomUUID();
  await as('ngoA1');
  let version=await call('save_organization_project_draft',[draft,orgA,'Early draft',null,null,null,null,null,'','','',0]);

  await ok('NGO project draft is organization-owned and can remain incomplete without creating an operational project',async()=>{
    assert.equal(version,1);
    await as('ngoA2');
    const visible=await rows('select id,organization_id,created_by,review_status from public.survey_project_drafts where id=$1',[draft]);
    assert.equal(visible.length,1);
    assert.equal(visible[0].organization_id,orgA);
    assert.equal(visible[0].created_by,ids.ngoA1);
    version=await call('save_organization_project_draft',[draft,orgA,'Household Education Survey',templateA,district,500,dates.start,dates.finish,'Assess education access and household barriers','v1','Explain the approved survey purpose and obtain informed consent before collecting household information.',version]);
    await db.exec('RESET ROLE');
    assert.equal((await rows('select count(*)::int n from public.survey_projects where organization_id=$1',[orgA]))[0].n,0);
  });

  await ok('other NGOs and ordinary members cannot read or mutate an NGO project draft',async()=>{
    await as('ngoB');
    assert.equal((await rows('select id from public.survey_project_drafts where id=$1',[draft])).length,0);
    await deny(()=>call('save_organization_project_draft',[draft,orgA,'Cross NGO edit',templateA,district,500,dates.start,dates.finish,'Assess education access and household barriers','v1','Explain the approved survey purpose and obtain informed consent before collecting household information.',version]));
    await as('member');
    assert.equal((await rows('select id from public.survey_project_drafts where id=$1',[draft])).length,0);
    await deny(()=>call('submit_project_draft',[draft,version]));
  });

  await ok('project drafts accept only POEM library templates or approved templates owned by the same NGO',async()=>{
    await as('ngoA1');
    const bad=crypto.randomUUID();
    await deny(()=>call('save_organization_project_draft',[bad,orgA,'Wrong template',templateB,district,100,dates.start,dates.finish,'Assess education access and household barriers','v1','Explain the approved survey purpose and obtain informed consent before collecting household information.',0]),/approved template owned by this NGO/i);
    const globalDraft=crypto.randomUUID();
    const gv=await call('save_organization_project_draft',[globalDraft,orgA,'POEM template project',globalTemplate,district,100,dates.start,dates.finish,'Assess education access and household barriers','v1','Explain the approved survey purpose and obtain informed consent before collecting household information.',0]);
    assert.equal(gv,1);
  });

  await ok('submission validates completeness, records history and locks NGO editing while POEM reviews',async()=>{
    await as('ngoA1');
    const incomplete=crypto.randomUUID();
    const iv=await call('save_organization_project_draft',[incomplete,orgA,'Incomplete',null,null,null,null,null,'','','',0]);
    await deny(()=>call('submit_project_draft',[incomplete,iv]),/Complete project title, template, area, dates, target, purpose and consent/i);
    version=await call('submit_project_draft',[draft,version]);
    const state=(await rows('select review_status,submitted_at,version from public.survey_project_drafts where id=$1',[draft]))[0];
    assert.equal(state.review_status,'submitted');
    assert.ok(state.submitted_at);
    assert.equal(state.version,version);
    await deny(()=>call('save_organization_project_draft',[draft,orgA,'Edit submitted',templateA,district,500,dates.start,dates.finish,'Assess education access and household barriers','v1','Explain the approved survey purpose and obtain informed consent before collecting household information.',version]),/locked/i);
    assert.equal((await rows("select count(*)::int n from public.survey_project_review_events where draft_id=$1 and action='submitted'",[draft]))[0].n,1);
  });

  await ok('POEM can request changes and NGO Admin can edit and resubmit the same project envelope',async()=>{
    await as('super');
    assert.equal(await call('review_project_draft',[draft,'changes_requested','Clarify the target and purpose',version]),null);
    await db.exec('RESET ROLE');
    let state=(await rows('select review_status,version,review_note from public.survey_project_drafts where id=$1',[draft]))[0];
    assert.equal(state.review_status,'changes_requested');
    assert.equal(state.review_note,'Clarify the target and purpose');
    version=state.version;
    await as('ngoA2');
    version=await call('save_organization_project_draft',[draft,orgA,'Household Education Survey Final',templateA,district,550,dates.start,dates.finish,'Assess education access, household barriers and referral needs','v1','Explain the approved survey purpose and obtain informed consent before collecting household information.',version]);
    version=await call('submit_project_draft',[draft,version]);
    assert.equal((await rows("select count(*)::int n from public.survey_project_review_events where draft_id=$1 and action='resubmitted'",[draft]))[0].n,1);
  });

  let project;
  await ok('POEM approval atomically creates exactly one existing operational survey project and links it to the draft',async()=>{
    await as('super');
    project=await call('review_project_draft',[draft,'approved','Approved for controlled field launch',version]);
    assert.ok(project);
    await db.exec('RESET ROLE');
    const approved=(await rows('select review_status,approved_project_id,version from public.survey_project_drafts where id=$1',[draft]))[0];
    assert.equal(approved.review_status,'approved');
    assert.equal(approved.approved_project_id,project);
    const operational=(await rows('select organization_id,title,template_id,geography_id,target,status from public.survey_projects where id=$1',[project]))[0];
    assert.equal(operational.organization_id,orgA);
    assert.equal(operational.title,'Household Education Survey Final');
    assert.equal(operational.template_id,templateA);
    assert.equal(operational.geography_id,district);
    assert.equal(operational.target,550);
    assert.equal(operational.status,'active');
    await as('super');
    assert.equal(await call('review_project_draft',[draft,'approved','retry',version]),project);
    await db.exec('RESET ROLE');
    assert.equal((await rows('select count(*)::int n from public.survey_projects where organization_id=$1 and title=$2',[orgA,'Household Education Survey Final']))[0].n,1);
  });

  await ok('direct POEM project creation is hardened against cross-NGO template reuse',async()=>{
    await as('super');
    await deny(()=>call('create_survey_project',[orgA,'Wrong NGO template project',templateB,district,10,dates.start,dates.finish,'Assess controlled project template ownership','v1','Explain the project and collect informed consent before any survey response.']),/approved template for this NGO/i);
    const direct=await call('create_survey_project',[orgA,'Global template project',globalTemplate,district,10,dates.start,dates.finish,'Assess controlled project template ownership','v1','Explain the project and collect informed consent before any survey response.']);
    assert.ok(direct);
  });

  await ok('review authority remains POEM-only and workflow tables are RLS-protected RPC-only surfaces',async()=>{
    const rejected=crypto.randomUUID();
    await as('ngoA1');
    let rv=await call('save_organization_project_draft',[rejected,orgA,'Rejected project',templateA,district,10,dates.start,dates.finish,'Assess a project that will be rejected during review','v1','Explain the project and collect informed consent before any survey response.',0]);
    rv=await call('submit_project_draft',[rejected,rv]);
    await deny(()=>call('review_project_draft',[rejected,'approved','Unauthorized',rv]),/POEM survey management permission required/i);
    await assert.rejects(()=>db.query("update public.survey_project_drafts set review_status='approved' where id=$1",[rejected]),/permission denied/i);
    await assert.rejects(()=>db.query("insert into public.survey_project_review_events(draft_id,actor_id,action) values($1,$2,'approved')",[rejected,ids.ngoA1]),/permission denied/i);
    await as('super');
    assert.equal(await call('review_project_draft',[rejected,'rejected','Project is outside the approved programme scope',rv]),null);
    await as('ngoA1');
    await deny(()=>call('submit_project_draft',[rejected,rv]),/not editable\/submittable/i);
  });

  await ok('project self-service UI reuses Survey projects and keeps draft approval separate from operational status',async()=>{
    const projects=readFileSync('src/features/surveys/SurveyProjects.tsx','utf8');
    const drafts=readFileSync('src/features/surveys/SurveyProjectDrafts.tsx','utf8');
    assert.match(projects,/SurveyProjectDrafts/);
    assert.match(projects,/t\.organization_id === null \|\| t\.organization_id === createOrganization/);
    assert.match(drafts,/save_organization_project_draft/);
    assert.match(drafts,/submit_project_draft/);
    assert.match(drafts,/review_project_draft/);
    assert.match(drafts,/Approval is required before field operations can start/);
    assert.match(drafts,/Approve & activate/);
  });

  console.log(`\n${passed} POEM 2.15.1 NGO project self-service / approval scenarios passed.`);
} finally {
  await db.close();
}
