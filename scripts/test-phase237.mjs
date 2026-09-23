import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {schemaDb} from './schema-test-db.mjs';

let passed=0;
const ok=async(name,fn)=>{await fn();passed+=1;console.log(`PASS ${name}`)};
const read=(path)=>readFileSync(path,'utf8');
const migration=read('supabase/migrations/20261013000300_workforce_scheduling_assignment_safety.sql');
const scheduleUi=read('src/features/workforce/WorkAvailabilitySchedule.tsx');
const marketplace=read('src/features/workforce/WorkforceMarketplace.tsx');
const routes=read('src/app/routes.ts');
const shell=read('src/app/AppShell.tsx');

await ok('2.37 adds private structured availability and date-exception tables',async()=>{
  assert.match(migration,/create table public\.worker_availability_preferences/);
  assert.match(migration,/create table public\.worker_availability_rules/);
  assert.match(migration,/create table public\.worker_unavailable_periods/);
  assert.match(migration,/user_id=auth\.uid\(\)/);
  assert.match(migration,/revoke insert,update,delete/);
});

await ok('availability mutations are RPC-only and audited',async()=>{
  for(const token of ['save_worker_availability','add_worker_unavailable_period','remove_worker_unavailable_period','worker_availability_updated']) assert.match(migration,new RegExp(token));
});

await ok('assignment conflict summaries preserve cross-organization privacy',async()=>{
  assert.match(migration,/check_work_assignment_conflicts/);
  assert.match(migration,/Selected project candidate required for scheduling check/);
  assert.match(migration,/overlapping_commitments/);
  assert.match(migration,/capacity_pct/);
  assert.doesNotMatch(migration,/jsonb_build_object\([^)]*organization_name[^)]*project_title/);
  assert.match(marketplace,/Privacy: FieldLance does not reveal the names or details of this worker's other organization commitments/);
});

await ok('hard conflicts are enforced below the offer UI',async()=>{
  assert.match(migration,/guard_work_assignment_capacity/);
  assert.match(migration,/before insert or update of user_id,start_date,end_date,status,survey_project_id on public\.work_assignments/);
  assert.match(migration,/summary->>'status'='hard_conflict'/);
  assert.match(marketplace,/disabled=\{busy\|\|checking\|\|hardConflict\}/);
});

await ok('Field Worker gets routable schedule and availability workspaces',async()=>{
  assert.match(routes,/My Schedule/);assert.match(routes,/\/app\/work\/schedule/);
  assert.match(routes,/My Availability/);assert.match(routes,/\/app\/work\/availability/);
  assert.match(shell,/WorkAvailabilitySchedule/);
  assert.match(scheduleUi,/MY SCHEDULE/);assert.match(scheduleUi,/WORK AVAILABILITY/);
});

await ok('offer form checks privacy-safe scheduling before creating a formal assignment',async()=>{
  assert.match(marketplace,/check_work_assignment_conflicts/);
  assert.match(marketplace,/ASSIGNMENT SAFETY/);
  assert.match(marketplace,/Overlapping commitments/);
  assert.match(marketplace,/Parallel project limit/);
});

const db=await schemaDb();
const ids={
  super:'a2370000-0000-4000-8000-000000000001',
  ngo:'a2370000-0000-4000-8000-000000000002',
  worker:'a2370000-0000-4000-8000-000000000003',
  outsider:'a2370000-0000-4000-8000-000000000004',
};
const rows=async(q,p=[])=>(await db.query(q,p)).rows;
async function as(name){
  await db.exec('RESET ROLE');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[name?ids[name]:'']);
  await db.exec(`SET ROLE ${name?'authenticated':'anon'}`);
}
async function call(name,args=[]){return (await rows(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args))[0].result}
try{
  for(const [name,id] of Object.entries(ids)) await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${name}@phase237.test`]);
  await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.super]);
  await as('super');
  const orgA=await call('save_organization',[null,{name:'Scheduling Organization A',status:'active'}]);
  const orgB=await call('save_organization',[null,{name:'Private Organization B',status:'active'}]);
  await call('set_membership',[orgA,ids.ngo,'ngo_admin','active']);
  const province=await call('save_geography',[null,null,'province','Scheduling Province','S37P','Fixture',true]);
  const division=await call('save_geography',[null,province,'division','Scheduling Division','S37D','Fixture',true]);
  const district=await call('save_geography',[null,division,'district','Scheduling District','S37X','Fixture',true]);
  const template=await call('publish_survey_template',['Scheduling template',[{id:'q',label:'Question',type:'text',required:true}]]);
  const dates=(await rows("select current_date::text start,(current_date+30)::text finish,(current_date+2)::text off_start,(current_date+3)::text off_end"))[0];
  const projectA=await call('create_survey_project',[orgA,'Scheduling Project A',template,district,50,dates.start,dates.finish,'Scheduling safety fixture A','s37','Scheduling consent fixture A.']);
  const projectB=await call('create_survey_project',[orgB,'Private Foreign Project',template,district,50,dates.start,dates.finish,'Scheduling safety fixture B','s37','Scheduling consent fixture B.']);
  await db.exec('RESET ROLE');
  await db.query("update public.volunteer_profiles set status='verified',geography_id=$1,details=jsonb_build_object('full_name','Scheduling Worker','availability','Full-time') where user_id=$2",[district,ids.worker]);
  await db.query('insert into public.profile_shares(user_id,organization_id) values($1,$2)',[ids.worker,orgA]);
  await db.query("insert into public.volunteer_shortlists(organization_id,user_id,status,note,updated_by) values($1,$2,'selected','Scheduling fixture',$3)",[orgA,ids.worker,ids.ngo]);

  await ok('unconfigured structured availability returns a warning without exposing private commitments',async()=>{
    await as('ngo');
    const x=await call('check_work_assignment_conflicts',[projectA,ids.worker,dates.start,dates.finish,10]);
    assert.equal(x.status,'warning');assert.equal(x.schedule_configured,false);assert.equal(x.overlapping_commitments,0);
  });

  await ok('worker owns schedule settings while organization cannot read private rows directly',async()=>{
    await as('worker');
    const rules=Array.from({length:7},(_,i)=>({weekday:i+1,is_available:true,start_time:'09:00',end_time:'17:00'}));
    const saved=await call('save_worker_availability',['Asia/Karachi',1,6,'flexible','district',rules]);
    assert.equal(saved.preferences.max_active_projects,1);assert.equal(saved.rules.length,7);
    await call('add_worker_unavailable_period',[dates.off_start,dates.off_end,'Personal commitment']);
    const own=(await rows('select count(*)::int n from public.worker_availability_rules'))[0].n;assert.equal(own,7);
    await assert.rejects(()=>db.query("insert into public.worker_availability_preferences(user_id) values($1)",[ids.worker]),/permission|policy/i);
    await as('ngo');
    const hidden=(await rows('select * from public.worker_availability_rules')).length;assert.equal(hidden,0);
  });

  let privateAssignment;
  await ok('cross-organization overlap becomes a hard capacity conflict without leaking source details',async()=>{
    await db.exec('RESET ROLE');
    privateAssignment=(await rows(`insert into public.work_assignments(survey_project_id,organization_id,user_id,volunteer_name,organization_name,project_title,source_kind,work_mode,compensation_type,target_surveys,start_date,end_date,terms_note,status,offered_by,collection_geography_id) values($1,$2,$3,'Scheduling Worker','Private Organization B','Private Foreign Project','shortlist','volunteer','none',10,$4,$5,'Private assignment','active',$6,$7) returning id`,[projectB,orgB,ids.worker,dates.start,dates.finish,ids.super,district]))[0].id;
    await as('ngo');
    const x=await call('check_work_assignment_conflicts',[projectA,ids.worker,dates.start,dates.finish,10]);
    assert.equal(x.status,'hard_conflict');assert.equal(x.overlapping_commitments,1);assert.equal(x.max_active_projects,1);
    const encoded=JSON.stringify(x);assert.equal(encoded.includes('Private Organization B'),false);assert.equal(encoded.includes('Private Foreign Project'),false);
    await db.exec('RESET ROLE');
    await assert.rejects(()=>db.query(`insert into public.work_assignments(survey_project_id,organization_id,user_id,volunteer_name,organization_name,project_title,source_kind,work_mode,compensation_type,target_surveys,start_date,end_date,terms_note,status,offered_by,collection_geography_id) values($1,$2,$3,'Scheduling Worker','Scheduling Organization A','Scheduling Project A','shortlist','volunteer','none',10,$4,$5,'Conflicting assignment','offered',$6,$7)`,[projectA,orgA,ids.worker,dates.start,dates.finish,ids.super,district]),/schedule|conflict/i);
  });

  await ok('worker schedule can show own commitment details while unrelated users cannot run manager checks',async()=>{
    await as('worker');const schedule=await call('worker_schedule',[dates.start,35]);
    assert.equal(schedule.assignments.some(a=>a.id===privateAssignment),true);assert.ok(JSON.stringify(schedule).includes('Private Foreign Project'));
    await as('outsider');await assert.rejects(()=>call('check_work_assignment_conflicts',[projectA,ids.worker,dates.start,dates.finish,10]),/permission|required|management/i);
  });

  await ok('cancelled commitments stop consuming capacity while unavailable dates remain a warning',async()=>{
    await db.exec('RESET ROLE');await db.query("update public.work_assignments set status='cancelled',cancelled_at=now(),cancelled_by=$1,cancellation_note='Fixture complete' where id=$2",[ids.super,privateAssignment]);
    await as('ngo');
    const x=await call('check_work_assignment_conflicts',[projectA,ids.worker,dates.start,dates.finish,10]);
    assert.equal(x.status,'warning');assert.equal(x.overlapping_commitments,0);assert.ok(x.unavailable_days>=2);
    const cleanStart=(await rows("select (current_date+10)::text d"))[0].d;
    const cleanEnd=(await rows("select (current_date+12)::text d"))[0].d;
    const clean=await call('check_work_assignment_conflicts',[projectA,ids.worker,cleanStart,cleanEnd,10]);
    assert.equal(clean.status,'clear');
  });

  await ok('2.37 scheduling migration immediately follows 2.36.1 moderation',async()=>{
    const migrations=readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort();
    const prior='20261013000200_partner_self_publish_platform_moderation.sql';
    const current='20261013000300_workforce_scheduling_assignment_safety.sql';
    const priorIndex=migrations.indexOf(prior),currentIndex=migrations.indexOf(current);
    assert.ok(priorIndex>=0,'2.36.1 moderation migration is missing');
    assert.equal(currentIndex,priorIndex+1,'2.37 scheduling migration must immediately follow 2.36.1 moderation');
  });

  console.log(`\n${passed} FieldLance 2.37 Workforce Scheduling & Assignment Safety scenarios passed.`);
}finally{await db.close()}
