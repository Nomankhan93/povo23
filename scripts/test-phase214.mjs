import assert from 'node:assert/strict';
import { schemaDb } from './schema-test-db.mjs';

const db = await schemaDb();
let passed = 0;
const ids = Object.fromEntries(
  ['super','ngo','manager','focal','collectorA','collectorB'].map((name,i)=>[
    name,`a1400000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,
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
const deny=(fn,re=/permission|required|access|area|membership|management/i)=>assert.rejects(fn,re);

try{
  for(const [name,id] of Object.entries(ids)) await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${name}@example.test`]);
  await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.super]);
  await as('super');

  const org=await call('save_organization',[null,{name:'2.14 Area Governance NGO',status:'active'}]);
  await call('set_membership',[org,ids.ngo,'ngo_admin','active']);
  await call('set_membership',[org,ids.manager,'member','active']);
  await call('set_membership',[org,ids.focal,'member','active']);

  const province=await call('save_geography',[null,null,'province','2.14 Province','A14P','Fixture',true]);
  const division=await call('save_geography',[null,province,'division','2.14 Division','A14D','Fixture',true]);
  const district=await call('save_geography',[null,division,'district','2.14 District','A14X','Fixture',true]);
  const talukaA=await call('save_geography',[null,district,'taluka','Area Alpha','A14A','Fixture',true]);
  const talukaB=await call('save_geography',[null,district,'taluka','Area Beta','A14B','Fixture',true]);

  await db.exec('RESET ROLE');
  for(const who of ['collectorA','collectorB']){
    await db.query("update public.volunteer_profiles set status='verified',geography_id=$1,details=jsonb_build_object('full_name',$2::text,'skills','Survey','languages','Urdu'),version=version+1 where user_id=$3",[who==='collectorA'?talukaA:talukaB,who,ids[who]]);
  }

  await as('super');
  const template=await call('publish_survey_template',['2.14 area fixture',[{id:'q',label:'Question',type:'text',required:true}]]);
  const dates=(await rows("select ((now() at time zone 'UTC')::date-1)::text start,((now() at time zone 'UTC')::date+20)::text finish,((now() at time zone 'UTC')::date)::text today"))[0];
  const project=await call('create_survey_project',[org,'2.14 Scoped Project',template,district,100,dates.start,dates.finish,'Test project-scoped operational permissions','a14','Consent notice used for project area governance tests.']);
  await call('set_survey_assignment_scope',[project,ids.collectorA,talukaA,true]);
  await call('set_survey_assignment_scope',[project,ids.collectorB,talukaB,true]);

  async function save(who,name){
    await as(who);
    return call('save_survey_response',[null,project,null,null,name,'2010-01-01',`Household ${name}`,{q:'Answer'},{agreed:true,method:'verbal',representative:'Guardian',relationship:'Guardian'},true,0,crypto.randomUUID()]);
  }
  const responseA=await save('collectorA','Area Alpha Person');
  const responseB=await save('collectorB','Area Beta Person');

  await as('ngo');
  const managerAssignment=await call('assign_project_staff',[project,ids.manager,'project_manager',[],dates.today,null]);
  const focalAssignment=await call('assign_project_staff',[project,ids.focal,'area_focal_person',[talukaA],dates.today,null]);

  await ok('server stamps immutable response and household collection geography from assignment scope',async()=>{
    await db.exec('RESET ROLE');
    const a=(await rows('select r.collection_geography_id,h.geography_id from public.survey_responses r join public.registry_persons p on p.id=r.person_id join public.registry_households h on h.id=p.household_id where r.id=$1',[responseA]))[0];
    const b=(await rows('select r.collection_geography_id,h.geography_id from public.survey_responses r join public.registry_persons p on p.id=r.person_id join public.registry_households h on h.id=p.household_id where r.id=$1',[responseB]))[0];
    assert.equal(a.collection_geography_id,talukaA);assert.equal(a.geography_id,talukaA);
    assert.equal(b.collection_geography_id,talukaB);assert.equal(b.geography_id,talukaB);
    await assert.rejects(()=>db.query('update public.survey_responses set collection_geography_id=$1 where id=$2',[talukaB,responseA]),/immutable/i);
  });

  await ok('project manager has project-wide operational review but no POEM template authority',async()=>{
    await as('manager');
    assert.equal((await rows('select count(*)::int n from public.survey_responses where project_id=$1',[project]))[0].n,2);
    await call('review_survey_response',[responseB,'approved','Project manager reviewed Area Beta response',1]);
    await deny(()=>call('publish_survey_template',['Manager must not publish',[{id:'x',label:'X',type:'text',required:true}]]),/Survey management permission required/i);
  });

  await ok('area focal person sees and reviews only assigned geography descendants',async()=>{
    await as('focal');
    const visible=await rows('select id,collection_geography_id from public.survey_responses where project_id=$1 order by id',[project]);
    assert.equal(visible.length,1);
    assert.equal(visible[0].id,responseA);
    assert.equal(visible[0].collection_geography_id,talukaA);
    await call('review_survey_response',[responseA,'approved','Area focal reviewed assigned response',1]);
    await deny(()=>call('review_survey_response',[responseB,'rejected','Must not cross area boundary',2]),/Project\/area review permission required/i);
    await deny(()=>call('set_survey_assignment_scope',[project,ids.collectorA,talukaA,false]),/Project management permission required/i);
  });

  await ok('project roster exposes full team to manager but only own staff record to focal person',async()=>{
    await as('manager');
    const managerRoster=await call('project_staff_roster',[project]);
    assert.equal(managerRoster.length,2);
    assert.equal(managerRoster.some(x=>x.id===managerAssignment),true);
    assert.equal(managerRoster.some(x=>x.id===focalAssignment),true);
    await as('focal');
    const focalRoster=await call('project_staff_roster',[project]);
    assert.equal(focalRoster.length,1);
    assert.equal(focalRoster[0].id,focalAssignment);
    assert.equal(focalRoster[0].areas[0].id,talukaA);
  });

  await ok('revocation and NGO membership state immediately remove project-staff authority',async()=>{
    await as('ngo');
    await call('revoke_project_staff',[focalAssignment,'Field focal responsibility ended',1]);
    await as('focal');
    assert.equal((await rows('select count(*)::int n from public.survey_projects where id=$1',[project]))[0].n,0);

    await as('ngo');
    const focalAgain=await call('assign_project_staff',[project,ids.focal,'area_focal_person',[talukaA],dates.today,null]);
    assert.ok(focalAgain);
    await as('super');
    await call('set_membership',[org,ids.focal,'member','suspended']);
    await as('focal');
    assert.equal((await rows('select count(*)::int n from public.survey_projects where id=$1',[project]))[0].n,0);
  });

  await ok('all new project governance tables retain RLS and direct mutation stays RPC-only',async()=>{
    await db.exec('RESET ROLE');
    const protectedRows=await rows("select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relname in ('project_staff_assignments','project_staff_areas') order by relname");
    assert.deepEqual(protectedRows.map(x=>[x.relname,x.relrowsecurity]),[['project_staff_areas',true],['project_staff_assignments',true]]);
    await as('manager');
    await assert.rejects(()=>db.query("insert into public.project_staff_assignments(project_id,user_id,role,starts_at,assigned_by) values($1,$2,'project_manager',current_date,$3)",[project,ids.focal,ids.manager]),/permission denied/i);
  });

  console.log(`\n${passed} POEM 2.14.0 project team / area governance scenarios passed.`);
} finally {
  await db.close();
}
