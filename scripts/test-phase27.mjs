import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {schemaDb} from './schema-test-db.mjs';

const db=await schemaDb('20260920000100_phase25_controlled_sharing.sql');
let passed=0;
const ids=Object.fromEntries(['super','manager','ngo','otherngo','volA','volB','outsider'].map((n,i)=>[n,`91000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`]));
const rows=async(q,p=[]) => (await db.query(q,p)).rows;
async function as(n){await db.exec('RESET ROLE');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[n]||'']);await db.exec('SET ROLE '+(n?'authenticated':'anon'))}
async function call(n,a){return (await rows(`select public.${n}(${a.map((_,i)=>'$'+(i+1)).join(',')}) result`,a))[0].result}
const deny=(f,re=/required|permission|available|access|selected|verified|changed|assignment|share|outside|denied/i)=>assert.rejects(f,re);
async function ok(n,f){await f();passed++;console.log('PASS '+n)}
try{
 for(const [name,id] of Object.entries(ids)) await db.query('insert into auth.users(id,email) values($1,$2)',[id,name+'@example.test']);
 await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.super]);
 await as('super');
 await call('set_account_access',[ids.manager,'survey_manager','active']);
 const org=await call('save_organization',[null,{name:'Workforce NGO',status:'active'}]);
 const other=await call('save_organization',[null,{name:'Other NGO',status:'active'}]);
 await call('set_membership',[org,ids.ngo,'ngo_admin','active']);
 await call('set_membership',[other,ids.otherngo,'ngo_admin','active']);
 const province=await call('save_geography',[null,null,'province','Workforce Province','WFP','Synthetic fixture',true]);
 const division=await call('save_geography',[null,province,'division','Workforce Division','WFV','Synthetic fixture',true]);
 const district=await call('save_geography',[null,division,'district','Workforce District','WFD','Synthetic fixture',true]);
 const otherDistrict=await call('save_geography',[null,division,'district','Other District','WFO','Synthetic fixture',true]);
 const template=await call('publish_survey_template',['Workforce survey',[{id:'need',label:'Need',type:'text',required:true}]]);
 const d=(await rows("select ((now() at time zone 'UTC')::date-1)::text project_start,((now() at time zone 'UTC')::date)::text today,((now() at time zone 'UTC')::date+10)::text project_end,(now()+interval '30 minutes')::text reply_by"))[0];
 const project=await call('create_survey_project',[org,'Local Orphan Survey',template,district,500,d.project_start,d.project_end,'Collect verified orphan survey records','workforce-v1','Explain POEM and NGO workforce survey purpose.']);
 await db.exec('RESET ROLE');
 await db.query("update public.volunteer_profiles set status='verified',geography_id=$1,details=jsonb_build_object('full_name',case user_id when $2::uuid then 'Volunteer A' else 'Volunteer B' end,'skills','Household Survey, Data Collection','languages','Sindhi, Urdu','availability','Full-time') where user_id in ($2,$3)",[district,ids.volA,ids.volB]);
 await db.query("update public.volunteer_profiles set status='verified',geography_id=$1,details=jsonb_build_object('full_name','Outside Volunteer','skills','Data Collection','languages','Sindhi','availability','Full-time') where user_id=$2",[otherDistrict,ids.outsider]);
 await as('volA');await call('set_profile_sharing',[org,true]);
 await as('volB');await call('set_profile_sharing',[org,true]);
 await as('outsider');await call('set_profile_sharing',[org,true]);

 await db.exec('RESET ROLE');
 await db.exec(readFileSync('supabase/migrations/20260921000100_phase27_workforce_marketplace.sql','utf8'));

 let opportunity;
 await ok('NGO creates survey-project-linked local opportunity with immutable recruitment criteria',async()=>{
  await as('ngo');
  opportunity=await call('create_project_opportunity',[project,'Kunri field surveyors','Collect assigned household survey records in the project area.',district,d.today,d.project_end,d.reply_by,'paid','PKR per verified survey; final rate is fixed in assignment terms.',2,'Data Collection','Sindhi']);
  const o=(await rows('select * from public.work_opportunities where id=$1',[opportunity]))[0];
  assert.equal(o.survey_project_id,project);assert.equal(o.required_volunteers,2);assert.equal(o.required_skill,'Data Collection');
  await deny(()=>db.query('update public.work_opportunities set required_volunteers=9 where id=$1',[opportunity]),/permission/);
 });

 await ok('only verified shared local volunteers discover matching open work',async()=>{
  await as('volA');let available=await call('available_work_opportunities',[0]);assert.equal(available.total,1);assert.equal(available.rows[0].id,opportunity);
  await as('outsider');available=await call('available_work_opportunities',[0]);assert.equal(available.total,0);
 });

 let application;
 await ok('volunteer applies and unrelated NGO cannot read the application',async()=>{
  await as('volA');application=await call('apply_work_opportunity',[opportunity,'Available for the full field period and familiar with the area.']);assert(application);
  await as('otherngo');assert.equal((await rows('select * from public.work_applications')).length,0);
 });

 await ok('NGO shortlists then selects application with optimistic version checks',async()=>{
  await as('ngo');let a=(await rows('select * from public.work_applications where id=$1',[application]))[0];
  await call('review_work_application',[application,'shortlisted','Strong local profile; keep for final selection.',a.version]);
  a=(await rows('select * from public.work_applications where id=$1',[application]))[0];
  await deny(()=>call('review_work_application',[application,'selected','Stale decision',1]),/changed/i);
  await call('review_work_application',[application,'selected','Selected for the survey assignment offer.',a.version]);
 });

 await ok('project candidate finder exposes objective experience signals without numeric ranking',async()=>{
  await as('ngo');const result=await call('project_workforce_candidates',[project,'Volunteer A',0]);assert.equal(result.total,1);
  const c=result.rows[0];assert.equal(c.user_id,ids.volA);assert.equal(c.source_kind,'application');assert.equal(c.source_id,application);assert(['local_verified','good_match','strong_match'].includes(c.match_label));assert.equal(c.approval_rate,null);
 });

 let assignmentA;
 await ok('NGO offers immutable paid assignment terms but survey access stays inactive until volunteer acceptance',async()=>{
  await as('ngo');assignmentA=await call('create_work_assignment',[project,ids.volA,'application',application,'paid','per_verified_survey','PKR',150,100,d.today,d.project_end,'PKR 150 per verified survey. Target 100 accepted records.']);
  let w=(await rows('select * from public.work_assignments where id=$1',[assignmentA]))[0];assert.equal(w.status,'offered');assert.equal(Number(w.rate),150);assert.equal(w.target_surveys,100);
  assert.equal((await rows('select * from public.survey_assignments where project_id=$1 and user_id=$2 and active=true',[project,ids.volA])).length,0);
  await deny(()=>db.query('update public.work_assignments set rate=999 where id=$1',[assignmentA]),/permission/);
 });

 await ok('volunteer formal acceptance activates survey assignment and terms remain snapshot history',async()=>{
  await as('volA');let w=(await rows('select * from public.work_assignments where id=$1',[assignmentA]))[0];await call('respond_work_assignment',[assignmentA,'accepted',w.version]);
  w=(await rows('select * from public.work_assignments where id=$1',[assignmentA]))[0];assert.equal(w.status,'active');
  assert.equal((await rows('select * from public.survey_assignments where project_id=$1 and user_id=$2 and active=true',[project,ids.volA])).length,1);
 });

 await ok('completion records structured supervisor feedback, deactivates survey access and becomes verified work history',async()=>{
  await as('ngo');let w=(await rows('select * from public.work_assignments where id=$1',[assignmentA]))[0];
  const feedback={professionalism:5,communication:4,field_discipline:5,data_quality:5,task_completion:4};
  await call('complete_work_assignment',[assignmentA,feedback,'Completed assigned field work with reliable data quality.',w.version]);
  w=(await rows('select * from public.work_assignments where id=$1',[assignmentA]))[0];assert.equal(w.status,'completed');assert.equal(w.completion_feedback.data_quality,5);
  assert.equal((await rows('select * from public.survey_assignments where project_id=$1 and user_id=$2 and active=true',[project,ids.volA])).length,0);
  await as('volA');assert.equal((await rows('select * from public.work_assignments where status=$1',['completed'])).length,1);
 });

 let invitation,assignmentB;
 await ok('accepted invitation is a valid second assignment source without duplicating volunteer accounts',async()=>{
  await as('ngo');await call('save_shortlist',[org,ids.volB,'selected','Selected local volunteer for direct invitation.',0]);
  invitation=await call('send_work_invitation',[opportunity,ids.volB]);
  await as('volB');let i=(await rows('select * from public.work_invitations where id=$1',[invitation]))[0];await call('respond_work_invitation',[invitation,'accepted',i.version]);
  await as('ngo');const c=await call('project_workforce_candidates',[project,'Volunteer B',0]);assert.equal(c.rows[0].source_kind,'invitation');
  assignmentB=await call('create_work_assignment',[project,ids.volB,'invitation',invitation,'volunteer','none','PKR',null,50,d.today,d.project_end,'Volunteer assignment for up to 50 verified survey records.']);
  await as('volB');let w=(await rows('select * from public.work_assignments where id=$1',[assignmentB]))[0];await call('respond_work_assignment',[assignmentB,'accepted',w.version]);
  assert.equal((await rows('select * from public.survey_assignments where project_id=$1 and user_id=$2 and active=true',[project,ids.volB])).length,1);
 });

 await ok('closing survey project fails closed for active workforce assignments',async()=>{
  await as('manager');await call('close_survey_project',[project]);
  await as('volB');const w=(await rows('select * from public.work_assignments where id=$1',[assignmentB]))[0];assert.equal(w.status,'cancelled');assert.equal(w.cancellation_note,'Survey project closed');
  assert.equal((await rows('select * from public.survey_assignments where project_id=$1 and user_id=$2 and active=true',[project,ids.volB])).length,0);
 });

 await as(null);await ok('anonymous users cannot access workforce marketplace operations',async()=>{
  await deny(()=>call('available_work_opportunities',[0]));await deny(()=>call('apply_work_opportunity',[opportunity,'No']));
 });
 console.log(`\n${passed} Phase 2.7 workforce marketplace tests passed.`);
}finally{await db.close()}
