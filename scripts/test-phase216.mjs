import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { schemaDb } from './schema-test-db.mjs';

const db = await schemaDb();
let passed = 0;
const ids = Object.fromEntries(
  ['super','ngo','manager','focal','collectorA','collectorB','collectorC','collectorD'].map((name,i)=>[
    name,`a1600000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,
  ]),
);
const rows = async (q,p=[]) => (await db.query(q,p)).rows;
async function as(name){
  await db.exec('RESET ROLE');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[name ? ids[name] : '']);
  await db.exec(`SET ROLE ${name ? 'authenticated' : 'anon'}`);
}
async function call(name,args){
  return (await rows(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args))[0].result;
}
async function ok(name,fn){await fn();passed+=1;console.log(`PASS ${name}`)}
const deny=(fn,re=/permission|required|capacity|target|recruitment|closed|management/i)=>assert.rejects(fn,re);

try{
  for(const [name,id] of Object.entries(ids)) await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${name}@example.test`]);
  await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.super]);
  await as('super');

  const org=await call('save_organization',[null,{name:'2.16 Target Capacity NGO',status:'active'}]);
  await call('set_membership',[org,ids.ngo,'ngo_admin','active']);
  await call('set_membership',[org,ids.manager,'member','active']);
  await call('set_membership',[org,ids.focal,'member','active']);

  const province=await call('save_geography',[null,null,'province','2.16 Province','A160P','Fixture',true]);
  const division=await call('save_geography',[null,province,'division','2.16 Division','A160D','Fixture',true]);
  const district=await call('save_geography',[null,division,'district','2.16 District','A160X','Fixture',true]);
  const taluka=await call('save_geography',[null,district,'taluka','2.16 Taluka','A160T','Fixture',true]);

  await db.exec('RESET ROLE');
  for(const who of ['collectorA','collectorB','collectorC','collectorD']){
    await db.query(
      "update public.volunteer_profiles set status='verified',geography_id=$1,details=jsonb_build_object('full_name',$2::text,'skills','Survey, Data Collection','languages','Urdu','availability','Full-time'),version=version+1 where user_id=$3",
      [taluka,who,ids[who]],
    );
  }

  await as('super');
  const template=await call('publish_survey_template',['2.16 Capacity Template',[{id:'q',label:'Question',type:'text',required:true}]]);
  const dates=(await rows("select ((now() at time zone 'UTC')::date-1)::text start,((now() at time zone 'UTC')::date+30)::text finish,((now() at time zone 'UTC')::date+1)::text opp_start,((now() at time zone 'UTC')::date+10)::text opp_end,(now()+interval '1 day')::text reply,current_date::text today"))[0];
  const project=await call('create_survey_project',[org,'2.16 Soft Target Project',template,district,1,dates.start,dates.finish,'Validate soft target and recruitment capacity behavior','v1','Explain the project and obtain informed consent before collecting survey data.']);

  await as('ngo');
  await call('assign_project_staff',[project,ids.manager,'project_manager',[],dates.today,null]);
  await call('assign_project_staff',[project,ids.focal,'area_focal_person',[taluka],dates.today,null]);

  let plan;
  await ok('project target and volunteer capacity are separate controls and focal cannot read the global recruitment plan',async()=>{
    await as('ngo');
    plan=await call('project_recruitment_status',[project]);
    assert.equal(plan.target,1);
    assert.equal(plan.approved,0);
    assert.equal(plan.required_volunteers,null);
    assert.equal(plan.effective_open,true);
    const next=await call('set_project_recruitment_plan',[project,1,2,'open','Configure initial field-team capacity',plan.version]);
    assert.equal(next,2);
    plan=await call('project_recruitment_status',[project]);
    assert.equal(plan.required_volunteers,2);
    assert.equal(plan.remaining_capacity,2);
    await as('focal');
    await deny(()=>call('project_recruitment_status',[project]),/Project management permission required/i);
  });

  await ok('capacity counts distinct committed volunteers and blocks a third direct assignment',async()=>{
    await as('manager');
    const eligibilityOpportunity=await call('create_recruitment_opportunity',[project,'2.16 Assignment Eligibility','Establish application-scoped assignment eligibility for capacity testing',taluka,dates.opp_start,dates.opp_end,dates.reply,'unpaid','Project defaults apply',2,'Survey','Urdu','all','Available for field survey work',true]);
    for(const who of ['collectorA','collectorB','collectorC']){
      await as(who);
      const application=await call('apply_work_opportunity',[eligibilityOpportunity,'Available throughout the project period','Application for recruitment-capacity validation',true]);
      await as('manager');
      const current=(await rows('select version from public.work_applications where id=$1',[application]))[0];
      await call('review_work_application',[application,'selected','Selected for assignment-capacity validation',current.version]);
    }
    await call('set_survey_assignment_scope',[project,ids.collectorA,taluka,true]);
    await call('set_survey_assignment_scope',[project,ids.collectorB,taluka,true]);
    plan=await call('project_recruitment_status',[project]);
    assert.equal(plan.committed_volunteers,2);
    assert.equal(plan.remaining_capacity,0);
    assert.equal(plan.capacity_reached,true);
    assert.equal(plan.effective_open,false);
    await deny(()=>call('set_survey_assignment_scope',[project,ids.collectorC,taluka,true]),/capacity is full/i);
  });

  async function save(who,name){
    await as(who);
    return call('save_survey_response',[null,project,null,null,name,'2010-01-01',`Household ${name}`,{q:'Answer'},{agreed:true,method:'verbal',representative:'Guardian',relationship:'Guardian'},true,0,crypto.randomUUID()]);
  }

  let responseA;
  await ok('approved responses consume the soft target and stop new recruitment without closing collection',async()=>{
    responseA=await save('collectorA','Target Person A');
    await as('manager');
    await call('review_survey_response',[responseA,'approved','Approved target response',1]);
    plan=await call('project_recruitment_status',[project]);
    assert.equal(plan.approved,1);
    assert.equal(plan.remaining_target,0);
    assert.equal(plan.target_reached,true);
    assert.equal(plan.effective_open,false);
    await deny(()=>call('create_recruitment_opportunity',[project,'Blocked Recruitment','Recruit volunteers after target reached',taluka,dates.opp_start,dates.opp_end,dates.reply,'unpaid','Unpaid volunteer role',1,'Survey','Urdu','all','Must be available during project dates',true]),/Project recruitment is closed/i);
    await deny(()=>call('set_survey_assignment_scope',[project,ids.collectorC,taluka,true]),/target\/status is closed/i);
  });

  await ok('already-assigned field work still synchronizes after target reach and over-target approvals are reported',async()=>{
    const responseB=await save('collectorB','Offline Queue Person B');
    await as('manager');
    await call('review_survey_response',[responseB,'approved','Legitimate queued response approved after target',1]);
    plan=await call('project_recruitment_status',[project]);
    assert.equal(plan.approved,2);
    assert.equal(plan.over_target,1);
    assert.equal(plan.remaining_target,0);
    await db.exec('RESET ROLE');
    assert.equal((await rows('select status from public.survey_projects where id=$1',[project]))[0].status,'active');
  });

  await ok('project manager can increase target and capacity to reopen recruitment but cannot lower the operational target',async()=>{
    await as('manager');
    plan=await call('project_recruitment_status',[project]);
    await deny(()=>call('set_project_recruitment_plan',[project,0,2,'open','Attempt invalid target reduction',plan.version]),/target|Valid approved-response target/i);
    const next=await call('set_project_recruitment_plan',[project,3,4,'open','Increase target and field-team capacity',plan.version]);
    assert.ok(next>plan.version);
    plan=await call('project_recruitment_status',[project]);
    assert.equal(plan.target,3);
    assert.equal(plan.required_volunteers,4);
    assert.equal(plan.remaining_target,1);
    assert.equal(plan.remaining_capacity,2);
    assert.equal(plan.effective_open,true);
    await call('set_survey_assignment_scope',[project,ids.collectorC,taluka,true]);
  });

  let opportunity;
  await ok('manual close blocks publication while preserving a draft, then manager can reopen and publish it',async()=>{
    await as('manager');
    plan=await call('project_recruitment_status',[project]);
    await call('set_project_recruitment_plan',[project,3,4,'closed','Pause recruitment for operational review',plan.version]);
    opportunity=await call('create_recruitment_opportunity',[project,'2.16 Field Recruitment','Recruit survey volunteers for the approved project',taluka,dates.opp_start,dates.opp_end,dates.reply,'unpaid','Unpaid volunteer role',1,'Survey','Urdu','all','Must be available during project dates',false]);
    const draft=(await rows('select publication_state,applications_open,version from public.work_opportunities where id=$1',[opportunity]))[0];
    assert.equal(draft.publication_state,'draft');
    assert.equal(draft.applications_open,false);
    await deny(()=>call('set_work_opportunity_state',[opportunity,'published',draft.version]),/Project recruitment is closed/i);
    plan=await call('project_recruitment_status',[project]);
    await call('set_project_recruitment_plan',[project,3,4,'open','Resume recruitment after operational review',plan.version]);
    const current=(await rows('select version from public.work_opportunities where id=$1',[opportunity]))[0];
    await call('set_work_opportunity_state',[opportunity,'published',current.version]);
    assert.equal((await rows('select applications_open from public.work_opportunities where id=$1',[opportunity]))[0].applications_open,true);
  });

  await ok('project manager gets project recruitment read access while focal remains outside project-wide recruitment management',async()=>{
    await as('manager');
    assert.equal((await rows('select id from public.work_opportunities where id=$1',[opportunity])).length,1);
    await as('focal');
    assert.equal((await rows('select id from public.work_opportunities where id=$1',[opportunity])).length,0);
  });

  await ok('volunteer discovery closes dynamically at target without mutating published opportunity history',async()=>{
    await as('collectorD');
    let available=await call('available_work_opportunities',[0,null,null,null,'',null,null]);
    assert.equal(available.rows.some(row=>row.id===opportunity),true);

    const responseC=await save('collectorC','Target Person C');
    await as('manager');
    await call('review_survey_response',[responseC,'approved','Third accepted response reaches increased target',1]);
    plan=await call('project_recruitment_status',[project]);
    assert.equal(plan.approved,3);
    assert.equal(plan.target_reached,true);
    assert.equal(plan.effective_open,false);

    await as('collectorD');
    available=await call('available_work_opportunities',[0,null,null,null,'',null,null]);
    assert.equal(available.rows.some(row=>row.id===opportunity),false);
    await db.exec('RESET ROLE');
    const historical=(await rows('select publication_state,applications_open,status from public.work_opportunities where id=$1',[opportunity]))[0];
    assert.equal(historical.publication_state,'published');
    assert.equal(historical.applications_open,true);
    assert.equal(historical.status,'open');
  });

  await ok('2.16.0 UI exposes soft-target controls and migration does not hard-reject survey saves',async()=>{
    const workspace=readFileSync('src/features/projects/ProjectTeamWorkspace.tsx','utf8');
    const workforce=readFileSync('src/features/workforce/WorkforceMarketplace.tsx','utf8');
    const shell=readFileSync('src/app/AppShell.tsx','utf8');
    const migration=readFileSync('supabase/migrations/20261008000300_project_targets_recruitment_capacity.sql','utf8');
    assert.match(workspace,/SOFT TARGET & RECRUITMENT CAPACITY/);
    assert.match(workspace,/Closing recruitment does not reject already-created\/offline survey submissions/);
    assert.match(workspace,/set_project_recruitment_plan/);
    assert.match(workforce,/"project"/);
    assert.match(workforce,/projectScopeId/);
    assert.match(shell,/projectScopeAssignment\?\.role === "project_manager"/);
    assert.match(shell,/\["Recruitment", Users\]/);
    assert.doesNotMatch(migration,/create or replace function public\.save_survey_response/i);
    assert.doesNotMatch(migration,/drop function public\.save_survey_response/i);
  });

  console.log(`\n${passed} POEM 2.16.0 targets / recruitment-capacity scenarios passed.`);
} finally {
  await db.close();
}
