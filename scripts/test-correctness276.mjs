import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {schemaDb} from './schema-test-db.mjs';

const db=await schemaDb();
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




 await as('ngoB');assert.deepEqual(await call('data_sharing_sources',[personB.id]),[]);console.log('PASS source discovery disabled by default');
 await as('collectorB');await deny(()=>call('check_existing_identity',[projectB,'Ahmed Ali','2012-03-04']));console.log('PASS collector cannot probe foreign identities');
 await as('ngoA');await deny(()=>call('set_project_sharing_discovery',[projectA,true,'Enable source NGO name discovery']));
 await as('manager');await call('set_project_sharing_discovery',[projectA,true,'Enable source NGO name discovery']);
 await as('ngoB');const before=await call('data_sharing_sources',[personB.id]);assert.equal(before.length,1);assert(!('has_needs' in before[0]));assert(!('has_assistance' in before[0]));console.log('PASS explicit discovery exposes no needs or assistance signals');
 async function reconcile(personId){await as('manager');const s=(await rows('select * from public.registry_persons where id=$1',[personId]))[0];const c=await call('canonical_person_summary',[personId]);await call('reconcile_canonical_identity',[personId,s.version,c.version,'Reviewed authoritative source with NGO records']);}
 await reconcile(personA.id);
 await as('ngoB');const req=await call('create_data_access_request',[personB.id,orgA,'Controlled sharing regression request',['basic_identity_summary'],dates.expiry]);
 await as('ngoA');await call('review_data_access_request',[req,'approve',['basic_identity_summary'],'Source approval',1]);
 await as('manager');const grant=await call('authorize_data_access_request',[req,'approve',['basic_identity_summary'],dates.expiry,'POEM approval',2]);
 await as('ngoB');assert((await call('get_shared_beneficiary_summary',[grant])).identity);
 await as('ngoC');await deny(()=>call('get_shared_beneficiary_summary',[grant]));assert.equal((await rows('select * from public.registry_persons')).length,0);console.log('PASS grant scoping and raw NGO isolation');
 await as('manager');const beforeSummary=await call('canonical_person_summary',[personA.id]);
 await as('ngoA');await call('correct_registry_person',[personA.id,'Corrected Different Name','1999-01-01',personA.household_id,'Correct mistaken source details',1]);
 await as('manager');const afterSummary=await call('canonical_person_summary',[personA.id]);assert.equal(afterSummary.version,beforeSummary.version+1);assert.equal(afterSummary.display_name,beforeSummary.display_name);assert.equal(afterSummary.review_required,true);
 await deny(()=>call('reconcile_canonical_identity',[personA.id,1,beforeSummary.version,'Stale review must fail']),/changed/);
 await as('ngoB');await deny(()=>call('get_shared_beneficiary_summary',[grant]));await deny(()=>call('create_data_access_request',[personB.id,orgA,'Request before identity review',['basic_identity_summary'],dates.expiry]),/review/);console.log('PASS source correction marks stale, preserves identity and revokes access');
 await as('manager');
 let staleDecision=(await rows('select * from public.canonical_match_decisions'))[0];
 await deny(
  ()=>reconcile(personA.id),
  /Resolve unresolved or stale canonical match decisions/i
 );
 await call(
  'review_canonical_match',
  [
   personA.id,
   personB.id,
   'same_person',
   'Reconfirm corrected source belongs to the existing canonical identity',
   2,
   personB.version,
   staleDecision.version
  ]
 );
 await reconcile(personA.id);
 await as('ngoB');
 const fresh=await call(
  'create_data_access_request',
  [
   personB.id,
   orgA,
   'Fresh authorization after identity review',
   ['basic_identity_summary'],
   dates.expiry
  ]
 );
 assert.notEqual(fresh,req);
 await deny(()=>call('get_shared_beneficiary_summary',[grant]));
 console.log('PASS fresh request after invalidation requires new approvals');
 await as('manager');let decision=(await rows('select * from public.canonical_match_decisions'))[0];await call('review_canonical_match',[personA.id,personB.id,'same_person','Reconfirm existing reviewed merge',2,personB.version,decision.version]);decision=(await rows('select * from public.canonical_match_decisions'))[0];assert.equal(decision.merge_event_id,mergeEvent);console.log('PASS repeated review preserves merge event');
 const ev=(await rows('select * from public.canonical_merge_events where id=$1',[mergeEvent]))[0];let primary=(await rows('select * from public.canonical_persons where id=$1',[ev.primary_canonical_id]))[0],secondary=(await rows('select * from public.canonical_persons where id=$1',[ev.secondary_canonical_id]))[0];
 await deny(()=>call('revert_canonical_merge',[mergeEvent,'Stale merge reversal',primary.version-1,secondary.version]),/changed/);
 await call('revert_canonical_merge',[mergeEvent,'Revert repeated same-person decision',primary.version,secondary.version]);decision=(await rows('select * from public.canonical_match_decisions'))[0];assert.equal(decision.status,'needs_review');
 const links=await rows('select canonical_person_id from public.canonical_person_links where project_person_id in ($1,$2)',[personA.id,personB.id]);assert.notEqual(links[0].canonical_person_id,links[1].canonical_person_id);
 assert.equal((await rows('select * from public.canonical_merge_events where id=$1',[mergeEvent]))[0].reverted,true);
 assert((await rows('select * from public.canonical_match_revisions')).length>=3);console.log('PASS unmerge reconciles decisions and retains revision history');
 // Legacy missing event pointer still gets reconciled on reversal.
 decision=(await rows('select * from public.canonical_match_decisions'))[0];const merge2=await call('review_canonical_match',[personA.id,personB.id,'same_person','Second controlled merge',2,personB.version,decision.version]);
 await db.exec('RESET ROLE');await db.exec('update public.canonical_match_decisions set merge_event_id=null');await as('manager');
 const e2=(await rows('select * from public.canonical_merge_events where id=$1',[merge2]))[0];primary=(await rows('select * from public.canonical_persons where id=$1',[e2.primary_canonical_id]))[0];secondary=(await rows('select * from public.canonical_persons where id=$1',[e2.secondary_canonical_id]))[0];
 await call('revert_canonical_merge',[merge2,'Revert legacy missing pointer',primary.version,secondary.version]);assert.equal((await rows('select * from public.canonical_match_decisions'))[0].status,'needs_review');console.log('PASS reversal repairs legacy missing event pointer');

 const responseC=await save('collectorA',projectA,'Third source child','2012-03-04');
 await as('manager');const personC=(await rows('select p.* from public.registry_persons p join public.survey_responses r on r.person_id=p.id where r.id=$1',[responseC]))[0];
 decision=(await rows('select * from public.canonical_match_decisions where person_a=least($1::uuid,$2::uuid) and person_b=greatest($1::uuid,$2::uuid)',[personA.id,personB.id]))[0];
 const firstChain=await call('review_canonical_match',[personA.id,personB.id,'same_person','First chain merge',2,personB.version,decision.version]);
 const secondChain=await call('review_canonical_match',[personB.id,personC.id,'same_person','Later chain merge',personB.version,personC.version,0]);
 async function reverse(event){const e=(await rows('select * from public.canonical_merge_events where id=$1',[event]))[0],a=(await rows('select version from public.canonical_persons where id=$1',[e.primary_canonical_id]))[0],b=(await rows('select version from public.canonical_persons where id=$1',[e.secondary_canonical_id]))[0];return call('revert_canonical_merge',[event,'Reverse chain with retained history',a.version,b.version]);}
 await deny(()=>reverse(firstChain),/later canonical merge/);await reverse(secondChain);await reverse(firstChain);console.log('PASS chained merges reverse in dependency order');
 await db.exec('RESET ROLE');const inventory=await rows("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity");assert.deepEqual(inventory,[]);console.log('PASS every public table retains RLS');
 console.log('2.7.6 SQL correctness regressions passed');
}finally{await db.close()}
