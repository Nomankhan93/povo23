import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { schemaDb } from './schema-test-db.mjs';

const ids=Object.fromEntries(['staff','admin','manager','focal','outsider'].map((name,index)=>[name,`a2300000-0000-4000-8000-${String(index+1).padStart(12,'0')}`]));
const rows=async(q,p=[]) => (await db.query(q,p)).rows;
async function as(name){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[name]||'']);await db.exec(`set role ${name?'authenticated':'anon'}`)}
async function call(name,args=[]){return (await rows(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args))[0].result}
let count=0;async function ok(name,fn){await fn();count++;console.log('PASS '+name)}

const db=await schemaDb();
try{
  for(const [name,id] of Object.entries(ids)) await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,`${name}@test.example`,{full_name:name,onboarding_intent:'worker'}]);
  await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.staff]);
  await as('staff');
  const org=await call('save_organization',[null,{name:'Project Workspace Organization',status:'active'}]);
  await call('set_membership',[org,ids.admin,'ngo_admin','active']);
  await call('set_membership',[org,ids.manager,'member','active']);
  await call('set_membership',[org,ids.focal,'member','active']);
  const province=await call('save_geography',[null,null,'province','Workspace Province','WSP','Fixture',true]);
  const division=await call('save_geography',[null,province,'division','Workspace Division','WSD','Fixture',true]);
  const district=await call('save_geography',[null,division,'district','Workspace District','WSX','Fixture',true]);
  const template=await call('publish_survey_template',['Workspace Template',[{id:'q1',label:'Question',type:'text',required:true}]]);
  const dates=(await rows("select (current_date-1)::text start,(current_date+30)::text finish"))[0];
  const project=await call('create_survey_project',[org,'Workspace Project',template,district,25,dates.start,dates.finish,'Project workspace completion validation','v1','Explain project collection and consent.']);

  await as('admin');
  await call('assign_project_staff',[project,ids.manager,'project_manager',[],dates.start,null]);
  await call('assign_project_staff',[project,ids.focal,'area_focal_person',[district],dates.start,null]);

  let doc;
  await ok('project manager reserves and finalizes a private project document',async()=>{
    await as('manager');
    doc=await call('reserve_project_document',[project,'field-guide.pdf','application/pdf',4,'field_instruction','Field team guide']);
    await db.query("insert into storage.objects(bucket_id,name,metadata) values('fieldlance-project-documents',$1,$2::jsonb)",[doc.object_path,JSON.stringify({size:4,mimetype:'application/pdf'})]);
    await call('finish_project_document',[doc.id]);
    const visible=await rows('select id,state,file_name from public.project_documents where project_id=$1',[project]);
    assert.equal(visible.length,1);assert.equal(visible[0].state,'ready');assert.equal(visible[0].file_name,'field-guide.pdf');
    assert.equal(await call('project_document_download_path',[doc.id]),doc.object_path);
  });

  await ok('area focal can read ready project documents but cannot mutate them',async()=>{
    await as('focal');
    const visible=await rows('select id,file_name from public.project_documents where project_id=$1',[project]);
    assert.equal(visible.length,1);
    assert.equal(await call('project_document_download_path',[doc.id]),doc.object_path);
    await assert.rejects(()=>call('reserve_project_document',[project,'focal.pdf','application/pdf',4,'other','Not allowed']),/management permission/);
    await assert.rejects(()=>db.query("insert into public.project_documents(project_id,organization_id,uploaded_by,file_name,mime_type,byte_size,object_path,category) values($1,$2,$3,'x.pdf','application/pdf',1,'x','other')",[project,org,ids.focal]),/permission/);
  });

  await ok('unrelated account cannot discover project documents',async()=>{
    await as('outsider');
    assert.equal((await rows('select id from public.project_documents where project_id=$1',[project])).length,0);
    await assert.rejects(()=>call('project_document_download_path',[doc.id]),/not available/);
  });

  await ok('project activity is manager-only and excludes foreign project tags',async()=>{
    await db.exec('reset role');
    const foreign='a2309999-0000-4000-8000-000000000001';
    await db.query("insert into public.audit_events(actor_id,organization_id,action,detail) values($1,$2,'foreign_project_event',jsonb_build_object('project',$3::text))",[ids.staff,org,foreign]);
    await as('manager');
    const feed=await call('project_activity_feed',[project,null,100]);
    assert.ok(feed.some(row=>row.action==='project_document_uploaded'));
    assert.equal(feed.some(row=>row.action==='foreign_project_event'),false);
    await as('focal');
    await assert.rejects(()=>call('project_activity_feed',[project,null,40]),/management permission/);
  });

  await ok('document removal uses guarded state and secure storage deletion',async()=>{
    await as('manager');
    const premature=await db.query("delete from storage.objects where bucket_id='fieldlance-project-documents' and name=$1 returning name",[doc.object_path]);
    assert.equal(premature.rows.length,0,'ready objects require begin-delete before removal');
    const path=await call('begin_project_document_delete',[doc.id]);
    await as('focal');
    assert.equal((await rows("select name from storage.objects where bucket_id='fieldlance-project-documents' and name=$1",[path])).length,0);
    assert.equal((await rows("delete from storage.objects where bucket_id='fieldlance-project-documents' and name=$1 returning name",[path])).length,0);
    await assert.rejects(()=>call('project_document_download_path',[doc.id]),/not available/);
    await assert.rejects(()=>call('begin_project_document_delete',[doc.id]),/permission/);
    await as('outsider');
    assert.equal((await rows("select name from storage.objects where bucket_id='fieldlance-project-documents' and name=$1",[path])).length,0);
    await as('manager');
    assert.equal(await call('begin_project_document_delete',[doc.id]),path,'interrupted deletion can be resumed');
    await assert.rejects(()=>call('finish_project_document_delete',[doc.id]),/Remove stored file/);
    assert.equal(path,doc.object_path);
    assert.equal((await rows("delete from storage.objects where bucket_id='fieldlance-project-documents' and name=$1 returning name",[path])).length,1);
    await call('finish_project_document_delete',[doc.id]);
    assert.equal((await rows('select id from public.project_documents where id=$1',[doc.id])).length,0);
  });

  await ok('frontend contract has distinct project workspace surfaces and no project staffing browser prompts',async()=>{
    const workspace=readFileSync('src/features/projects/ProjectWorkspace.tsx','utf8');
    const surveys=readFileSync('src/features/surveys/SurveyProjectDetail.tsx','utf8');
    const app=readFileSync('src/app/AppShell.tsx','utf8');
    const team=readFileSync('src/features/projects/ProjectTeamWorkspace.tsx','utf8');
    assert.match(workspace,/ProjectOverview/);
    assert.match(workspace,/workspaceMode="field-work"/);
    assert.match(workspace,/workspaceMode="responses"/);
    assert.match(workspace,/projectId=\{projectId\}/);
    assert.match(workspace,/ProjectDocuments/);
    assert.match(workspace,/ProjectActivity/);
    assert.match(workspace,/BeneficiaryCasesWorkspace/);
    assert.match(surveys,/showFieldWork/);assert.match(surveys,/showResponses/);
    assert.match(app,/openWorkspace=/);assert.match(app,/workspaceProjectId/);
    assert.doesNotMatch(team,/window\.prompt/);
  });

  console.log(`\n${count} FieldLance 2.30 project-workspace scenarios passed`);
} finally {
  await db.close();
}
