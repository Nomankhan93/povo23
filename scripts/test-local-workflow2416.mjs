import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
assert.match(readFileSync('supabase/config.toml','utf8'),/^project_id\s*=\s*"poem-phase11"/m);
const status=JSON.parse(execFileSync('npx',['supabase','status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const url=status.API_URL,key=status.ANON_KEY,secret=status.SERVICE_ROLE_KEY;
assert(['http://127.0.0.1:55321','http://localhost:55321'].includes(url));
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(url,secret,options),users=[],orgs=[],tag='fieldlance-2416-'+randomUUID();
let project,template,geo;
const get=async p=>{const r=await p;if(r.error)throw Error(r.error.message);return r.data;};
const call=(c,n,a)=>get(c.rpc(n,a));
const rejected=async(p,pattern)=>{const r=await p;assert(r.error);assert.match(r.error.message,pattern);};
try{
 for(const role of ['admin','organization','worker','outsider']){
  const email=tag+'-'+role+'@example.test',password=randomUUID()+'Aa1!';
  const data=await get(service.auth.admin.createUser({email,password,email_confirm:true}));
  const client=createClient(url,key,options);users.push({id:data.user.id,client});
  await get(client.auth.signInWithPassword({email,password}));
 }
 const [admin,organization,worker,outsider]=users;
 await get(service.from('accounts').update({platform_role:'super_admin'}).eq('id',admin.id));
 for(const name of ['organization','other'])orgs.push(await call(admin.client,'save_organization',{p_id:null,p_data:{name:tag+' '+name,status:'active'}}));
 await call(admin.client,'set_membership',{p_org:orgs[0],p_user:organization.id,p_role:'ngo_admin',p_status:'active'});
 await call(admin.client,'set_membership',{p_org:orgs[1],p_user:outsider.id,p_role:'ngo_admin',p_status:'active'});
 geo=await call(admin.client,'save_geography',{p_id:null,p_parent:null,p_kind:'province',p_name:tag,p_code:'T'+randomUUID().slice(0,8),p_source:'Disposable consent regression',p_active:true});
 template=await call(admin.client,'publish_survey_template',{p_name:tag,p_questions:[{id:'q',label:'Question',type:'text',required:true}]});
 const day=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
 project=await call(admin.client,'create_survey_project',{p_org:orgs[0],p_title:tag,p_template:template,p_geography:geo,p_target:100,p_start:day(0),p_end:day(10),p_purpose:'Disposable recruitment consent regression',p_consent_version:'2415',p_consent_notice:'Disposable local test records only.'});
 await get(service.from('volunteer_profiles').update({status:'verified',geography_id:geo}).eq('user_id',worker.id));
 const available=await call(worker.client,'available_work_opportunities',{p_page:0,p_area:null,p_payment:null,p_organization:orgs[0],p_skill:'',p_work_date:null,p_deadline:null});
 assert.equal(available.total,1);
 const args={p_project:project,p_user:worker.id,p_active:true};
 await rejected(organization.client.rpc('set_survey_assignment',args),/Worker acceptance required/);
 const application=await call(worker.client,'apply_work_opportunity',{p_opportunity:available.rows[0].id,p_availability:'Available throughout',p_note:'Disposable consent regression',p_profile_share_consent:true});
 await call(organization.client,'review_work_application',{p_id:application,p_status:'selected',p_note:'Selected for test offer',p_version:1});
 await rejected(organization.client.rpc('set_survey_assignment_scope',{...args,p_geography:geo}),/Worker acceptance required/);
 const offer=await call(organization.client,'create_work_assignment',{p_project:project,p_user:worker.id,p_source_kind:'application',p_source_id:application,p_work_mode:'volunteer',p_compensation_type:'none',p_currency:'PKR',p_rate:null,p_target_surveys:10,p_start:day(0),p_end:day(10),p_terms_note:'Explicit disposable local test terms'});
 await rejected(organization.client.rpc('set_survey_assignment',args),/Worker acceptance required/);
 await rejected(worker.client.rpc('set_survey_assignment',args),/permission required/);
 await rejected(outsider.client.rpc('set_survey_assignment',args),/permission required/);
 await rejected(worker.client.from('survey_assignments').insert({project_id:project,user_id:worker.id,active:true}),/permission denied|row-level security/);
 assert.equal((await get(worker.client.from('work_assignments').select('id,status').eq('id',offer).maybeSingle())).status,'offered');
 assert.equal(await get(outsider.client.from('work_assignments').select('id').eq('id',offer).maybeSingle()),null);
 assert.equal((await get(organization.client.from('work_applications').select('id').eq('id',application).maybeSingle())).id,application);
 assert.equal(await get(outsider.client.from('work_applications').select('id').eq('id',application).maybeSingle()),null);
 assert.equal(await get(worker.client.from('work_assignments').select('id').eq('id',randomUUID()).maybeSingle()),null);
 console.log('PASS real Auth/PostgREST exact-ID assignment/application reads, nonexistence and cross-organization RLS');
 const cursor=await get(worker.client.from('work_assignments').select('id,created_at').eq('id',offer).single());
 const after=await get(worker.client.from('work_assignments').select('id').eq('user_id',worker.id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(51).or('created_at.lt.'+cursor.created_at+',and(created_at.eq.'+cursor.created_at+',id.lt.'+cursor.id+')'));
 assert.equal(after.length,0);
 const later=new Date(Date.parse(cursor.created_at)+1000).toISOString();
 const before=await get(worker.client.from('work_assignments').select('id').eq('user_id',worker.id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(51).or('created_at.lt.'+later+',and(created_at.eq.'+later+',id.lt.'+cursor.id+')'));
 assert.deepEqual(before.map(row=>row.id),[offer]);
 console.log('PASS real PostgREST keyset cursor timestamp/UUID syntax and strict page boundary');
 assert.equal(await call(worker.client,'can_collect_project',{p_project:project}),false);
 await call(worker.client,'respond_work_assignment',{p_id:offer,p_status:'accepted',p_version:1});
 await call(worker.client,'respond_work_assignment',{p_id:offer,p_status:'accepted',p_version:1});
 assert.equal(await call(worker.client,'can_collect_project',{p_project:project}),true);
 await call(organization.client,'set_survey_assignment_scope',{...args,p_geography:geo});
 assert.equal((await get(worker.client.from('profile_shares').select('user_id').eq('organization_id',orgs[0]))).length,0);
 assert.equal((await get(outsider.client.from('work_assignments').select('id').eq('id',offer))).length,0);
 const contractBefore=await get(service.from('work_assignments').select('*').eq('id',offer).single());
 for(const [start,end,expected] of [[1,10,false],[-10,-1,false],[0,10,true],[-10,0,true],[0,10,true]]){
  await get(service.from('survey_projects').update({start_date:day(start),end_date:day(end)}).eq('id',project));
  assert.equal(await call(worker.client,'can_collect_project',{p_project:project}),expected);
  await call(organization.client,'set_survey_assignment',args);
  await call(organization.client,'set_survey_assignment_scope',{...args,p_geography:geo});
  assert.equal(await call(worker.client,'can_collect_project',{p_project:project}),expected);
  assert.deepEqual(await get(service.from('work_assignments').select('*').eq('id',offer).single()),contractBefore);
 }
 console.log('PASS real API project-date boundaries, immediate date edits, unchanged accepted contract and legacy RPC non-bypass');
 await call(organization.client,'set_survey_assignment',{...args,p_active:false});
 assert.equal(await call(worker.client,'can_collect_project',{p_project:project}),false);
 console.log('PASS real Auth, automatic marketplace, application consent, review, offer, acceptance, idempotency, scope, revocation, RLS and cross-organization denial');
}catch(error){console.error('Integration failure:',error);throw error;}finally{
 const failures=[];
 async function clean(table,column,ids){if(!ids.length)return;const r=await service.from(table).delete().in(column,ids);if(r.error)failures.push(table+': '+r.error.message);}
 if(project){
  for(const [table,column] of [['notifications','project_id'],['operational_tasks','project_id'],['work_assignments','survey_project_id'],['work_applications','survey_project_id'],['work_opportunities','survey_project_id'],['survey_assignments','project_id'],['survey_projects','id']])await clean(table,column,[project]);
 }
 await clean('survey_templates','id',template?[template]:[]);

 await clean('notifications','user_id',users.map(u=>u.id));
 await clean('operational_tasks','organization_id',orgs);
 await clean('audit_events','organization_id',orgs);
 await clean('audit_events','actor_id',users.map(u=>u.id));
 await clean('organizations','id',orgs);
 for(const u of users){const r=await service.auth.admin.deleteUser(u.id);if(r.error)failures.push('user '+u.id+': '+r.error.message);}
 await clean('geographies','id',geo?[geo]:[]);
 if(failures.length){writeFileSync('/tmp/fieldlance-2416-cleanup.json',JSON.stringify({tag,users:users.map(u=>u.id),orgs,project,template,geo,failures},null,2));throw Error('Disposable cleanup incomplete: '+failures.join('; '));}
 console.log('PASS all disposable recruitment records/accounts removed:',tag);
}
