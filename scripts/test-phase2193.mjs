import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {schemaDb} from './schema-test-db.mjs';

const previousHead='20261009000300_assistance_ledger_duplicate_controls.sql';
const db=await schemaDb(previousHead);
let passed=0;
const ids=Object.fromEntries(['super','ngo','pm','focal','collector','otherngo'].map((name,i)=>[name,`a1930000-0000-4000-8000-${String(i+1).padStart(12,'0')}`]));
const rows=async(q,p=[])=>(await db.query(q,p)).rows;
async function as(name){await db.exec('RESET ROLE');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[name?ids[name]:'']);await db.exec(`SET ROLE ${name?'authenticated':'anon'}`)}
async function call(name,args=[]){return (await rows(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args))[0].result}
async function ok(name,fn){await fn();passed+=1;console.log(`PASS ${name}`)}
const deny=(fn,re=/permission|required|follow-up|closure|closed|recorded|changed|status|active|delivery|resolved|scheduled/i)=>assert.rejects(fn,re);
const cid=n=>`b1930000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const rid=n=>`c1930000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const nid=n=>`d1930000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const pid=n=>`e1930000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const aid=n=>`f1930000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const fid=n=>`91930000-0000-4000-8000-${String(n).padStart(12,'0')}`;

try{
  for(const [name,id] of Object.entries(ids))await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)',[id,`${name}@example.test`,JSON.stringify({full_name:name.toUpperCase()})]);
  await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.super]);
  await as('super');
  const org=await call('save_organization',[null,{name:'2.19.3 Outcome NGO',status:'active'}]);
  const otherOrg=await call('save_organization',[null,{name:'2.19.3 Other NGO',status:'active'}]);
  await call('set_membership',[org,ids.ngo,'ngo_admin','active']);
  await call('set_membership',[org,ids.pm,'member','active']);
  await call('set_membership',[org,ids.focal,'member','active']);
  await call('set_membership',[otherOrg,ids.otherngo,'ngo_admin','active']);
  const geo=await call('save_geography',[null,null,'province','2.19.3 Province','O193P','Outcome fixture',true]);
  const template=await call('publish_survey_template',['2.19.3 Outcome Template',[{id:'need',label:'Need',type:'text',required:true}]]);
  const dates=(await rows("select ((now() at time zone 'UTC')::date-1)::text start,((now() at time zone 'UTC')::date+60)::text finish,current_date::text today,(current_date+1)::text tomorrow,(current_date-1)::text yesterday,(current_date+7)::text next,(now()+interval '1 day')::text schedule_start,(now()+interval '1 day 2 hour')::text schedule_end"))[0];
  const project=await call('create_survey_project',[org,'2.19.3 Outcome Project',template,geo,100,dates.start,dates.finish,'Follow delivered support through outcome and closure','v1','Explain assistance follow-up and obtain consent.']);
  const otherProject=await call('create_survey_project',[otherOrg,'2.19.3 Other Project',template,geo,100,dates.start,dates.finish,'Other organization case','v1','Explain follow-up and obtain consent.']);

  await as('ngo');
  await call('assign_project_staff',[project,ids.pm,'project_manager',[],dates.start,dates.finish]);
  await call('assign_project_staff',[project,ids.focal,'area_focal_person',[geo],dates.start,dates.finish]);

  await db.exec('RESET ROLE');
  const household=(await rows('insert into public.registry_households(project_id,label,geography_id,created_by) values($1,$2,$3,$4) returning id',[project,'Outcome Household',geo,ids.collector]))[0].id;
  const person=(await rows('insert into public.registry_persons(project_id,household_id,full_name,birth_date,created_by) values($1,$2,$3,$4,$5) returning *',[project,household,'Sadia Outcome','1990-03-04',ids.collector]))[0];
  const response=(await rows("insert into public.survey_responses(project_id,person_id,collector_id,answers,consent,status,review_note,reviewed_by,reviewed_at,collection_geography_id) values($1,$2,$3,$4::jsonb,$5::jsonb,'approved',$6,$7,now(),$8) returning *",[project,person.id,ids.collector,JSON.stringify({need:'health'}),JSON.stringify({agreed:true,method:'verbal'}),'Approved outcome source',ids.ngo,geo]))[0];

  await as('ngo');
  await call('create_beneficiary_need',[nid(1),response.id,'health','Beneficiary requires one health consultation','high',dates.tomorrow,'Approved health need for follow-up']);
  await call('create_beneficiary_need',[nid(2),response.id,'food','Beneficiary may require later food support','medium',dates.next,'Secondary need for closure blocker testing']);

  await as('pm');
  await call('create_beneficiary_case',[cid(1),person.id,response.id,nid(1),'Health support outcome case','Coordinate health support and verify beneficiary outcome','high',dates.tomorrow,'Open case for controlled assistance outcome']);
  let detail=await call('beneficiary_case_detail',[cid(1)]);
  await call('create_assistance_request',[rid(1),cid(1),nid(1),'service','health','Health consultation','Provide one approved health consultation',null,1,'session','high',dates.tomorrow]);
  detail=await call('beneficiary_case_detail',[cid(1)]);let request=detail.requests.find(x=>x.id===rid(1));
  await call('submit_assistance_request',[rid(1),'Submit consultation for NGO review',request.version]);
  detail=await call('beneficiary_case_detail',[cid(1)]);request=detail.requests.find(x=>x.id===rid(1));
  await as('ngo');
  await call('review_assistance_request',[rid(1),'approve','Approved consultation for delivery planning',request.version]);
  await as('pm');
  await call('create_assistance_distribution_plan',[pid(1),rid(1),'service_referral','Community health desk','Health Team','Verify beneficiary and provide approved consultation','Prepare approved health support']);
  let plan=(await rows('select * from public.assistance_distribution_plans where id=$1',[pid(1)]))[0];
  await call('schedule_assistance_distribution_plan',[pid(1),dates.schedule_start,dates.schedule_end,'Schedule health consultation',plan.version]);
  plan=(await rows('select * from public.assistance_distribution_plans where id=$1',[pid(1)]))[0];
  await call('mark_assistance_distribution_plan_ready',[pid(1),'Health team and beneficiary confirmed',plan.version]);
  plan=(await rows('select * from public.assistance_distribution_plans where id=$1',[pid(1)]))[0];
  await call('record_assistance_distribution_delivery',[pid(1),aid(1),'Health consultation completed',dates.today,'Health donor','Receipt OUTCOME-1',null,null,plan.version]);

  const caseBefore=(await rows('select * from public.beneficiary_cases where id=$1',[cid(1)]))[0];
  const assistanceBefore=(await rows('select * from public.assistance_entries where id=$1',[aid(1)]))[0];
  await db.exec('RESET ROLE');
  await db.exec(readFileSync('supabase/migrations/20261009000400_case_followup_outcomes_closure.sql','utf8'));

  await ok('upgrade preserves delivered assistance and existing case without inferring follow-up or closure events',async()=>{
    assert.equal((await rows('select count(*)::int c from public.beneficiary_case_followups'))[0].c,0);
    assert.equal((await rows('select count(*)::int c from public.beneficiary_case_lifecycle_events'))[0].c,0);
    const after=(await rows('select * from public.assistance_entries where id=$1',[aid(1)]))[0];
    assert.equal(after.id,assistanceBefore.id);assert.equal(after.status,assistanceBefore.status);assert.equal(after.description,assistanceBefore.description);
    const c=(await rows('select * from public.beneficiary_cases where id=$1',[cid(1)]))[0];assert.equal(c.status,caseBefore.status);
  });

  await ok('project manager can schedule follow-up while area focal and another NGO remain outside authority',async()=>{
    await as('pm');
    assert.equal(await call('create_beneficiary_case_followup',[fid(1),cid(1),nid(1),aid(1),'phone',dates.today,'Confirm outcome after delivered health consultation']),fid(1));
    assert.equal(await call('create_beneficiary_case_followup',[fid(1),cid(1),nid(1),aid(1),'phone',dates.today,'Confirm outcome after delivered health consultation']),fid(1));
    await as('focal');await deny(()=>call('create_beneficiary_case_followup',[fid(9),cid(1),nid(1),aid(1),'phone',dates.tomorrow,'Area focal attempts broad case follow-up']),/permission/i);
    await as('otherngo');await deny(()=>call('beneficiary_case_followup_queue',[org,project,null,null,null,null,100]),/permission/i);
  });

  await ok('follow-up references must remain inside the case need and recorded-delivery lineage',async()=>{
    await as('pm');
    await deny(()=>call('create_beneficiary_case_followup',[fid(8),cid(1),nid(2),aid(1),'field_visit',dates.tomorrow,'Try unrelated need before it is linked']),/actively linked/i);
    await deny(()=>call('create_beneficiary_case_followup',[fid(7),cid(1),nid(1),aid(99),'phone',dates.tomorrow,'Try unknown delivery reference']),/recorded delivery/i);
  });

  await ok('follow-up queue is scoped and reports overdue, due-today, upcoming and completed work',async()=>{
    await as('pm');
    let d=await call('beneficiary_case_detail',[cid(1)]);
    await call('create_beneficiary_case_followup',[fid(2),cid(1),nid(1),aid(1),'field_visit',dates.tomorrow,'Schedule a second follow-up for queue coverage']);
    const queue=await call('beneficiary_case_followup_queue',[org,project,'scheduled',null,null,null,100]);
    assert.equal(queue.summary.scheduled,2);assert.equal(queue.summary.due_today,1);assert.equal(queue.summary.upcoming,1);assert.ok(queue.rows.every(x=>x.project_id===project));
    d=await call('beneficiary_case_detail',[cid(1)]);assert.equal(d.followups.length,2);
  });

  await ok('follow-up completion uses optimistic versioning and immutable revision history',async()=>{
    await as('pm');
    let d=await call('beneficiary_case_detail',[cid(1)]),f=d.followups.find(x=>x.id===fid(1));
    await call('complete_beneficiary_case_followup',[fid(1),'resolved','Beneficiary reports consultation completed and symptoms improved','Beneficiary confirms the consultation was helpful','No additional health action currently required',null,'met','Outcome verified with beneficiary after delivery',f.version]);
    await deny(()=>call('complete_beneficiary_case_followup',[fid(1),'resolved','Repeat completion attempt','No change','No action',null,'met','Repeat completion attempt should fail',f.version]),/scheduled|changed/i);
    await db.exec('RESET ROLE');
    const revisions=await rows('select version,snapshot from public.beneficiary_case_followup_revisions where followup_id=$1 order by version',[fid(1)]);
    assert.equal(revisions.length,2);assert.equal(revisions[0].version,1);assert.equal(revisions[1].version,2);
  });

  await ok('human-recorded resolved outcome can move the linked assessed need to met without rewriting delivered assistance',async()=>{
    await db.exec('RESET ROLE');
    const need=(await rows('select * from public.beneficiary_needs where id=$1',[nid(1)]))[0];assert.equal(need.status,'met');
    const assistance=(await rows('select * from public.assistance_entries where id=$1',[aid(1)]))[0];assert.equal(assistance.status,'recorded');assert.equal(assistance.description,'Health consultation completed');
  });

  await ok('inconsistent outcome and need-status combinations are rejected',async()=>{
    await as('pm');
    let d=await call('beneficiary_case_detail',[cid(1)]),f=d.followups.find(x=>x.id===fid(2));
    await deny(()=>call('complete_beneficiary_case_followup',[fid(2),'unresolved','Beneficiary says issue remains unresolved','Needs more support','Escalate for reassessment',dates.next,'met','Do not allow unresolved outcome to mark need met',f.version]),/Unresolved outcome/i);
  });

  await ok('a requested next follow-up becomes a real scheduled child item and can be resolved independently',async()=>{
    await as('pm');
    await call('create_beneficiary_case_followup',[fid(3),cid(1),null,aid(1),'phone',dates.today,'General outcome check that schedules another contact']);
    let d=await call('beneficiary_case_detail',[cid(1)]),f=d.followups.find(x=>x.id===fid(3));
    await call('complete_beneficiary_case_followup',[fid(3),'resolved','General post-delivery check confirms the beneficiary is stable','Beneficiary reports no immediate concern','Contact again next week for final confirmation',dates.next,null,'Schedule one final confirmation contact',f.version]);
    await db.exec('RESET ROLE');
    const child=(await rows('select * from public.beneficiary_case_followups where parent_followup_id=$1',[fid(3)]))[0];assert.ok(child);assert.equal(child.status,'scheduled');assert.equal(new Date(child.due_on).toISOString().slice(0,10),dates.next);
    await as('pm');
    await call('cancel_beneficiary_case_followup',[child.id,'Final confirmation no longer required after reviewed outcome',child.version]);
  });

  await ok('scheduled follow-up blocks closure even after the approved request has a recorded delivery',async()=>{
    await as('pm');
    const d=await call('beneficiary_case_detail',[cid(1)]);
    assert.equal(d.closure_eligibility.approved_without_delivery,0);
    assert.equal(d.closure_eligibility.deliveries_without_completed_followup,0);
    assert.equal(d.closure_eligibility.scheduled_followups,1);
    assert.equal(d.closure_eligibility.can_close,false);
    await deny(()=>call('close_beneficiary_case',[cid(1),'needs_resolved','Health assistance delivered and outcome confirmed','Attempt closure before remaining follow-up is resolved',d.case.version]),/closure blocked/i);
  });

  await ok('cancelled future follow-up no longer blocks closure',async()=>{
    await as('pm');
    let d=await call('beneficiary_case_detail',[cid(1)]),f=d.followups.find(x=>x.id===fid(2));
    await call('cancel_beneficiary_case_followup',[fid(2),'Second visit is no longer required after verified resolution',f.version]);
    d=await call('beneficiary_case_detail',[cid(1)]);assert.equal(d.closure_eligibility.scheduled_followups,0);assert.equal(d.closure_eligibility.pending_needs,0);assert.equal(d.closure_eligibility.can_close,true);
  });

  await ok('structured closure succeeds when delivery, outcome, needs and follow-up work are resolved',async()=>{
    await as('pm');
    let d=await call('beneficiary_case_detail',[cid(1)]);
    await call('close_beneficiary_case',[cid(1),'needs_resolved','Health consultation delivered and beneficiary outcome verified','Close case after documented resolution',d.case.version]);
    d=await call('beneficiary_case_detail',[cid(1)]);
    assert.equal(d.case.status,'closed');assert.equal(d.case.closure_category,'needs_resolved');assert.match(d.case.closure_summary,/outcome verified/i);assert.equal(d.lifecycle_history[0].event_type,'closed');
  });

  await ok('closed case blocks new follow-up and planned-delivery correction until explicit reopening, with lifecycle history preserved',async()=>{
    await as('pm');
    let d=await call('beneficiary_case_detail',[cid(1)]);
    await deny(()=>call('create_beneficiary_case_followup',[fid(4),cid(1),nid(1),aid(1),'phone',dates.next,'Try follow-up while case is closed']),/Reopen/i);
    const closedEntry=(await rows('select * from public.assistance_entries where id=$1',[aid(1)]))[0];
    await deny(()=>call('void_assistance',[aid(1),'Attempt planned-delivery correction before reopening its closed beneficiary case',closedEntry.version]),/Reopen the beneficiary case/i);
    await call('reopen_beneficiary_case',[cid(1),'New information requires another beneficiary review',d.case.version]);
    d=await call('beneficiary_case_detail',[cid(1)]);assert.equal(d.case.status,'open');assert.equal(d.lifecycle_history[0].event_type,'reopened');assert.equal(d.lifecycle_history[1].event_type,'closed');assert.equal(d.lifecycle_history[1].closure_category,'needs_resolved');
  });

  await ok('draft, submitted and undelivered approved requests remain closure blockers',async()=>{
    await as('pm');
    let d=await call('beneficiary_case_detail',[cid(1)]);
    await call('set_beneficiary_case_need',[cid(1),nid(2),true,'Add secondary food need for blocker lifecycle',d.case.version,0]);
    await call('create_assistance_request',[rid(2),cid(1),nid(2),'goods','food','Food basket','Provide one food basket after new assessment',null,1,'basket','medium',dates.next]);
    d=await call('beneficiary_case_detail',[cid(1)]);assert.equal(d.closure_eligibility.draft_requests,1);assert.equal(d.closure_eligibility.can_close,false);
    let r=d.requests.find(x=>x.id===rid(2));await call('submit_assistance_request',[rid(2),'Submit secondary food request for review',r.version]);
    d=await call('beneficiary_case_detail',[cid(1)]);assert.equal(d.closure_eligibility.submitted_requests,1);
    r=d.requests.find(x=>x.id===rid(2));await as('ngo');await call('review_assistance_request',[rid(2),'approve','Approve secondary food request for planning',r.version]);
    await as('pm');d=await call('beneficiary_case_detail',[cid(1)]);assert.equal(d.closure_eligibility.approved_without_delivery,1);assert.equal(d.closure_eligibility.can_close,false);
  });

  await ok('voided assistance still uses existing need-review behavior and does not get hidden by follow-up history',async()=>{
    await as('pm');
    const entry=(await rows('select * from public.assistance_entries where id=$1',[aid(1)]))[0];
    await call('void_assistance',[aid(1),'Health delivery evidence later found invalid and must be corrected',entry.version]);
    await db.exec('RESET ROLE');
    const need=(await rows('select status from public.beneficiary_needs where id=$1',[nid(1)]))[0];assert.equal(need.status,'needs_review');
    await as('pm');const d=await call('beneficiary_case_detail',[cid(1)]);assert.ok(d.closure_eligibility.pending_needs>=1);assert.equal(d.closure_eligibility.can_close,false);
  });

  await ok('follow-up and lifecycle tables remain RPC-only while anonymous lifecycle operations are denied',async()=>{
    await as('pm');
    await deny(()=>db.query('select * from public.beneficiary_case_followups'),/permission denied/i);
    await deny(()=>db.query('select * from public.beneficiary_case_lifecycle_events'),/permission denied/i);
    await as(null);
    await deny(()=>call('beneficiary_case_followup_queue',[null,null,null,null,null,null,100]));
    await deny(()=>call('reopen_beneficiary_case',[cid(1),'Anonymous reopen attempt',1]));
  });

  await ok('2.19.3 remains separate from worker payables, finance, wallets and assistance-ledger ownership',async()=>{
    const migration=readFileSync('supabase/migrations/20261009000400_case_followup_outcomes_closure.sql','utf8');
    assert.doesNotMatch(migration,/public\.(work_payable_(units|events|receipts)|finance_(accounts|journals|postings)|payment_wallets|withdrawal_requests)/i);
    assert.doesNotMatch(migration,/insert into public\.assistance_entries/i);
    assert.match(migration,/create or replace function public\.void_assistance/i);
    assert.match(migration,/Reopen the beneficiary case before voiding its recorded planned assistance/i);
    assert.match(migration,/deliveries_without_completed_followup/i);
    assert.match(migration,/beneficiary_case_lifecycle_events/i);
  });

  await ok('frontend exposes follow-up queue, structured outcomes and controlled close/reopen without claiming automatic impact',async()=>{
    const cases=readFileSync('src/features/cases/BeneficiaryCasesWorkspace.tsx','utf8');
    assert.match(cases,/Follow-up & outcome queue/);assert.match(cases,/complete_beneficiary_case_followup/);assert.match(cases,/close_beneficiary_case/);assert.match(cases,/reopen_beneficiary_case/);
    assert.match(cases,/Closure is evidence-based/i);assert.match(cases,/Delivered assistance remains in/);
  });

  console.log(`\n${passed} POEM 2.19.3 follow-up / outcomes / case-closure scenarios passed.`);
}finally{await db.close()}
