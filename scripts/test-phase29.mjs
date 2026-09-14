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





 await db.exec('RESET ROLE');
 await db.query("update public.organizations set registration_number='TEST-REG-001' where id=$1",[orgA]);
 await db.query("update public.volunteer_profiles set details=jsonb_build_object('full_name','Synthetic Volunteer A') where user_id=$1",[ids.collectorA]);
 await as('ngoA');const orgCase=await call('request_independent_verification',['organization',orgA,'Private register reference ORG-1','Please independently review registration']);
 await deny(()=>call('review_independent_verification',[orgCase,'verified','issuer_check','Cannot review own NGO',dates.expiry,1]),/permission|independent/i);
 await as('ngoB');assert.equal((await call('list_independent_verifications',['organization',0,25])).rows.length,0);assert.equal((await rows('select * from public.independent_verifications')).length,0);await deny(()=>call('request_independent_verification',['organization',orgA,'Private reference','Foreign NGO request']),/permission/);console.log('PASS NGO case isolation and independent role restriction');
 await as('super');await call('review_independent_verification',[orgCase,'verified','issuer_check','Confirmed registration with issuer',dates.expiry,1]);
 await as('ngoA');assert.equal((await call('list_independent_verifications',['organization',0,25])).rows[0].effective_status,'verified');console.log('PASS NGO evidence review separate from active status');
 await as('collectorA');const volunteerCase=await call('request_independent_verification',['volunteer',ids.collectorA,'Private document reference VOL-1','Identity evidence review requested']);
 await deny(()=>call('request_independent_verification',['volunteer',ids.collectorB,'Private document reference','Foreign volunteer request']),/permission/);
 await as('super');await call('review_independent_verification',[volunteerCase,'verified','in_person_check','Checked identity in person',dates.expiry,1]);await deny(()=>call('review_independent_verification',[volunteerCase,'revoked','document_review','Outdated review version',dates.expiry,1]),/changed/);console.log('PASS volunteer verification and stale reviewer guard');
 const ownCase=await call('request_independent_verification',['volunteer',ids.collectorB,'Private document reference VOL-2','POEM requests another identity review']);await deny(()=>call('review_independent_verification',[ownCase,'verified','document_review','Requester cannot approve own case',dates.expiry,1]),/independent/);await call('review_independent_verification',[ownCase,'withdrawn','document_review','Withdraw this pending request',dates.expiry,1]);console.log('PASS requester cannot self-approve and can withdraw');
 await as('manager');let c=await call('canonical_person_summary',[personA.id]);const beneficiaryCase=await call('request_independent_verification',['beneficiary',c.id,'Private beneficiary evidence BEN-1','Independent beneficiary identity review']);await as('super');await deny(()=>call('review_independent_verification',[beneficiaryCase,'verified','document_review','Identity evidence inspected',dates.expiry,1]),/canonical identity review/);
 await as('manager');await call('reconcile_canonical_identity',[personA.id,personA.version,c.version,'Reconcile source before identity check']);await as('super');await deny(()=>call('review_independent_verification',[beneficiaryCase,'verified','document_review','Old subject snapshot',dates.expiry,1]),/changed/);console.log('PASS beneficiary merge approval is not identity verification');
 await as('manager');c=await call('canonical_person_summary',[personA.id]);const ben2=await call('request_independent_verification',['beneficiary',c.id,'Private beneficiary evidence BEN-2','Fresh reviewed source snapshot']);await as('super');await call('review_independent_verification',[ben2,'verified','document_review','Independent evidence reviewed',dates.expiry,1]);console.log('PASS independent beneficiary verification after canonical review');
 await as('ngoA');await deny(()=>call('publish_project_policy',[projectA,0,365,'none',true,true,false,'NGO cannot publish policy']),/permission/);
 await as('manager');assert.equal(await call('publish_project_policy',[projectA,0,365,'none',true,true,false,'Enable evidence-based collection gates']),1);await deny(()=>call('publish_project_policy',[projectA,0,365,'none',true,true,false,'Old policy revision']),/changed/);console.log('PASS POEM-only immutable policy publication and concurrency guard');
 const consent={agreed:true,method:'verbal',representative:'Guardian',relationship:'Guardian',governance_version:1};
 const args=[null,projectA,null,null,'Governed Child','2013-01-01','Governed Household',{need:'Education'},consent,true,0,crypto.randomUUID()];await as('collectorA');await deny(()=>call('save_survey_response',[...args.slice(0,8),{...consent,governance_version:0},...args.slice(9)]),/policy changed/);const saved=await call('save_survey_response',args);assert.equal((await rows('select governance_version from public.survey_responses where id=$1',[saved]))[0].governance_version,1);console.log('PASS policy token enforced and response bound to immutable revision');
 await as('manager');await call('publish_project_policy',[projectA,1,365,'none',true,true,true,'Pause project field collection']);await as('collectorA');assert.equal(await call('save_survey_response',args),saved);await deny(()=>call('save_survey_response',[...args.slice(0,8),{...consent,governance_version:2},true,0,crypto.randomUUID()]),/Collection unavailable/);console.log('PASS pause blocks new saves while acknowledged retry remains idempotent');
 await as('manager');await call('publish_project_policy',[projectA,2,365,'none',true,true,false,'Resume governed collection']);await as('super');await call('review_independent_verification',[volunteerCase,'revoked','in_person_check','Revoke evidence after follow-up',dates.expiry,2]);await as('collectorA');await deny(()=>call('save_survey_response',[...args.slice(0,8),{...consent,governance_version:3},true,0,crypto.randomUUID()]),/Collection unavailable/);assert.equal((await rows('select status from public.volunteer_profiles where user_id=$1',[ids.collectorA]))[0].status,'verified');console.log('PASS revocation blocks governed collection without unpublishing profile');
 await as('manager');await call('set_project_sharing_discovery',[projectA,true,'Controlled source discovery update']);const p=(await rows('select * from public.survey_projects where id=$1',[projectA]))[0];assert.equal(p.governance_version,4);assert.equal(p.sharing_discoverable,true);assert.equal((await rows('select count(*)::integer n from public.project_policy_versions where project_id=$1',[projectA]))[0].n,4);console.log('PASS discovery updates preserve immutable policy history');
 await as('collectorA');const freshV=await call('request_independent_verification',['volunteer',ids.collectorA,'Private document reference VOL-3','Renew independently revoked verification']);await as('super');await call('review_independent_verification',[freshV,'verified','document_review','Fresh independently inspected evidence',dates.expiry,1]);
 await db.exec('RESET ROLE');await db.query("update public.volunteer_profiles set details=jsonb_build_object('full_name','Corrected Name'),version=version+1 where user_id=$1",[ids.collectorA]);await as('collectorA');assert.equal((await call('list_independent_verifications',['volunteer',0,25])).rows.find(v=>v.id===freshV).effective_status,'stale');console.log('PASS changed volunteer source invalidates verification');
 await db.exec('RESET ROLE');await db.query("update public.organizations set name='Changed NGO A' where id=$1",[orgA]);await db.query("update public.organizations set name='NGO A' where id=$1",[orgA]);await as('ngoA');assert.equal((await call('list_independent_verifications',['organization',0,25])).rows.find(v=>v.id===orgCase).effective_status,'stale');console.log('PASS reverted NGO identity edits cannot resurrect old verification');
 await db.exec('RESET ROLE');await db.query("update public.independent_verifications set expires_at=now()-interval '1 day' where id=$1",[ben2]);await as('manager');assert.equal((await call('list_independent_verifications',['beneficiary',0,25])).rows.find(v=>v.id===ben2).effective_status,'expired');console.log('PASS expiry is enforced without a scheduled job');
 await as('ngoB');assert.equal((await rows('select * from public.project_policy_versions where project_id=$1',[projectA])).length,0);await assert.rejects(()=>db.exec('update public.project_policy_versions set retention_days=5'));await assert.rejects(()=>db.exec("update public.independent_verifications set status='verified'"));await as(null);await assert.rejects(()=>call('list_independent_verifications',['organization',0,25]));console.log('PASS raw mutation, foreign policy and anonymous access denied');
 await as('super');const ev=await rows('select * from public.independent_verification_events where verification_id=$1',[orgCase]);assert.equal(ev.length,2);await db.exec('RESET ROLE');const unprotected=await rows("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity");assert.deepEqual(unprotected,[]);console.log('PASS verification history retained and every public table has RLS');
 console.log('16 Phase 2.9 governance and verification scenarios passed');
}finally{await db.close()}
