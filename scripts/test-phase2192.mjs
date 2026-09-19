import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {schemaDb} from './schema-test-db.mjs';

const previousHead='20261009000200_assistance_distribution_planning.sql';
const db=await schemaDb(previousHead);
let passed=0;
const ids=Object.fromEntries(['super','ngo','pm','focal','collector','otherngo'].map((name,i)=>[name,`a1920000-0000-4000-8000-${String(i+1).padStart(12,'0')}`]));
const rows=async(q,p=[])=>(await db.query(q,p)).rows;
async function as(name){await db.exec('RESET ROLE');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[name?ids[name]:'']);await db.exec(`SET ROLE ${name?'authenticated':'anon'}`)}
async function call(name,args=[]){return (await rows(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args))[0].result}
async function ok(name,fn){await fn();passed+=1;console.log(`PASS ${name}`)}
const deny=(fn,re=/permission|required|duplicate|ready|recorded|protected|changed|cancel|status|active/i)=>assert.rejects(fn,re);
const cid=n=>`b1920000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const rid=n=>`c1920000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const nid=n=>`d1920000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const pid=n=>`e1920000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const aid=n=>`f1920000-0000-4000-8000-${String(n).padStart(12,'0')}`;

try{
  for(const [name,id] of Object.entries(ids))await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)',[id,`${name}@example.test`,JSON.stringify({full_name:name.toUpperCase()})]);
  await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.super]);
  await as('super');
  const org=await call('save_organization',[null,{name:'2.19.2 Assistance NGO',status:'active'}]);
  const otherOrg=await call('save_organization',[null,{name:'2.19.2 Other NGO',status:'active'}]);
  await call('set_membership',[org,ids.ngo,'ngo_admin','active']);
  await call('set_membership',[org,ids.pm,'member','active']);
  await call('set_membership',[org,ids.focal,'member','active']);
  await call('set_membership',[otherOrg,ids.otherngo,'ngo_admin','active']);
  const geo=await call('save_geography',[null,null,'province','2.19.2 Province','A192P','Assistance fixture',true]);
  const template=await call('publish_survey_template',['2.19.2 Assistance Template',[{id:'need',label:'Need',type:'text',required:true}]]);
  const dates=(await rows("select ((now() at time zone 'UTC')::date-1)::text start,((now() at time zone 'UTC')::date+60)::text finish,current_date::text today,((now() at time zone 'UTC')::date+30)::text next,((now() at time zone 'UTC')::date+7)::text desired,(now()+interval '2 day')::text schedule_start,(now()+interval '2 day 2 hour')::text schedule_end"))[0];
  const project=await call('create_survey_project',[org,'2.19.2 Assistance Project',template,geo,100,dates.start,dates.finish,'Execute approved beneficiary assistance','v1','Explain assistance coordination and obtain consent.']);
  const otherProject=await call('create_survey_project',[otherOrg,'2.19.2 Other Project',template,geo,100,dates.start,dates.finish,'Other organization support history','v1','Explain assistance coordination and obtain consent.']);

  await as('ngo');
  await call('assign_project_staff',[project,ids.pm,'project_manager',[],dates.start,dates.finish]);
  await call('assign_project_staff',[project,ids.focal,'area_focal_person',[geo],dates.start,dates.finish]);

  await db.exec('RESET ROLE');
  const household=(await rows('insert into public.registry_households(project_id,label,geography_id,created_by) values($1,$2,$3,$4) returning id',[project,'Assistance Household',geo,ids.collector]))[0].id;
  const person=(await rows('insert into public.registry_persons(project_id,household_id,full_name,birth_date,created_by) values($1,$2,$3,$4,$5) returning *',[project,household,'Saira Assistance','1988-08-08',ids.collector]))[0];
  const response=(await rows("insert into public.survey_responses(project_id,person_id,collector_id,answers,consent,status,review_note,reviewed_by,reviewed_at,collection_geography_id) values($1,$2,$3,$4::jsonb,$5::jsonb,'approved',$6,$7,now(),$8) returning *",[project,person.id,ids.collector,JSON.stringify({need:'multiple'}),JSON.stringify({agreed:true,method:'verbal'}),'Approved assistance source',ids.ngo,geo]))[0];

  const otherHousehold=(await rows('insert into public.registry_households(project_id,label,geography_id,created_by) values($1,$2,$3,$4) returning id',[otherProject,'Other Assistance Household',geo,ids.collector]))[0].id;
  const otherPerson=(await rows('insert into public.registry_persons(project_id,household_id,full_name,birth_date,created_by) values($1,$2,$3,$4,$5) returning *',[otherProject,otherHousehold,'Saira Assistance','1988-08-08',ids.collector]))[0];
  await rows("insert into public.survey_responses(project_id,person_id,collector_id,answers,consent,status,review_note,reviewed_by,reviewed_at,collection_geography_id) values($1,$2,$3,$4::jsonb,$5::jsonb,'approved',$6,$7,now(),$8)",[otherProject,otherPerson.id,ids.collector,JSON.stringify({need:'education'}),JSON.stringify({agreed:true,method:'verbal'}),'Approved other source',ids.otherngo,geo]);

  await as('ngo');
  await call('create_beneficiary_need',[nid(1),response.id,'food','Household requires monthly food basket','high',dates.desired,'Approved food assessment']);
  await call('create_beneficiary_need',[nid(2),response.id,'health','Household requires health consultation','medium',dates.desired,'Approved health assessment']);
  await call('create_beneficiary_need',[nid(3),response.id,'education','Child requires school support','medium',dates.desired,'Approved education assessment']);
  await call('record_assistance',[aid(90),person.id,'goods','food','Previous food support','Previous monthly food basket',null,1,'basket',dates.today,'Historic NGO fund','Receipt FOOD-OLD',dates.next]);
  await as('otherngo');
  await call('record_assistance',[aid(91),otherPerson.id,'goods','education','Other NGO school support','School kit already delivered',null,1,'kit',dates.today,'Other NGO fund','Receipt EDU-OTHER',dates.next]);

  // Test fixture: these two project records represent the same canonical beneficiary.
  await db.exec('RESET ROLE');
  const canonical=(await rows('select canonical_person_id from public.canonical_person_links where project_person_id=$1',[person.id]))[0].canonical_person_id;
  await db.query('update public.canonical_person_links set canonical_person_id=$1 where project_person_id=$2',[canonical,otherPerson.id]);

  await as('pm');
  await call('create_beneficiary_case',[cid(1),person.id,response.id,nid(1),'Household assistance case','Coordinate approved food, health and education support','high',dates.desired,'Open multi-need assistance case']);
  let detail=await call('beneficiary_case_detail',[cid(1)]);
  await call('set_beneficiary_case_need',[cid(1),nid(2),true,'Add approved health need to this case',detail.case.version,0]);
  detail=await call('beneficiary_case_detail',[cid(1)]);
  await call('set_beneficiary_case_need',[cid(1),nid(3),true,'Add approved education need to this case',detail.case.version,0]);

  async function approvedRequest(id,need,kind,category,program,purpose,amount,quantity,unit){
    await as('pm');
    await call('create_assistance_request',[id,cid(1),need,kind,category,program,purpose,amount,quantity,unit,'high',dates.desired]);
    let d=await call('beneficiary_case_detail',[cid(1)]),r=d.requests.find(x=>x.id===id);
    await call('submit_assistance_request',[id,'Submit approved assistance need for NGO review',r.version]);
    d=await call('beneficiary_case_detail',[cid(1)]);r=d.requests.find(x=>x.id===id);
    await as('ngo');
    await call('review_assistance_request',[id,'approve','Approved for controlled distribution and delivery',r.version]);
  }
  await approvedRequest(rid(1),nid(1),'goods','food','Monthly food basket','Deliver one approved monthly food basket',null,1,'basket');
  await approvedRequest(rid(2),nid(2),'service','health','Health consultation','Provide one approved health consultation',null,1,'session');
  await approvedRequest(rid(3),nid(3),'goods','education','School support kit','Deliver one approved school support kit',null,1,'kit');

  async function readyPlan(plan,request,mode,location){
    await as('pm');
    await call('create_assistance_distribution_plan',[plan,request,mode,location,'Field Team A','Verify beneficiary and approved request before handover','Prepare approved request for delivery']);
    let p=(await rows('select * from public.assistance_distribution_plans where id=$1',[plan]))[0];
    await call('schedule_assistance_distribution_plan',[plan,dates.schedule_start,dates.schedule_end,'Schedule approved assistance delivery',p.version]);
    p=(await rows('select * from public.assistance_distribution_plans where id=$1',[plan]))[0];
    await call('mark_assistance_distribution_plan_ready',[plan,'Team, venue and assistance package confirmed',p.version]);
  }
  await readyPlan(pid(1),rid(1),'distribution_site','UC food point');
  await readyPlan(pid(2),rid(2),'service_referral','Health desk');
  await readyPlan(pid(3),rid(3),'distribution_site','School support desk');

  const oldFood=(await rows('select * from public.assistance_entries where id=$1',[aid(90)]))[0];
  const plansBefore=await rows('select * from public.assistance_distribution_plans order by id');
  await db.exec('RESET ROLE');
  await db.exec(readFileSync('supabase/migrations/20261009000300_assistance_ledger_duplicate_controls.sql','utf8'));

  await ok('upgrade preserves existing ledger and ready plans without inferring delivery links',async()=>{
    assert.deepEqual((await rows('select * from public.assistance_entries where id=$1',[aid(90)]))[0],oldFood);
    assert.deepEqual(await rows('select * from public.assistance_distribution_plans order by id'),plansBefore);
    assert.equal((await rows('select count(*)::int c from public.assistance_distribution_deliveries'))[0].c,0);
  });

  await ok('duplicate preview is ready-plan-only and health plan has no blockers',async()=>{
    await as('pm');
    const preview=await call('assistance_duplicate_support_preview',[pid(2),dates.today]);
    assert.equal(preview.blocking_count,0);
    assert.equal(preview.protected_blocking_count,0);
    assert.equal(preview.can_override,false);
    const draft=crypto.randomUUID();
    await call('create_assistance_request',[rid(4),cid(1),nid(2),'service','health','Follow-up consultation','Future follow-up consultation',null,1,'session','medium',dates.desired]);
    await as('ngo');
    let d=await call('beneficiary_case_detail',[cid(1)]),r=d.requests.find(x=>x.id===rid(4));
    await call('submit_assistance_request',[rid(4),'Submit follow-up consultation request',r.version]);
    d=await call('beneficiary_case_detail',[cid(1)]);r=d.requests.find(x=>x.id===rid(4));
    await call('review_assistance_request',[rid(4),'approve','Approve follow-up planning',r.version]);
    await as('pm');
    await call('create_assistance_distribution_plan',[draft,rid(4),'service_referral','Clinic','Field Team B','Arrange follow-up appointment','Create draft follow-up plan']);
    await deny(()=>call('assistance_duplicate_support_preview',[draft,dates.today]),/must be ready/i);
  });

  await ok('ready planned support cannot bypass plan linkage through legacy record_assistance',async()=>{
    await as('pm');
    await deny(()=>call('record_assistance',[aid(1),person.id,'service','health','Bypass attempt','Unplanned health delivery',null,1,'session',dates.today,'Test fund','Receipt BYPASS',null]),/ready distribution plan/i);
  });

  await ok('project manager records a no-conflict ready delivery into authoritative assistance_entries',async()=>{
    await as('pm');
    let plan=(await rows('select * from public.assistance_distribution_plans where id=$1',[pid(2)]))[0];
    assert.equal(await call('record_assistance_distribution_delivery',[pid(2),aid(2),'Health consultation completed',dates.today,'Health donor','Receipt HEALTH-1',null,null,plan.version]),aid(2));
    const entry=(await rows('select * from public.assistance_entries where id=$1',[aid(2)]))[0];
    assert.equal(entry.kind,'service');assert.equal(entry.category,'health');assert.equal(entry.quantity,'1.000');assert.equal(entry.unit,'session');
    await db.exec('RESET ROLE');
    const link=(await rows('select * from public.assistance_distribution_deliveries where assistance_id=$1',[aid(2)]))[0];
    assert.equal(link.plan_id,pid(2));assert.equal(link.request_id,rid(2));assert.equal(link.status,'recorded');assert.equal(link.duplicate_override_reason,null);
    assert.equal((await rows('select active from public.need_assistance_links where need_id=$1 and assistance_id=$2',[nid(2),aid(2)]))[0].active,true);
  });

  await ok('delivery recording is retry-safe and one request cannot have two active deliveries',async()=>{
    await as('pm');
    const plan=(await rows('select * from public.assistance_distribution_plans where id=$1',[pid(2)]))[0];
    assert.equal(await call('record_assistance_distribution_delivery',[pid(2),aid(2),'Health consultation completed',dates.today,'Health donor','Receipt HEALTH-1',null,null,plan.version-1]),aid(2));
    await deny(()=>call('record_assistance_distribution_delivery',[pid(2),aid(3),'Second health delivery',dates.today,'Health donor','Receipt HEALTH-2',null,null,plan.version]),/already has a recorded/i);
  });

  await ok('recorded planned delivery blocks plan cancellation until the ledger entry is voided',async()=>{
    await as('pm');
    const plan=(await rows('select * from public.assistance_distribution_plans where id=$1',[pid(2)]))[0];
    await deny(()=>call('cancel_assistance_distribution_plan',[pid(2),'Attempt to cancel delivered plan',plan.version]),/Void the recorded assistance entry/i);
  });

  await ok('same-project eligibility conflict is visible; PM cannot override but NGO Admin can',async()=>{
    await as('pm');
    const preview=await call('assistance_duplicate_support_preview',[pid(1),dates.today]);
    assert.equal(preview.blocking_count,1);assert.equal(preview.visible_blocking_count,1);assert.equal(preview.protected_blocking_count,0);assert.equal(preview.can_override,false);
    let plan=(await rows('select * from public.assistance_distribution_plans where id=$1',[pid(1)]))[0];
    await deny(()=>call('record_assistance_distribution_delivery',[pid(1),aid(4),'Food basket delivered under approved plan',dates.today,'Food donor','Receipt FOOD-NEW',dates.next,'Operational exception approved for urgent household need',plan.version]),/NGO Admin or POEM/i);
    await as('ngo');
    const ngoPreview=await call('assistance_duplicate_support_preview',[pid(1),dates.today]);assert.equal(ngoPreview.can_override,true);
    plan=(await rows('select * from public.assistance_distribution_plans where id=$1',[pid(1)]))[0];
    await call('record_assistance_distribution_delivery',[pid(1),aid(4),'Food basket delivered under approved plan',dates.today,'Food donor','Receipt FOOD-NEW',dates.next,'Urgent household need justified a controlled duplicate-support override',plan.version]);
    await db.exec('RESET ROLE');
    assert.ok((await rows('select duplicate_override_reason from public.assistance_distribution_deliveries where assistance_id=$1',[aid(4)]))[0].duplicate_override_reason);
  });

  await ok('protected cross-NGO duplicate signal hides details and requires POEM override',async()=>{
    await as('pm');
    let preview=await call('assistance_duplicate_support_preview',[pid(3),dates.today]);
    assert.equal(preview.blocking_count,1);assert.equal(preview.visible_blocking_count,0);assert.equal(preview.protected_blocking_count,1);assert.equal(preview.visible_matches.length,0);assert.equal(preview.poem_review_required,true);assert.equal(preview.can_override,false);
    await as('ngo');
    preview=await call('assistance_duplicate_support_preview',[pid(3),dates.today]);assert.equal(preview.protected_blocking_count,1);assert.equal(preview.visible_matches.length,0);assert.equal(preview.can_override,false);
    let plan=(await rows('select * from public.assistance_distribution_plans where id=$1',[pid(3)]))[0];
    await deny(()=>call('record_assistance_distribution_delivery',[pid(3),aid(5),'School support kit delivered',dates.today,'Education donor','Receipt EDU-NEW',dates.next,'NGO attempts protected duplicate override',plan.version]),/POEM duplicate-support review required/i);
    await as('super');
    preview=await call('assistance_duplicate_support_preview',[pid(3),dates.today]);assert.equal(preview.visible_blocking_count,1);assert.equal(preview.protected_blocking_count,0);assert.equal(preview.can_override,true);
    plan=(await rows('select * from public.assistance_distribution_plans where id=$1',[pid(3)]))[0];
    await call('record_assistance_distribution_delivery',[pid(3),aid(5),'School support kit delivered',dates.today,'Education donor','Receipt EDU-NEW',dates.next,'POEM reviewed cross-NGO support history and authorized this documented exception',plan.version]);
  });

  await ok('ledger is scope-filtered and distinguishes planned from historical assistance',async()=>{
    await as('pm');
    let ledger=await call('assistance_ledger',[org,project,null,null,null,null,100]);
    assert.ok(ledger.summary.planned>=3);assert.ok(ledger.summary.unplanned>=1);assert.ok(ledger.rows.some(x=>x.id===aid(2)&&x.planned_delivery));assert.ok(ledger.rows.some(x=>x.id===aid(90)&&!x.planned_delivery));
    const food=await call('assistance_ledger',[org,project,'recorded','food',dates.today,dates.today,100]);assert.ok(food.rows.every(x=>x.category==='food'&&x.status==='recorded'));
    await as('focal');await deny(()=>call('assistance_ledger',[org,project,null,null,null,null,100]),/permission/i);
    await as('otherngo');await deny(()=>call('assistance_ledger',[org,project,null,null,null,null,100]),/permission/i);
    ledger=await call('assistance_ledger',[otherOrg,otherProject,null,null,null,null,100]);assert.ok(ledger.rows.some(x=>x.id===aid(91)));
  });

  await ok('voiding a planned delivery preserves history and allows one corrected replacement',async()=>{
    await as('pm');
    const entry=(await rows('select * from public.assistance_entries where id=$1',[aid(2)]))[0];
    await call('void_assistance',[aid(2),'Original health delivery evidence was incorrect',entry.version]);
    await db.exec('RESET ROLE');
    const oldLink=(await rows('select * from public.assistance_distribution_deliveries where assistance_id=$1',[aid(2)]))[0];assert.equal(oldLink.status,'void');assert.ok(oldLink.voided_at);

    await as('pm');
    let plan=(await rows('select * from public.assistance_distribution_plans where id=$1',[pid(2)]))[0];
    assert.equal(await call('record_assistance_distribution_delivery',[pid(2),aid(6),'Corrected health consultation delivery',dates.today,'Health donor','Receipt HEALTH-CORRECTED',null,null,plan.version]),aid(6));

    await db.exec('RESET ROLE');
    assert.equal((await rows("select count(*)::int c from public.assistance_distribution_deliveries where plan_id=$1 and status='recorded'",[pid(2)]))[0].c,1);
    assert.equal((await rows('select count(*)::int c from public.assistance_distribution_deliveries where plan_id=$1',[pid(2)]))[0].c,2);
  });

  await ok('legacy unplanned assistance cannot bypass canonical duplicate or eligibility controls',async()=>{
    await as('pm');
    const first=aid(7);await call('record_assistance',[first,person.id,'cash','livelihood','Emergency travel','Emergency transport support',500,null,null,dates.today,'Emergency fund','Receipt LEGACY-EXACT',dates.next]);
    await deny(()=>call('record_assistance',[aid(8),person.id,'cash','livelihood','Emergency travel','Duplicate emergency transport support',500,null,null,dates.today,'Emergency fund','Receipt LEGACY-EXACT',dates.next]),/Potential duplicate assistance detected/i);
    await deny(()=>call('record_assistance',[aid(9),person.id,'cash','livelihood','Emergency travel','Different support still inside eligibility window',600,null,null,dates.today,'Emergency fund','Receipt LEGACY-ELIGIBILITY',null]),/Potential duplicate assistance detected/i);
  });

  await ok('case detail exposes delivery status without exposing protected duplicate snapshots',async()=>{
    await as('pm');
    const detail=await call('beneficiary_case_detail',[cid(1)]);
    assert.ok(detail.deliveries.some(x=>x.assistance_id===aid(4)&&x.status==='recorded'));
    assert.ok(detail.deliveries.some(x=>x.assistance_id===aid(2)&&x.status==='void'));
    assert.doesNotMatch(JSON.stringify(detail),/duplicate_snapshot|all_matches/);
  });

  await ok('delivery-link table remains RPC-only and anonymous assistance controls are denied',async()=>{
    await as('pm');
    await deny(()=>db.query('select * from public.assistance_distribution_deliveries'),/permission denied/i);
    await deny(()=>db.query('delete from public.assistance_distribution_deliveries'),/permission denied/i);
    await as(null);
    await deny(()=>call('assistance_ledger',[null,null,null,null,null,null,100]));
    await deny(()=>call('assistance_duplicate_support_preview',[pid(1),dates.today]));
  });

  await ok('2.19.2 remains separate from worker payables, finance, wallets and withdrawals',async()=>{
    const migration=readFileSync('supabase/migrations/20261009000300_assistance_ledger_duplicate_controls.sql','utf8');
    assert.doesNotMatch(migration,/public\.(work_payable_(units|events|receipts)|finance_(accounts|journals|postings)|payment_wallets|withdrawal_requests)/i);
    assert.match(migration,/insert into public\.assistance_entries/i);
    assert.match(migration,/canonical beneficiary identity/i);
    assert.match(migration,/protected cross-project support conflicts/i);
  });

  await ok('frontend exposes duplicate review, controlled delivery and a scoped assistance ledger',async()=>{
    const cases=readFileSync('src/features/cases/BeneficiaryCasesWorkspace.tsx','utf8');
    const ledger=readFileSync('src/features/assistance/AssistanceLedgerWorkspace.tsx','utf8');
    const shell=readFileSync('src/app/AppShell.tsx','utf8');
    assert.match(cases,/Check duplicate support/);assert.match(cases,/record_assistance_distribution_delivery/);assert.match(cases,/Protected cross-NGO details are not disclosed/i);
    assert.match(ledger,/Authoritative delivered-assistance records/i);assert.match(ledger,/assistance_ledger/);
    assert.match(shell,/Assistance ledger/);
  });

  console.log(`\n${passed} POEM 2.19.2 assistance ledger / duplicate-support scenarios passed.`);
}finally{await db.close()}
