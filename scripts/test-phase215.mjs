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
const deny=(fn,re=/permission|required|access|locked|publish|moderation|Organization Admin|NGO Admin/i)=>assert.rejects(fn,re);
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

  await ok('Organization template draft belongs to the Organization so another active Admin can continue it',async()=>{
    assert.equal(version,1);
    await as('ngoA2');
    const visible=await rows('select id,organization_id,owner_id,review_status from public.survey_template_drafts where id=$1',[draft]);
    assert.equal(visible.length,1);
    assert.equal(visible[0].organization_id,orgA);
    version=await call('save_organization_template_draft',[draft,orgA,'Household Needs Updated',questions,{},version]);
    assert.equal(version,2);
  });

  await ok('other Organizations and ordinary members cannot read or mutate a private template draft',async()=>{
    await as('ngoB');
    assert.equal((await rows('select id from public.survey_template_drafts where id=$1',[draft])).length,0);
    await deny(()=>call('save_organization_template_draft',[draft,orgA,'Cross Org Edit',questions,{},version]));
    await as('member');
    assert.equal((await rows('select id from public.survey_template_drafts where id=$1',[draft])).length,0);
    await deny(()=>call('publish_organization_template_draft',[draft,version]));
  });

  let published;
  await ok('Organization Admin directly publishes one immutable Organization-owned template without FieldLance pre-approval',async()=>{
    await as('ngoA1');
    const bad=crypto.randomUUID();
    const badVersion=await call('save_organization_template_draft',[bad,orgA,'',[],{},0]);
    await deny(()=>call('publish_organization_template_draft',[bad,badVersion]),/Template name and 1–50 questions required/i);
    published=await call('publish_organization_template_draft',[draft,version]);
    assert.ok(published);
    const template=(await rows('select organization_id,source_draft_id,moderation_status from public.survey_templates where id=$1',[published]))[0];
    assert.equal(template.organization_id,orgA);
    assert.equal(template.source_draft_id,draft);
    assert.equal(template.moderation_status,'allowed');
    const state=(await rows('select review_status,published_id,version from public.survey_template_drafts where id=$1',[draft]))[0];
    assert.equal(state.review_status,'approved');
    assert.equal(state.published_id,published);
    assert.equal(await call('publish_organization_template_draft',[draft,state.version]),published);
    await deny(()=>call('save_organization_template_draft',[draft,orgA,'Mutate published',questions,{},state.version]),/locked/i);
  });

  await ok('Organization sees its published template and FieldLance library but not another Organization private template',async()=>{
    await as('super');
    const fieldlanceTemplate=await call('publish_survey_template',['FieldLance Shared Library',questions]);
    await as('ngoB');
    const otherDraft=crypto.randomUUID();
    const otherVersion=await call('save_organization_template_draft',[otherDraft,orgB,'Other Organization Template',questions,{},0]);
    const otherTemplate=await call('publish_organization_template_draft',[otherDraft,otherVersion]);
    await as('ngoA1');
    const visible=await rows('select id from public.survey_templates order by id');
    const idsVisible=new Set(visible.map(x=>x.id));
    assert.equal(idsVisible.has(published),true);
    assert.equal(idsVisible.has(fieldlanceTemplate),true);
    assert.equal(idsVisible.has(otherTemplate),false);
  });

  await ok('FieldLance moderation can block and restore a published template while the Organization cannot self-moderate',async()=>{
    await as('ngoA1');
    await deny(()=>call('moderate_survey_template',[published,'block','Unauthorized organization moderation']),/FieldLance survey management permission required/i);
    await as('super');
    await call('moderate_survey_template',[published,'block','Template is outside permitted programme scope']);
    let state=(await rows('select moderation_status,moderation_reason from public.survey_templates where id=$1',[published]))[0];
    assert.equal(state.moderation_status,'blocked');
    assert.match(state.moderation_reason,/outside permitted/i);
    assert.equal((await rows("select count(*)::int n from public.content_moderation_events where entity_type='template' and entity_id=$1 and action='blocked'",[published]))[0].n,1);
    await call('moderate_survey_template',[published,'restore','Content issue was corrected by a new governance decision']);
    state=(await rows('select moderation_status from public.survey_templates where id=$1',[published]))[0];
    assert.equal(state.moderation_status,'allowed');
  });

  await ok('legacy review RPC no longer provides a pre-publication approval path',async()=>{
    await as('super');
    await assert.rejects(()=>call('review_template_draft',[draft,'approved','Legacy retry',version]),/pre-approval is retired/i);
  });

  console.log(`\n${passed} FieldLance template self-publication / moderation compatibility scenarios passed.`);
}finally{
  await db.close();
}
