import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {schemaDb} from './schema-test-db.mjs';

const db=await schemaDb('20260918000100_stabilization.sql');let passed=0;
const ids=Object.fromEntries(['super','manager','ngoA','ngoB','collectorA','collectorB'].map((n,i)=>[n,`81000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`]));
const rows=async(q,p=[]) => (await db.query(q,p)).rows;
async function as(n){await db.exec('RESET ROLE');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[n]||'']);await db.exec('SET ROLE '+(n?'authenticated':'anon'))}
async function call(n,a){return (await rows(`select public.${n}(${a.map((_,i)=>'$'+(i+1)).join(',')}) result`,a))[0].result}
const deny=(f,re=/permission|required|not found|different project|unavailable|revert/i)=>assert.rejects(f,re);
async function ok(n,f){await f();passed++;console.log('PASS '+n)}
try{
 for(const [name,id] of Object.entries(ids)) await db.query('insert into auth.users(id,email) values($1,$2)',[id,name+'@example.test']);
 await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.super]);
 await as('super');await call('set_account_access',[ids.manager,'survey_manager','active']);
 const orgA=await call('save_organization',[null,{name:'NGO A',status:'active'}]);
 const orgB=await call('save_organization',[null,{name:'NGO B',status:'active'}]);
 await call('set_membership',[orgA,ids.ngoA,'ngo_admin','active']);await call('set_membership',[orgB,ids.ngoB,'ngo_admin','active']);
 const geo=await call('save_geography',[null,null,'province','Canonical Test Province','CTP','Synthetic fixture',true]);
 const template=await call('publish_survey_template',['Canonical pilot',[{id:'need',label:'Need',type:'text',required:true}]]);
 const dates=(await rows("select ((now() at time zone 'UTC')::date-1)::text start,((now() at time zone 'UTC')::date+3)::text end,((now() at time zone 'UTC')::date)::text today"))[0];
 const projectA=await call('create_survey_project',[orgA,'NGO A Orphan Pilot',template,geo,50,dates.start,dates.end,'Assess education support','pilot-v1','Explain POEM storage and NGO A purpose.']);
 const projectB=await call('create_survey_project',[orgB,'NGO B Education Pilot',template,geo,50,dates.start,dates.end,'Assess education support','pilot-v1','Explain POEM storage and NGO B purpose.']);
 await db.exec('RESET ROLE');await db.query("update public.volunteer_profiles set status='verified' where user_id in ($1,$2)",[ids.collectorA,ids.collectorB]);
 await as('collectorA');await call('set_profile_sharing',[orgA,true]);await as('collectorB');await call('set_profile_sharing',[orgB,true]);
 await as('ngoA');await call('set_survey_assignment',[projectA,ids.collectorA,true]);await as('ngoB');await call('set_survey_assignment',[projectB,ids.collectorB,true]);
 async function save(who,project,name,birth){await as(who);return call('save_survey_response',[null,project,null,null,name,birth,'Household '+name,{need:'Education'},{agreed:true,method:'verbal',representative:'Guardian',relationship:'Guardian'},true,0,crypto.randomUUID()])}
 const responseA=await save('collectorA',projectA,'Ahmed Ali','2012-03-04');const responseB=await save('collectorB',projectB,' Ahmed-Ali ','2012-03-04');
 await as('manager');
 const personA=(await rows('select * from public.registry_persons where project_id=$1',[projectA]))[0];const personB=(await rows('select * from public.registry_persons where project_id=$1',[projectB]))[0];
 assert(personA && personB,'POEM survey manager should read both project registry persons');
 await as('ngoA');await call('review_survey_response',[responseA,'approved','Approved NGO A survey',1]);await as('ngoB');await call('review_survey_response',[responseB,'approved','Approved NGO B survey',1]);

 await db.exec('RESET ROLE');
 await db.exec(readFileSync('supabase/migrations/20260919000100_canonical_registry.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20260919000200_canonical_unmerge_fix.sql','utf8'));
 await as('manager');
 await ok('migration backfills one canonical identity per existing project person',async()=>{const l=await rows('select * from public.canonical_person_links order by project_person_id');assert.equal(l.length,2);assert.notEqual(l[0].canonical_person_id,l[1].canonical_person_id);assert.equal((await rows('select count(*)::int n from public.canonical_person_revisions'))[0].n,2)});
 await ok('POEM manager sees explainable cross-project candidate',async()=>{const c=await call('canonical_match_candidates',[personA.id]);assert.equal(c.length,1);assert.equal(c[0].id,personB.id);assert(c[0].signals.includes('Same normalized name'));assert(c[0].signals.includes('Same birth date'));assert.equal(c[0].same_canonical,false)});
 await ok('partner NGO cannot read global canonical tables or detailed candidate RPC',async()=>{await as('ngoA');assert.equal((await rows('select * from public.canonical_persons')).length,0);await deny(()=>call('canonical_match_candidates',[personA.id]));await as('manager')});
 await ok('field identity preflight exposes no foreign NGO or person details',async()=>{await as('collectorA');const r=await call('check_existing_identity',[projectA,'Ahmed Ali','2012-03-04']);assert.deepEqual(Object.keys(r).sort(),['action','candidate_count','possible_match']);assert.equal(r.possible_match,true);assert.equal(r.action,'supervisor_review');await as('manager')});
 let mergeEvent;
 await ok('same-person review merges canonical links without deleting project records',async()=>{mergeEvent=await call('review_canonical_match',[personA.id,personB.id,'same_person','Same child confirmed from source documents',personA.version,personB.version,0]);assert(mergeEvent);const l=await rows('select canonical_person_id from public.canonical_person_links order by project_person_id');assert.equal(l[0].canonical_person_id,l[1].canonical_person_id);assert.equal((await rows('select count(*)::int n from public.registry_persons'))[0].n,2);const c=await call('canonical_match_candidates',[personA.id]);assert.equal(c[0].same_canonical,true);assert.equal(c[0].status,'same_person')});
 await as('ngoA');const aidA=crypto.randomUUID();await call('record_assistance',[aidA,personA.id,'cash','education','School support','School fee',5000,null,null,dates.today,'NGO A Fund','Receipt A',null]);await as('ngoB');const aidB=crypto.randomUUID();await call('record_assistance',[aidB,personB.id,'goods','education','School kit','Books and bag',null,1,'kit',dates.today,'NGO B Fund','Receipt B',null]);
 await as('manager');await ok('POEM canonical assistance timeline aggregates both project records',async()=>{const a=await call('canonical_assistance_timeline',[personA.id]);assert.equal(a.length,2);assert.deepEqual(new Set(a.map(x=>x.organization_name)),new Set(['NGO A','NGO B']))});
 await ok('merge is reversible with audited history',async()=>{const e=(await rows('select * from public.canonical_merge_events where id=$1',[mergeEvent]))[0];assert.equal(e.moved_project_person_ids.length,1);assert([personA.id,personB.id].includes(e.moved_project_person_ids[0]));const primary=(await rows('select * from public.canonical_persons where id=$1',[e.primary_canonical_id]))[0];const secondary=(await rows('select * from public.canonical_persons where id=$1',[e.secondary_canonical_id]))[0];await call('revert_canonical_merge',[mergeEvent,'Documents require renewed identity review',primary.version,secondary.version]);const l=await rows('select canonical_person_id from public.canonical_person_links order by project_person_id');assert.notEqual(l[0].canonical_person_id,l[1].canonical_person_id);const ev=(await rows('select * from public.canonical_merge_events where id=$1',[mergeEvent]))[0];assert.equal(ev.reverted,true);const d=(await rows('select * from public.canonical_match_decisions'))[0];assert.equal(d.status,'needs_review');assert.equal(d.merge_event_id,null)});
 await ok('reverted identities can be reviewed and merged again',async()=>{const d=(await rows('select * from public.canonical_match_decisions'))[0];const secondMerge=await call('review_canonical_match',[personA.id,personB.id,'same_person','Renewed document review confirms the same child',personA.version,personB.version,d.version]);assert(secondMerge);assert.notEqual(secondMerge,mergeEvent);const l=await rows('select canonical_person_id from public.canonical_person_links order by project_person_id');assert.equal(l[0].canonical_person_id,l[1].canonical_person_id);const oldEvent=(await rows('select * from public.canonical_merge_events where id=$1',[mergeEvent]))[0];const newEvent=(await rows('select * from public.canonical_merge_events where id=$1',[secondMerge]))[0];assert.equal(oldEvent.reverted,true);assert.equal(newEvent.reverted,false);const a=await call('canonical_assistance_timeline',[personA.id]);assert.equal(a.length,2)});
 await ok('new registry persons automatically receive canonical identities',async()=>{const before=(await rows('select count(*)::int n from public.canonical_persons'))[0].n;await save('collectorA',projectA,'New Person','2010-01-01');await as('manager');assert.equal((await rows('select count(*)::int n from public.canonical_persons'))[0].n,before+1)});
 await ok('direct canonical mutation denied to authenticated users',async()=>{await deny(()=>db.query("update public.canonical_persons set display_name='Tampered'"),/permission/)});
 await as(null);await ok('anonymous cannot call canonical RPCs',async()=>{await deny(()=>call('canonical_person_summary',[personA.id]));await deny(()=>call('check_existing_identity',[projectA,'Ahmed Ali','2012-03-04']))});
 console.log(`\n${passed} Phase 2.4 canonical registry tests passed.`);
}finally{await db.close()}
