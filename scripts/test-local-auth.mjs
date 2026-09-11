// Explicit optional test for this project's local Supabase. Temporary fixture users are cleaned up.
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const s=JSON.parse(execFileSync('npx',['supabase','status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const url=s.API_URL||s.api_url,key=s.ANON_KEY||s.anon_key||s.PUBLISHABLE_KEY,secret=s.SERVICE_ROLE_KEY||s.service_role_key||s.SECRET_KEY;
if(!url||new URL(url).port!=='55321'||!['127.0.0.1','localhost'].includes(new URL(url).hostname)||!secret)throw Error('This test requires local POEM Supabase on port 55321.');
const opts={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(url,secret,opts),users=[];
try{
 for(let i=0;i<2;i++){const email=`poem-test-${randomUUID()}@example.test`,password=randomUUID()+'aA1!';const {data,error}=await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'Test volunteer',platform_role:'super_admin'}});if(error)throw error;const entry={id:data.user.id};users.push(entry);entry.client=createClient(url,key,opts);const login=await entry.client.auth.signInWithPassword({email,password});if(login.error)throw login.error;}
 const [a,b]=users;const own=await a.client.from('accounts').select('*');assert.ifError(own.error);assert.equal(own.data.length,1);assert.equal(own.data[0].platform_role,'volunteer');
 const save=await a.client.rpc('save_my_profile',{p_details:{full_name:'Local test',phone:'03000000000',area:'Kunri'},p_submit:false,p_version:1,p_geography:null});assert.ifError(save.error);
 const hidden=await b.client.from('volunteer_profiles').select('*').eq('user_id',a.id);assert.ifError(hidden.error);assert.equal(hidden.data.length,0);
 const forged=await b.client.rpc('review_profile',{p_user_id:a.id,p_status:'verified',p_note:'Forged review',p_version:2,p_checks:{}});assert(forged.error);
 const bytes=new TextEncoder().encode('%PDF-1.4\n% POEM local fixture\n%%EOF');
 const reserve=await a.client.rpc('begin_document_upload',{p_name:'fixture.pdf',p_type:'application/pdf',p_bytes:bytes.length,p_kind:'cv'});assert.ifError(reserve.error);const doc=reserve.data;
 const uploaded=await a.client.storage.from('poem-private-documents').upload(doc.object_path,bytes,{contentType:'application/pdf',upsert:false});assert.ifError(uploaded.error);
 const finished=await a.client.rpc('finish_document_upload',{p_id:doc.id});assert.ifError(finished.error);
 const path=await a.client.rpc('document_download_path',{p_id:doc.id});assert.ifError(path.error);
 const downloaded=await a.client.storage.from('poem-private-documents').download(path.data);assert.ifError(downloaded.error);assert.deepEqual(new Uint8Array(await downloaded.data.arrayBuffer()),bytes);
 const denied=await b.client.storage.from('poem-private-documents').download(doc.object_path);assert(denied.error);
 const begin=await a.client.rpc('begin_document_delete',{p_id:doc.id});assert.ifError(begin.error);
 const removed=await a.client.storage.from('poem-private-documents').remove([begin.data]);assert.ifError(removed.error);
 const end=await a.client.rpc('finish_document_delete',{p_id:doc.id});assert.ifError(end.error);
 console.log('PASS: local Auth, draft save, cross-user RLS, blocked escalation and private Storage byte upload/download/removal.');
}finally{
 for(const u of users){
  const docs=await service.from('volunteer_documents').select('object_path').eq('user_id',u.id);
  if(docs.error)console.error('Fixture documents lookup failed:',u.id,docs.error.message);
  if(docs.data?.length){const clean=await service.storage.from('poem-private-documents').remove(docs.data.map(d=>d.object_path));if(clean.error)console.error('Fixture storage cleanup failed:',u.id,clean.error.message)}
  for(const table of ['volunteer_documents','notifications']){const clean=await service.from(table).delete().eq('user_id',u.id);if(clean.error)console.error('Fixture cleanup failed:',u.id,table,clean.error.message)}
  const a=await service.from('audit_events').delete().or(`actor_id.eq.${u.id},subject_id.eq.${u.id}`);if(a.error)console.error('Fixture audit cleanup failed:',a.error.message);const b=await service.auth.admin.deleteUser(u.id);if(b.error)console.error('Fixture user cleanup failed:',b.error.message)}
}
