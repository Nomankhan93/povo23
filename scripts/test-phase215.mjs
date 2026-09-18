import assert from 'node:assert/strict';
import { schemaDb } from './schema-test-db.mjs';

const db = await schemaDb();
let passed = 0;
const ids = Object.fromEntries(
  ['super','ngoA1','ngoA2','ngoB','member'].map((name,i)=>[
    name,`a1500000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,
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
const deny=(fn,re=/permission|required|access|locked|review|active NGO Admin/i)=>assert.rejects(fn,re);
const questions=[{id:'need',label:'Primary need',type:'text',required:true}];

try{
  for(const [name,id] of Object.entries(ids)) await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${name}@example.test`]);
  await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.super]);
  await as('super');
  const orgA=await call('save_organization',[null,{name:'2.15 NGO A',status:'active'}]);
  const orgB=await call('save_organization',[null,{name:'2.15 NGO B',status:'active'}]);
  await call('set_membership',[orgA,ids.ngoA1,'ngo_admin','active']);
  await call('set_membership',[orgA,ids.ngoA2,'ngo_admin','active']);
  await call('set_membership',[orgA,ids.member,'member','active']);
  await call('set_membership',[orgB,ids.ngoB,'ngo_admin','active']);

  const draft=crypto.randomUUID();
  await as('ngoA1');
  let version=await call('save_organization_template_draft',[draft,orgA,'Household Needs',questions,{library_id:'education'},0]);

  await ok('NGO draft belongs to the organization so another active NGO Admin can continue it',async()=>{
    assert.equal(version,1);
    await as('ngoA2');
    const visible=await rows('select id,organization_id,owner_id,review_status from public.survey_template_drafts where id=$1',[draft]);
    assert.equal(visible.length,1);
    assert.equal(visible[0].organization_id,orgA);
    assert.equal(visible[0].owner_id,ids.ngoA1);
    version=await call('save_organization_template_draft',[draft,orgA,'Household Needs Updated',questions,{library_id:'ignored-on-update'},version]);
    assert.equal(version,2);
  });

  await ok('other NGOs and ordinary organization members cannot read or mutate the NGO draft',async()=>{
    await as('ngoB');
    assert.equal((await rows('select id from public.survey_template_drafts where id=$1',[draft])).length,0);
    await deny(()=>call('save_organization_template_draft',[draft,orgA,'Cross NGO Edit',questions,{},version]));
    await as('member');
    assert.equal((await rows('select id from public.survey_template_drafts where id=$1',[draft])).length,0);
    await deny(()=>call('submit_template_draft',[draft,version]));
  });

  await ok('submission validates the draft, records review history and locks NGO editing',async()=>{
    await as('ngoA1');
    const bad=crypto.randomUUID();
    const badVersion=await call('save_organization_template_draft',[bad,orgA,'',[],{},0]);
    await deny(()=>call('submit_template_draft',[bad,badVersion]),/Template name and 1–50 questions required/i);
    version=await call('submit_template_draft',[draft,version]);
    assert.equal(version,3);
    const row=(await rows('select review_status,submitted_at from public.survey_template_drafts where id=$1',[draft]))[0];
    assert.equal(row.review_status,'submitted');
    assert.ok(row.submitted_at);
    await deny(()=>call('save_organization_template_draft',[draft,orgA,'Edit while submitted',questions,{},version]),/locked/i);
    assert.equal((await rows("select count(*)::int n from public.survey_template_review_events where draft_id=$1 and action='submitted'",[draft]))[0].n,1);
  });

  await ok('POEM can request changes and the NGO can edit then resubmit the same organization draft',async()=>{
    await as('super');
    assert.equal(await call('review_template_draft',[draft,'changes_requested','Clarify the household wording',version]),null);
    await db.exec('RESET ROLE');
    let state=(await rows('select review_status,version,review_note from public.survey_template_drafts where id=$1',[draft]))[0];
    assert.equal(state.review_status,'changes_requested');
    assert.equal(state.review_note,'Clarify the household wording');
    version=state.version;
    await as('ngoA2');
    version=await call('save_organization_template_draft',[draft,orgA,'Household Needs Final',questions,{},version]);
    version=await call('submit_template_draft',[draft,version]);
    assert.equal((await rows("select count(*)::int n from public.survey_template_review_events where draft_id=$1 and action='resubmitted'",[draft]))[0].n,1);
  });

  let published;
  await ok('POEM approval atomically publishes one immutable NGO-owned template version',async()=>{
    await as('super');
    published=await call('review_template_draft',[draft,'approved','Approved for NGO use',version]);
    assert.ok(published);
    const template=(await rows('select organization_id,source_draft_id from public.survey_templates where id=$1',[published]))[0];
    assert.equal(template.organization_id,orgA);
    assert.equal(template.source_draft_id,draft);
    const approved=(await rows('select review_status,published_id,version from public.survey_template_drafts where id=$1',[draft]))[0];
    assert.equal(approved.review_status,'approved');
    assert.equal(approved.published_id,published);
    assert.equal(await call('review_template_draft',[draft,'approved','retry',version]),published);
    await as('ngoA1');
    await deny(()=>call('save_organization_template_draft',[draft,orgA,'Mutate published',questions,{},approved.version]),/locked/i);
    await assert.rejects(()=>db.query("update public.survey_templates set name='Bypass' where id=$1",[published]),/permission/i);
  });

  await ok('active NGO Admin sees own approved templates and POEM library versions but not another NGO private template',async()=>{
    await as('super');
    const poemTemplate=await call('publish_survey_template',['POEM Shared Library',questions]);
    await as('ngoB');
    const otherDraft=crypto.randomUUID();
    let otherVersion=await call('save_organization_template_draft',[otherDraft,orgB,'Other NGO Template',questions,{},0]);
    otherVersion=await call('submit_template_draft',[otherDraft,otherVersion]);
    await as('super');
    const otherTemplate=await call('review_template_draft',[otherDraft,'approved','Approved',otherVersion]);
    await as('ngoA1');
    const visible=await rows('select id from public.survey_templates order by id');
    const idsVisible=new Set(visible.map(x=>x.id));
    assert.equal(idsVisible.has(published),true);
    assert.equal(idsVisible.has(poemTemplate),true);
    assert.equal(idsVisible.has(otherTemplate),false);
  });

  await ok('existing POEM private-draft direct publication remains compatible',async()=>{
    await as('super');
    const poemDraft=crypto.randomUUID();
    const v=await call('save_template_draft',[poemDraft,'POEM Direct Draft',questions,{},0]);
    const template=await call('publish_template_draft',[poemDraft,v]);
    const row=(await rows('select organization_id,source_draft_id from public.survey_templates where id=$1',[template]))[0];
    assert.equal(row.organization_id,null);
    assert.equal(row.source_draft_id,poemDraft);
  });

  await ok('review decisions require POEM survey-management authority and direct workflow-table writes stay denied',async()=>{
    await as('ngoA1');
    await deny(()=>call('review_template_draft',[draft,'rejected','Unauthorized',version]),/POEM survey management permission required/i);
    await assert.rejects(()=>db.query("update public.survey_template_drafts set review_status='approved' where id=$1",[draft]),/permission/i);
    await assert.rejects(()=>db.query("insert into public.survey_template_review_events(draft_id,actor_id,action) values($1,$2,'approved')",[draft,ids.ngoA1]),/permission/i);
  });

  console.log(`\n${passed} POEM 2.15.0 NGO template self-service / approval scenarios passed.`);
}finally{
  await db.close();
}
