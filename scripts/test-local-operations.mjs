// Optional REAL HTTP/Postgres integration gate. Local POEM only; never reads .env credentials.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
if(!/^project_id\s*=\s*"poem-phase11"/m.test(readFileSync('supabase/config.toml','utf8')))throw Error('Unexpected Supabase project identity');
let s;try{s=JSON.parse(execFileSync('npx',['supabase','status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));}catch{throw Error('Start local POEM Supabase with Docker before running this integration gate.');}
const url=s.API_URL||s.api_url,key=s.ANON_KEY||s.anon_key||s.PUBLISHABLE_KEY,secret=s.SERVICE_ROLE_KEY||s.service_role_key||s.SECRET_KEY;
if(!url||new URL(url).port!=='55321'||!['127.0.0.1','localhost'].includes(new URL(url).hostname)||!secret||!key)throw Error('Requires local POEM Supabase on port 55321');
const opts={auth:{persistSession:false,autoRefreshToken:false}},service=createClient(url,secret,opts),users=[],orgs=[];
let project,template,geo;const tag=randomUUID();const get=async p=>{const r=await p;if(r.error)throw r.error;return r.data;};const call=(c,n,a)=>get(c.rpc(n,a));
try{
 for(let i=0;i<4;i++){const email=`poem-ops-${tag}-${i}@example.test`,password=randomUUID()+'Aa1!';const data=await get(service.auth.admin.createUser({email,password,email_confirm:true}));const u={id:data.user.id,client:createClient(url,key,opts)};users.push(u);await get(u.client.auth.signInWithPassword({email,password}));}
 const [admin,collector,reviewer,outsider]=users;await get(service.from('accounts').update({platform_role:'super_admin'}).eq('id',admin.id));
 for(const name of ['Pilot','Other'])orgs.push(await call(admin.client,'save_organization',{p_id:null,p_data:{name:`${name} ${tag}`,status:'active'}}));
 await call(admin.client,'set_membership',{p_org:orgs[0],p_user:reviewer.id,p_role:'ngo_admin',p_status:'active'});await call(admin.client,'set_membership',{p_org:orgs[1],p_user:outsider.id,p_role:'ngo_admin',p_status:'active'});
 geo=await call(admin.client,'save_geography',{p_id:null,p_parent:null,p_kind:'province',p_name:'Integration fixture',p_code:'T'+tag.slice(0,8),p_source:'Synthetic local test',p_active:true});
 template=await call(admin.client,'publish_survey_template',{p_name:'HTTP '+tag,p_questions:[{id:'need',label:'Need',type:'text',required:true}]});
 const day=d=>new Date(Date.now()+d*86400000).toISOString().slice(0,10);
 project=await call(admin.client,'create_survey_project',{p_org:orgs[0],p_title:'HTTP operations '+tag,p_template:template,p_geography:geo,p_target:10,p_start:day(-1),p_end:day(1),p_purpose:'Synthetic needs assessment integration test',p_consent_version:'test-v1',p_consent_notice:'Synthetic consent notice for local automated integration testing.'});
 await get(service.from('volunteer_profiles').update({status:'verified'}).eq('user_id',collector.id));await call(collector.client,'set_profile_sharing',{p_org:orgs[0],p_allowed:true});await call(reviewer.client,'set_survey_assignment',{p_project:project,p_user:collector.id,p_active:true});
 const args={p_id:null,p_project:project,p_person:null,p_household:null,p_name:'Synthetic Person',p_birth:'1990-01-01',p_household_label:'Synthetic Household',p_answers:{need:'Food'},p_consent:{agreed:true,method:'verbal'},p_submit:true,p_version:0,p_request_id:randomUUID()};
 const results=await Promise.all(Array.from({length:5},()=>call(collector.client,'save_survey_response',args)));assert.equal(new Set(results).size,1);const response=results[0];
 const people=await get(reviewer.client.from('registry_persons').select('*').eq('project_id',project));assert.equal(people.length,1);assert.equal((await get(reviewer.client.from('registry_households').select('id').eq('project_id',project))).length,1);
 assert((await collector.client.rpc('save_survey_response',{...args,p_name:'Changed payload'})).error);
 await call(reviewer.client,'review_survey_response',{p_id:response,p_status:'approved',p_note:'Synthetic review',p_version:1});assert.equal(await call(collector.client,'save_survey_response',args),response);
 const need=randomUUID(),aid=randomUUID();await call(reviewer.client,'create_beneficiary_need',{p_id:need,p_response:response,p_category:'food',p_description:'Synthetic food support need',p_priority:'high',p_follow_up:day(0),p_reason:'Review of synthetic approved response'});
 await call(reviewer.client,'record_assistance',{p_id:aid,p_person:people[0].id,p_kind:'cash',p_category:'food',p_program:'Test support',p_description:'Synthetic delivery',p_amount:100,p_quantity:null,p_unit:null,p_delivered:day(0),p_funding:'Test fund',p_evidence:'Synthetic receipt',p_next:null});
 await call(reviewer.client,'set_need_assistance_link',{p_need:need,p_assistance:aid,p_active:true,p_reason:'Delivery meets synthetic need',p_need_version:1,p_link_version:0});
 const n=await get(reviewer.client.from('beneficiary_needs').select('*').eq('id',need).single());await call(reviewer.client,'update_beneficiary_need',{p_id:need,p_description:n.description,p_priority:n.priority,p_status:'met',p_follow_up:n.follow_up_on,p_reason:'Synthetic delivery confirmed',p_version:n.version});
 await call(reviewer.client,'void_assistance',{p_id:aid,p_reason:'Synthetic correction fixture',p_version:1});assert.equal((await get(reviewer.client.from('beneficiary_needs').select('status').eq('id',need).single())).status,'needs_review');
 assert.equal((await get(outsider.client.from('registry_persons').select('id').eq('project_id',project))).length,0);
 await get(service.from('accounts').update({platform_role:'ngo_manager'}).eq('id',outsider.id));assert((await outsider.client.rpc('set_membership',{p_org:orgs[0],p_user:outsider.id,p_role:'ngo_admin',p_status:'active'})).error);
 await call(admin.client,'close_survey_project',{p_id:project});await call(reviewer.client,'set_survey_assignment',{p_project:project,p_user:collector.id,p_active:false});assert((await collector.client.rpc('save_survey_response',args)).error);assert.equal((await get(collector.client.from('survey_responses').select('id').eq('project_id',project))).length,0);
 console.log('PASS real HTTP: concurrent retry, review, scoped needs/assistance/void follow-up, NGO isolation, membership restriction and closed-project revocation.');
}finally{
 // Only IDs created by this run. Report failures and fail the gate; never reset the database.
 const failures=[];async function clean(table,column,ids){if(!ids?.length)return;const r=await service.from(table).delete().in(column,ids);if(r.error)failures.push(`${table}: ${r.error.message}`);}
 if(project){
  const ids=async table=>{const r=await service.from(table).select('id').eq('project_id',project);if(r.error){failures.push(`${table} lookup: ${r.error.message}`);return [];}return r.data.map(x=>x.id);};
  const needs=await ids('beneficiary_needs'),responses=await ids('survey_responses'),people=await ids('registry_persons');
  await clean('need_link_revisions','need_id',needs);await clean('need_assistance_links','need_id',needs);await clean('need_revisions','need_id',needs);await clean('beneficiary_needs','id',needs);await clean('assistance_entries','project_id',[project]);await clean('survey_save_receipts','project_id',[project]);await clean('survey_response_revisions','response_id',responses);await clean('survey_responses','id',responses);await clean('registry_person_revisions','person_id',people);await clean('registry_persons','id',people);await clean('registry_households','project_id',[project]);await clean('survey_assignments','project_id',[project]);await clean('survey_projects','id',[project]);
 }
 await clean('survey_templates','id',template?[template]:[]);await clean('geographies','id',geo?[geo]:[]);
 const uids=users.map(u=>u.id);await clean('notifications','user_id',uids);await clean('audit_events','actor_id',uids);await clean('audit_events','subject_id',uids);await clean('audit_events','organization_id',orgs);await clean('organizations','id',orgs);
 for(const u of users){const r=await service.auth.admin.deleteUser(u.id);if(r.error)failures.push(`fixture user ${u.id}: ${r.error.message}`);}
 if(failures.length){console.error('Fixture cleanup incomplete:',failures.join('\n'));process.exitCode=1;}
}
