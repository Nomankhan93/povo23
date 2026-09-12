import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {schemaDb} from './schema-test-db.mjs';

const db=await schemaDb('20260919000200_canonical_unmerge_fix.sql');
let passed=0;
const ids=Object.fromEntries(['super','manager','ngoA','ngoB','ngoC','collectorA','collectorB'].map((n,i)=>[n,`82000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`]));
const rows=async(q,p=[]) => (await db.query(q,p)).rows;
async function as(n){await db.exec('RESET ROLE');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[n]||'']);await db.exec('SET ROLE '+(n?'authenticated':'anon'))}
async function call(n,a){return (await rows(`select public.${n}(${a.map((_,i)=>'$'+(i+1)).join(',')}) result`,a))[0].result}
const deny=(f,re=/permission|required|not found|approved|expired|revoked|subset|active|unavailable/i)=>assert.rejects(f,re);
async function ok(n,f){await f();passed++;console.log('PASS '+n)}
try{
 for(const [name,id] of Object.entries(ids)) await db.query('insert into auth.users(id,email) values($1,$2)',[id,name+'@example.test']);
 await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.super]);
 await as('super');
 await call('set_account_access',[ids.manager,'survey_manager','active']);
 const orgA=await call('save_organization',[null,{name:'NGO A',status:'active'}]);
 const orgB=await call('save_organization',[null,{name:'NGO B',status:'active'}]);
 const orgC=await call('save_organization',[null,{name:'NGO C',status:'active'}]);
 await call('set_membership',[orgA,ids.ngoA,'ngo_admin','active']);
 await call('set_membership',[orgB,ids.ngoB,'ngo_admin','active']);
 await call('set_membership',[orgC,ids.ngoC,'ngo_admin','active']);
 const geo=await call('save_geography',[null,null,'province','Sharing Test Province','STP','Synthetic fixture',true]);
 const template=await call('publish_survey_template',['Sharing pilot',[{id:'need',label:'Need',type:'text',required:true}]]);
 const dates=(await rows("select ((now() at time zone 'UTC')::date-1)::text start,((now() at time zone 'UTC')::date+3)::text end,((now() at time zone 'UTC')::date)::text today,(now()+interval '30 days')::text expiry"))[0];
 const projectA=await call('create_survey_project',[orgA,'NGO A Orphan Pilot',template,geo,50,dates.start,dates.end,'Assess education support','pilot-v1','Explain POEM storage and NGO A purpose.']);
 const projectB=await call('create_survey_project',[orgB,'NGO B Education Pilot',template,geo,50,dates.start,dates.end,'Assess education support','pilot-v1','Explain POEM storage and NGO B purpose.']);
 await db.exec('RESET ROLE');
 await db.query("update public.volunteer_profiles set status='verified' where user_id in ($1,$2)",[ids.collectorA,ids.collectorB]);
 await as('collectorA');await call('set_profile_sharing',[orgA,true]);
 await as('collectorB');await call('set_profile_sharing',[orgB,true]);
 await as('ngoA');await call('set_survey_assignment',[projectA,ids.collectorA,true]);
 await as('ngoB');await call('set_survey_assignment',[projectB,ids.collectorB,true]);
 async function save(who,project,name,birth){await as(who);return call('save_survey_response',[null,project,null,null,name,birth,'Household '+name,{need:'Education'},{agreed:true,method:'verbal',representative:'Guardian',relationship:'Guardian'},true,0,crypto.randomUUID()])}
 const responseA=await save('collectorA',projectA,'Ahmed Ali','2012-03-04');
 const responseB=await save('collectorB',projectB,' Ahmed-Ali ','2012-03-04');
 await as('manager');
 const personA=(await rows('select * from public.registry_persons where project_id=$1',[projectA]))[0];
 const personB=(await rows('select * from public.registry_persons where project_id=$1',[projectB]))[0];
 assert(personA&&personB);
 await as('ngoA');await call('review_survey_response',[responseA,'approved','Approved NGO A survey',1]);
 await as('ngoB');await call('review_survey_response',[responseB,'approved','Approved NGO B survey',1]);
 await as('manager');
 const mergeEvent=await call('review_canonical_match',[personA.id,personB.id,'same_person','Same child confirmed from source documents',personA.version,personB.version,0]);
 assert(mergeEvent);
 await as('ngoA');
 const assistance=crypto.randomUUID();
 await call('record_assistance',[assistance,personA.id,'cash','education','School support','School fee',5000,null,null,dates.today,'NGO A Fund','Receipt A',null]);
 const need=crypto.randomUUID();
 await call('create_beneficiary_need',[need,responseA,'health','Medical assessment follow-up','high',null,'Approved survey indicates a health support need']);

 await db.exec('RESET ROLE');
 await db.exec(readFileSync('supabase/migrations/20260920000100_phase25_controlled_sharing.sql','utf8'));

 await ok('unrelated NGO cannot discover sharing sources or read source project data',async()=>{
  await as('ngoC');
  await deny(()=>call('data_sharing_sources',[personB.id]));
  assert.equal((await rows('select * from public.data_access_requests')).length,0);
  assert.equal((await rows('select * from public.assistance_entries where project_id=$1',[projectA])).length,0);
 });

 let requestId;
 await ok('requesting NGO sees coordination source without raw beneficiary details',async()=>{
  await as('ngoB');
  const sources=await call('data_sharing_sources',[personB.id]);
  assert.equal(sources.length,1);
  assert.equal(sources[0].organization_id,orgA);
  assert.equal(sources[0].organization_name,'NGO A');
  assert.equal(sources[0].has_assistance,true);
  assert.equal(sources[0].has_needs,true);
  assert.equal(sources[0].active_request,null);
  assert.equal((await rows('select * from public.assistance_entries where project_id=$1',[projectA])).length,0);
  assert.equal((await rows('select * from public.beneficiary_needs where project_id=$1',[projectA])).length,0);
 });

 await ok('NGO B creates field-scoped request and cannot self-approve it',async()=>{
  await as('ngoB');
  requestId=await call('create_data_access_request',[personB.id,orgA,'Assess education duplication before approving new support',['basic_identity_summary','assistance_categories','assistance_dates','program_names','needs_summary'],dates.expiry]);
  assert(requestId);
  const r=(await rows('select * from public.data_access_requests where id=$1',[requestId]))[0];
  assert.equal(r.status,'pending_source_approval');
  assert.equal(r.requesting_organization_id,orgB);
  assert.equal(r.source_organization_id,orgA);
  await deny(()=>call('review_data_access_request',[requestId,'approve',['assistance_categories'],'Self approval not allowed',r.version]));
 });

 await ok('request context reveals only each NGO own beneficiary record',async()=>{
  await as('ngoA');
  const sourceContext=await call('data_access_request_context',[requestId]);
  assert.equal(sourceContext.requesting_record,null);
  assert.equal(sourceContext.source_records.length,1);
  assert.equal(sourceContext.source_records[0].id,personA.id);
  await as('ngoB');
  const requesterContext=await call('data_access_request_context',[requestId]);
  assert.equal(requesterContext.requesting_record.id,personB.id);
  assert.equal(requesterContext.source_records.length,0);
  await as('ngoC');await deny(()=>call('data_access_request_context',[requestId]));
  await as('manager');
  const poemContext=await call('data_access_request_context',[requestId]);
  assert.equal(poemContext.requesting_record.id,personB.id);
  assert.equal(poemContext.source_records[0].id,personA.id);
 });

 await ok('source NGO may reduce fields but cannot add an unrequested field',async()=>{
  await as('ngoA');
  let r=(await rows('select * from public.data_access_requests where id=$1',[requestId]))[0];
  await deny(()=>call('review_data_access_request',[requestId,'approve',['assistance_categories','next_eligibility_date'],'Trying to add an unrequested field',r.version]),/subset|fields/i);
  await call('review_data_access_request',[requestId,'approve',['assistance_categories','assistance_dates','needs_summary'],'Approved only the minimum coordination fields',r.version]);
  r=(await rows('select * from public.data_access_requests where id=$1',[requestId]))[0];
  assert.equal(r.status,'pending_poem_approval');
  assert.deepEqual(new Set(r.source_approved_fields),new Set(['assistance_categories','assistance_dates','needs_summary']));
 });

 let grantId;
 await ok('POEM can only authorize source-approved fields and creates time-limited grant',async()=>{
  await as('manager');
  let r=(await rows('select * from public.data_access_requests where id=$1',[requestId]))[0];
  await deny(()=>call('authorize_data_access_request',[requestId,'approve',['assistance_categories','program_names'],dates.expiry,'Trying to add a field source did not approve',r.version]),/subset|fields/i);
  grantId=await call('authorize_data_access_request',[requestId,'approve',['assistance_categories','assistance_dates','needs_summary'],dates.expiry,'POEM approves minimum coordination scope',r.version]);
  assert(grantId);
  r=(await rows('select * from public.data_access_requests where id=$1',[requestId]))[0];
  assert.equal(r.status,'approved');
  const g=(await rows('select * from public.data_access_grants where id=$1',[grantId]))[0];
  assert.equal(g.status,'active');
  assert.equal(g.grantee_organization_id,orgB);
  assert.equal(g.source_organization_id,orgA);
 });

 await ok('shared summary exposes only authorized fields, never raw survey or assistance internals',async()=>{
  await as('ngoB');
  const summary=await call('get_shared_beneficiary_summary',[grantId]);
  assert.deepEqual(summary.identity,{});
  assert.equal(summary.assistance.length,1);
  assert.deepEqual(Object.keys(summary.assistance[0]).sort(),['category','delivered_on']);
  assert.equal(summary.assistance[0].category,'education');
  assert.equal(summary.needs.length,1);
  assert.deepEqual(Object.keys(summary.needs[0]).sort(),['category','follow_up_on','priority','status']);
  assert.equal(summary.needs[0].category,'health');
  assert.equal('amount_pkr' in summary.assistance[0],false);
  assert.equal('funding_source' in summary.assistance[0],false);
  assert.equal('evidence_reference' in summary.assistance[0],false);
  assert.equal((await rows('select * from public.survey_responses where project_id=$1',[projectA])).length,0);
  const events=await rows("select * from public.data_access_events where grant_id=$1 and event_type='summary_viewed'",[grantId]);
  assert.equal(events.length,1);
 });

 await ok('source NGO and unrelated NGO cannot use grantee-only summary RPC',async()=>{
  await as('ngoA');await deny(()=>call('get_shared_beneficiary_summary',[grantId]));
  await as('ngoC');await deny(()=>call('get_shared_beneficiary_summary',[grantId]));
 });

 await ok('canonical identity change invalidates the old grant until fresh authorization',async()=>{
  await as('manager');
  const event=(await rows('select * from public.canonical_merge_events where id=$1',[mergeEvent]))[0];
  const primary=(await rows('select * from public.canonical_persons where id=$1',[event.primary_canonical_id]))[0];
  const secondary=(await rows('select * from public.canonical_persons where id=$1',[event.secondary_canonical_id]))[0];
  await call('revert_canonical_merge',[mergeEvent,'Identity documents require a fresh coordination review',primary.version,secondary.version]);
  await as('ngoB');await deny(()=>call('get_shared_beneficiary_summary',[grantId]),/canonical identity changed|source identity link changed/i);
  await as('manager');
  const decision=(await rows('select * from public.canonical_match_decisions where person_a=$1 and person_b=$2',[...([personA.id,personB.id].sort())]))[0];
  await call('review_canonical_match',[personA.id,personB.id,'same_person','Fresh document review reconfirms the same beneficiary',personA.version,personB.version,decision.version]);
  await as('ngoB');await deny(()=>call('get_shared_beneficiary_summary',[grantId]),/canonical identity changed/i);
 });

 await ok('source NGO revocation immediately ends shared access and allows a future request',async()=>{
  await as('ngoA');
  const g=(await rows('select * from public.data_access_grants where id=$1',[grantId]))[0];
  await call('revoke_data_access_grant',[grantId,'Coordination purpose completed',g.version]);
  await as('ngoB');
  await deny(()=>call('get_shared_beneficiary_summary',[grantId]),/revoked/i);
  const sources=await call('data_sharing_sources',[personB.id]);
  assert.equal(sources[0].active_request,null);
  const next=await call('create_data_access_request',[personB.id,orgA,'Reassessment after a new support cycle',['assistance_categories'],dates.expiry]);
  assert(next&&next!==requestId);
 });

 await as(null);
 await ok('anonymous cannot use sharing RPCs',async()=>{
  await deny(()=>call('data_sharing_sources',[personB.id]));
  await deny(()=>call('get_shared_beneficiary_summary',[grantId]));
 });
 console.log(`${passed} Phase 2.5 controlled sharing tests passed.`);
}finally{await db.close()}
