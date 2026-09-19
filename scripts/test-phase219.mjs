import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {schemaDb} from './schema-test-db.mjs';

const previousHead='20261008000930_withdrawal_operations_manual_settlement.sql';
const db=await schemaDb(previousHead);
let passed=0;
const ids=Object.fromEntries(['super','ngo','pm','focal','collector','otherngo'].map((name,i)=>[name,`a1900000-0000-4000-8000-${String(i+1).padStart(12,'0')}`]));
const rows=async(q,p=[])=>(await db.query(q,p)).rows;
async function as(name){await db.exec('RESET ROLE');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[name?ids[name]:'']);await db.exec(`SET ROLE ${name?'authenticated':'anon'}`)}
async function call(name,args=[]){return (await rows(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args))[0].result}
async function ok(name,fn){await fn();passed+=1;console.log(`PASS ${name}`)}
const deny=(fn,re=/permission|required|case|request|need|active|review|closed|changed|submitted|approve|same beneficiary/i)=>assert.rejects(fn,re);
const cid=n=>`b1900000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const rid=n=>`c1900000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const nid=n=>`d1900000-0000-4000-8000-${String(n).padStart(12,'0')}`;

try{
  for(const [name,id] of Object.entries(ids))await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)',[id,`${name}@example.test`,JSON.stringify({full_name:name.toUpperCase()})]);
  await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.super]);
  await as('super');
  const org=await call('save_organization',[null,{name:'2.19 Case NGO',status:'active'}]);
  const otherOrg=await call('save_organization',[null,{name:'2.19 Other NGO',status:'active'}]);
  await call('set_membership',[org,ids.ngo,'ngo_admin','active']);
  await call('set_membership',[org,ids.pm,'member','active']);
  await call('set_membership',[org,ids.focal,'member','active']);
  await call('set_membership',[otherOrg,ids.otherngo,'ngo_admin','active']);
  const geo=await call('save_geography',[null,null,'province','2.19 Province','A190P','Case fixture',true]);
  const template=await call('publish_survey_template',['2.19 Case Template',[{id:'need',label:'Need',type:'text',required:true}]]);
  const dates=(await rows("select ((now() at time zone 'UTC')::date-1)::text start,((now() at time zone 'UTC')::date+30)::text finish,current_date::text today,((now() at time zone 'UTC')::date+7)::text followup"))[0];
  const project=await call('create_survey_project',[org,'2.19 Beneficiary Case Project',template,geo,50,dates.start,dates.finish,'Assess and coordinate beneficiary assistance','v1','Explain case coordination and obtain consent.']);

  await as('ngo');
  await call('assign_project_staff',[project,ids.pm,'project_manager',[],dates.start,dates.finish]);
  await call('assign_project_staff',[project,ids.focal,'area_focal_person',[geo],dates.start,dates.finish]);

  // Seed an approved project beneficiary directly as database fixture; 2.19 is not testing collection/recruitment.
  await db.exec('RESET ROLE');
  const household=(await rows('insert into public.registry_households(project_id,label,geography_id,created_by) values($1,$2,$3,$4) returning id',[project,'Case Household',geo,ids.collector]))[0].id;
  const person=(await rows('insert into public.registry_persons(project_id,household_id,full_name,birth_date,created_by) values($1,$2,$3,$4,$5) returning *',[project,household,'Amina Case','1992-02-02',ids.collector]))[0];
  const response=(await rows("insert into public.survey_responses(project_id,person_id,collector_id,answers,consent,status,review_note,reviewed_by,reviewed_at,collection_geography_id) values($1,$2,$3,$4::jsonb,$5::jsonb,'approved',$6,$7,now(),$8) returning *",[project,person.id,ids.collector,JSON.stringify({need:'food'}),JSON.stringify({agreed:true,method:'verbal'}),'Approved case source',ids.ngo,geo]))[0];

  await as('ngo');
  await call('create_beneficiary_need',[nid(1),response.id,'food','Household needs monthly food assistance','high',dates.followup,'Approved household assessment']);
  await call('record_assistance',[rid(99),person.id,'goods','education','Historic school support','Previously delivered school materials',null,1,'kit',dates.today,'Historic donor','Receipt PRE-219',null]);
  const previousNeed=(await rows('select * from public.beneficiary_needs where id=$1',[nid(1)]))[0];
  const previousAssistance=(await rows('select * from public.assistance_entries where id=$1',[rid(99)]))[0];

  await db.exec('RESET ROLE');
  await db.exec(readFileSync('supabase/migrations/20261009000100_beneficiary_cases_assistance_requests.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261009000110_beneficiary_case_request_stabilization.sql','utf8'));

  await ok('upgrade preserves needs and delivered assistance without inferring cases or requests',async()=>{
    assert.deepEqual((await rows('select * from public.beneficiary_needs where id=$1',[nid(1)]))[0],previousNeed);
    assert.deepEqual((await rows('select * from public.assistance_entries where id=$1',[rid(99)]))[0],previousAssistance);
    assert.equal((await rows('select count(*)::int c from public.beneficiary_cases'))[0].c,0);
    assert.equal((await rows('select count(*)::int c from public.assistance_requests'))[0].c,0);
  });

  await ok('project manager can open a case from approved evidence while area focal cannot manage cases',async()=>{
    await as('focal');
    await deny(()=>call('create_beneficiary_case',[cid(1),person.id,response.id,nid(1),'Food support case','Coordinate assessed household food support','high',dates.followup,'Open from approved household assessment']),/management permission/i);
    await as('pm');
    assert.equal(await call('create_beneficiary_case',[cid(1),person.id,response.id,nid(1),'Food support case','Coordinate assessed household food support','high',dates.followup,'Open from approved household assessment']),cid(1));
    const detail=await call('beneficiary_case_detail',[cid(1)]);
    assert.equal(detail.case.status,'open');
    assert.equal(detail.needs.length,1);
    assert.equal(detail.needs[0].id,nid(1));
    assert.equal(detail.can_approve_requests,false);
  });

  await ok('case creation is idempotent and stores immutable source/identity provenance',async()=>{
    await as('pm');
    assert.equal(await call('create_beneficiary_case',[cid(1),person.id,response.id,nid(1),'Food support case','Coordinate assessed household food support','high',dates.followup,'Open from approved household assessment']),cid(1));
    const row=(await rows('select * from public.beneficiary_cases where id=$1',[cid(1)]))[0];
    assert.equal(row.source_response_id,response.id);
    assert.equal(row.source_response_version,response.version);
    assert.equal(row.identity_snapshot.person.full_name,'Amina Case');
    assert.equal((await rows('select count(*)::int c from public.beneficiary_case_revisions where case_id=$1',[cid(1)]))[0].c,1);
    await deny(()=>call('create_beneficiary_case',[cid(1),person.id,response.id,nid(1),'Changed case title','Coordinate assessed household food support','high',dates.followup,'Different replay']),/different details/i);
  });

  await ok('one assessed need cannot be actively managed by two beneficiary cases',async()=>{
    await as('pm');
    await call('create_beneficiary_case',[cid(2),person.id,response.id,null,'Secondary coordination case','Separate coordination record for another assessed need','medium',null,'Create second case without linking a need']);
    const d=await call('beneficiary_case_detail',[cid(2)]);
    await deny(()=>call('set_beneficiary_case_need',[cid(2),nid(1),true,'Attempt duplicate active need ownership',d.case.version,0]),/another active beneficiary case/i);
  });

  await ok('project manager can create a draft request but request approval creates no delivered-assistance row',async()=>{
    await as('pm');
    assert.equal(await call('create_assistance_request',[rid(1),cid(1),nid(1),'cash','food','Emergency food cash','Provide one month food support',12000,null,null,'high',dates.followup]),rid(1));
    const d=await call('beneficiary_case_detail',[cid(1)]);
    const request=d.requests.find(r=>r.id===rid(1));
    assert.equal(request.status,'draft');
    assert.equal(Number(request.requested_amount_pkr),12000);
    assert.equal((await rows('select count(*)::int c from public.assistance_entries where person_id=$1',[person.id]))[0].c,1);
  });

  await ok('draft assistance request editing uses optimistic versions and immutable revision history',async()=>{
    await as('pm');
    let d=await call('beneficiary_case_detail',[cid(1)]);let r=d.requests.find(x=>x.id===rid(1));
    await call('update_assistance_request',[rid(1),'cash','food','Emergency food cash','Provide one month food support with transport',12500,null,null,'high',dates.followup,'Refine draft amount and purpose before submission',r.version]);
    d=await call('beneficiary_case_detail',[cid(1)]);r=d.requests.find(x=>x.id===rid(1));
    assert.equal(Number(r.requested_amount_pkr),12500);
    assert.equal(r.version,2);
    assert.equal((await rows('select count(*)::int c from public.assistance_request_revisions where request_id=$1',[rid(1)]))[0].c,2);
    await deny(()=>call('update_assistance_request',[rid(1),'cash','food','Emergency food cash','Stale update attempt',13000,null,null,'high',dates.followup,'Stale optimistic update should fail',1]),/changed/i);
  });

  await ok('request validation rejects malformed cash/goods shapes and non-linked needs',async()=>{
    await as('pm');
    await deny(()=>call('create_assistance_request',[rid(2),cid(1),nid(1),'cash','food','Food cash','Valid purpose',null,null,null,'high',null]),/Cash request/i);
    await deny(()=>call('create_assistance_request',[rid(3),cid(1),nid(1),'goods','food','Food basket','Valid purpose',1000,2,'basket','high',null]),/Goods\/service request/i);
    await call('create_beneficiary_need',[nid(2),response.id,'health','Health consultation and medicine support','medium',null,'Second assessed need for request validation']);
    await deny(()=>call('create_assistance_request',[rid(4),cid(1),nid(2),'service','health','Clinic support','Medical consultation',null,1,'consultation','medium',null]),/active assessed need link/i);
  });

  await ok('project manager submits but cannot approve; NGO Admin approval marks planning only and starts need progress',async()=>{
    await as('pm');
    let d=await call('beneficiary_case_detail',[cid(1)]);let r=d.requests.find(x=>x.id===rid(1));
    await call('submit_assistance_request',[rid(1),'Submit for NGO assistance approval',r.version]);
    d=await call('beneficiary_case_detail',[cid(1)]);r=d.requests.find(x=>x.id===rid(1));
    assert.equal(r.status,'submitted');
    await deny(()=>call('review_assistance_request',[rid(1),'approve','Manager self approval denied',r.version]),/NGO Admin or POEM survey approval/i);
    await as('ngo');
    await call('review_assistance_request',[rid(1),'approve','Approved for distribution planning after reviewed assessment',r.version]);
    const approved=(await rows('select * from public.assistance_requests where id=$1',[rid(1)]))[0];
    assert.equal(approved.status,'approved');
    assert.equal((await rows('select status from public.beneficiary_needs where id=$1',[nid(1)]))[0].status,'in_progress');
    assert.equal((await rows('select count(*)::int c from public.assistance_entries where person_id=$1',[person.id]))[0].c,1);
  });

  await ok('case queue/detail expose scoped operational counts and approval capability without canonical cross-NGO identity',async()=>{
    await as('ngo');
    const q=await call('beneficiary_case_queue',[org,project,null,null,100]);
    assert.equal(q.summary.total,2);
    assert.equal(q.summary.approved_requests,1);
    const d=await call('beneficiary_case_detail',[cid(1)]);
    assert.equal(d.can_approve_requests,true);
    assert.equal(d.person.full_name,'Amina Case');
    assert.equal('canonical_person_id' in d.case,false);
  });

  await ok('other NGO and area focal cannot read case tables or RPC queues',async()=>{
    await as('otherngo');
    assert.equal((await rows('select * from public.beneficiary_cases')).length,0);
    await deny(()=>call('beneficiary_case_queue',[org,null,null,null,100]),/permission|management/i);
    await as('focal');
    assert.equal((await rows('select * from public.beneficiary_cases')).length,0);
    await deny(()=>call('beneficiary_case_detail',[cid(1)]),/management permission/i);
  });

  await ok('active approved requests and pending needs block unlink/closure until human review resolves them',async()=>{
    await as('pm');
    let d=await call('beneficiary_case_detail',[cid(1)]);let need=d.needs.find(n=>n.id===nid(1));
    await deny(()=>call('set_beneficiary_case_need',[cid(1),nid(1),false,'Cannot unlink while approved request remains',d.case.version,need.link_version]),/Resolve active assistance requests/i);
    await deny(()=>call('update_beneficiary_case',[cid(1),d.case.title,d.case.summary,d.case.priority,'closed',d.case.follow_up_on,'Attempt closure with unresolved request',d.case.version]),/Resolve submitted or approved/i);
    await as('ngo');
    let r=(await call('beneficiary_case_detail',[cid(1)])).requests.find(x=>x.id===rid(1));
    await call('cancel_assistance_request',[rid(1),'Approved request cancelled before any distribution',r.version]);
    const needRow=(await rows('select * from public.beneficiary_needs where id=$1',[nid(1)]))[0];
    await call('update_beneficiary_need',[nid(1),needRow.description,needRow.priority,'closed',needRow.follow_up_on,'Close assessed need after request cancellation',needRow.version]);
    d=await call('beneficiary_case_detail',[cid(1)]);need=d.needs.find(n=>n.id===nid(1));
    await call('set_beneficiary_case_need',[cid(1),nid(1),false,'Need closed and request cancelled',d.case.version,need.link_version]);
    d=await call('beneficiary_case_detail',[cid(1)]);
    await call('update_beneficiary_case',[cid(1),d.case.title,d.case.summary,d.case.priority,'closed',d.case.follow_up_on,'Case closed after assessed need resolution',d.case.version]);
    assert.equal((await call('beneficiary_case_detail',[cid(1)])).case.status,'closed');
  });

  await ok('later registry correction does not rewrite case identity provenance',async()=>{
    await as('ngo');
    const personRow=(await rows('select * from public.registry_persons where id=$1',[person.id]))[0];
    await call('correct_registry_person',[person.id,'Amina Corrected','1992-02-02',household,'Correct interview spelling after case intake',personRow.version]);
    const c=(await rows('select identity_snapshot from public.beneficiary_cases where id=$1',[cid(1)]))[0];
    assert.equal(c.identity_snapshot.person.full_name,'Amina Case');
  });

  await ok('stabilization keeps request creation serialized and review UI requires an explicit approve/reject submitter',async()=>{
    const stabilization=readFileSync('supabase/migrations/20261009000110_beneficiary_case_request_stabilization.sql','utf8');
    const ui=readFileSync('src/features/cases/BeneficiaryCasesWorkspace.tsx','utf8');
    assert.match(stabilization,/select \* into c from public\.beneficiary_cases where id=p_case for update;/i);
    assert.match(ui,/nativeEvent as SubmitEvent/);
    assert.match(ui,/Choose Approve or Reject explicitly/);
    assert.match(ui,/personIntake\.needs\.filter\(n=>\['open','in_progress','needs_review'\]\.includes\(n\.status\)\)/);
  });

  await ok('direct writes and anonymous case/request access remain denied',async()=>{
    await as('pm');
    for(const table of ['beneficiary_cases','beneficiary_case_revisions','beneficiary_case_needs','beneficiary_case_need_revisions','assistance_requests','assistance_request_revisions'])await deny(()=>db.query(`delete from public.${table}`),/permission denied/i);
    await as(null);
    await deny(()=>db.query('select * from public.beneficiary_cases'),/permission denied/i);
    await deny(()=>call('beneficiary_case_queue',[null,null,null,null,100]));
    await deny(()=>call('create_beneficiary_case',[cid(3),person.id,response.id,null,'Anonymous case','Anonymous case creation should fail','low',null,'Anonymous denied']));
  });

  console.log(`\n${passed} POEM 2.19.0 beneficiary cases / assistance requests scenarios passed.`);
}finally{await db.close()}
