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





 await as('manager');const c=await call('canonical_person_summary',[personA.id]);
 for(const who of ['ngoA','ngoB','collectorA','collectorB',null]){await as(who);await assert.rejects(()=>call('search_canonical_registry',['','all',0,25]));await assert.rejects(()=>call('canonical_workbench_detail',[c.id,'sources',0,25]));await assert.rejects(()=>call('preview_canonical_review',[personA.id,personB.id]));await assert.rejects(()=>call('apply_canonical_review',[{},'same_person','Unauthorized attempt']));}
 console.log('PASS every workbench RPC rejects NGO, collector and anonymous callers');
 await as('manager');const list=await call('search_canonical_registry',['','all',0,1]);assert.equal(list.rows.length,1);assert.equal(list.has_more,true);const next=await call('search_canonical_registry',['','all',list.rows[0].beneficiary_no,1]);assert.equal(next.rows.length,1);assert.notEqual(next.rows[0].id,list.rows[0].id);console.log('PASS keyset paging has bounded results without repeated identity');
 const byNo=await call('search_canonical_registry',['POEM-BEN-'+String(c.beneficiary_no).padStart(8,'0'),'all',0,25]);assert.equal(byNo.rows[0].id,c.id);const byId=await call('search_canonical_registry',[c.id,'all',0,25]);assert.equal(byId.rows.length,1);console.log('PASS beneficiary number and UUID lookup');
 assert((await call('search_canonical_registry',['','review_required',0,25])).rows.some(r=>r.id===c.id));assert.equal((await call('search_canonical_registry',['','merged',0,25])).rows.length,1);console.log('PASS review and merged filters');
 for(const args of [['','bogus',0,25],['','all',0,500],['','all',-1,25]])await deny(()=>call('search_canonical_registry',args),/Invalid/);await deny(()=>call('canonical_workbench_detail',[c.id,'documents',0,25]),/Invalid/);console.log('PASS invalid paging and section inputs rejected');
 const sources=await call('canonical_workbench_detail',[c.id,'sources',0,1]);assert.equal(sources.rows.length,1);assert.equal(sources.has_more,true);const source2=await call('canonical_workbench_detail',[c.id,'sources',1,1]);assert.notEqual(sources.rows[0].id,source2.rows[0].id);assert(sources.rows[0].organization_name);assert(sources.rows[0].link_reason);console.log('PASS source pagination preserves NGO/project provenance');
 for(const section of ['history','merges','assistance','decisions']){const r=await call('canonical_workbench_detail',[c.id,section,0,25]);assert(r.rows.length>0,section);assert.equal(r.identity.id,c.id)}console.log('PASS history, merge, assistance and decision sections');
 let preview=await call('preview_canonical_review',[personA.id,personB.id]);assert.equal(preview.moved_records,0);assert.equal(preview.source_a.organization_name,'NGO A');await call('apply_canonical_review',[preview,'same_person','Reconfirm existing reviewed links']);assert.equal((await rows('select * from public.canonical_match_decisions'))[0].merge_event_id,mergeEvent);console.log('PASS same-identity preview/review preserves merge lineage');
 await deny(()=>call('apply_canonical_review',[preview,'needs_review','Stale decision revision']),/changed/);await deny(()=>call('apply_canonical_review',[{},'same_person','Missing concurrency tokens']),/stale/);console.log('PASS stale decision and missing preview guards');
 preview=await call('preview_canonical_review',[personA.id,personB.id]);await as('ngoA');await call('correct_registry_person',[personA.id,'Corrected source name','2012-03-04',personA.household_id,'Verified source correction',personA.version]);await as('manager');await deny(()=>call('apply_canonical_review',[preview,'same_person','Outdated source comparison']),/stale/);console.log('PASS source correction invalidates workbench preview');
 const mergePage=await call('canonical_workbench_detail',[c.id,'merges',0,25]);const event=mergePage.rows[0];await call('revert_canonical_merge',[event.id,'Workbench reversal test',event.primary_version,event.secondary_version]);const old=await call('preview_canonical_review',[personA.id,personB.id]);assert.equal(old.moved_records,1);const active=await call('canonical_person_summary',[personA.id]);await call('reconcile_canonical_identity',[personA.id,2,active.version,'Review canonical source display']);await deny(()=>call('apply_canonical_review',[old,'same_person','Stale canonical version']),/stale/);console.log('PASS canonical-only change invalidates preview');
 const ready=await call('preview_canonical_review',[personA.id,personB.id]);await call('apply_canonical_review',[ready,'different_people','Reviewed separate identities']);const needs=await call('preview_canonical_review',[personA.id,personB.id]);await call('apply_canonical_review',[needs,'needs_review','Further evidence is required']);const final=await call('preview_canonical_review',[personA.id,personB.id]);const newEvent=await call('apply_canonical_review',[final,'same_person','Reviewed merge from workbench']);assert(newEvent);console.log('PASS all three reviewed decision paths and actual merge');
 await as('super');const audit=await rows("select distinct action from public.audit_events where action like 'canonical_%'");for(const action of ['canonical_registry_searched','canonical_workbench_viewed','canonical_review_previewed','canonical_match_reviewed'])assert(audit.some(a=>a.action===action));console.log('PASS reads, previews and decisions audited');
 await as('ngoB');assert.equal((await rows('select * from public.canonical_persons')).length,0);console.log('PASS raw canonical identities remain hidden from NGOs');
 console.log('14 Phase 2.8 workbench SQL scenarios passed');
}finally{await db.close()}
