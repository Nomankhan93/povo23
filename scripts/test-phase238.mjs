import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {schemaDb} from './schema-test-db.mjs';

let passed=0;
const ok=async(name,fn)=>{await fn();passed+=1;console.log(`PASS ${name}`)};
const read=(path)=>readFileSync(path,'utf8');
const migration=read('supabase/migrations/20261013000400_assignment_attendance_timesheets_location.sql');
const ui=read('src/features/workforce/AttendanceWorkspace.tsx');
const offline=read('src/features/workforce/attendanceOfflineStore.ts');
const routes=read('src/app/routes.ts');
const workspace=read('src/features/projects/ProjectWorkspace.tsx');
const payables=read('src/features/payables/PayablesWorkspace.tsx');

function dateOnly(value) {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}

await ok('2.38 adds assignment-bound attendance sessions, explicit location evidence and immutable history',async()=>{
  for(const token of ['assignment_work_sessions','assignment_session_locations','attendance_adjustments','attendance_events','project_attendance_policies'])assert.match(migration,new RegExp(`create table public\\.${token}`));
  assert.match(migration,/location_policy text not null default 'preferred'/);
  assert.match(migration,/event_type text not null check\(event_type in \('check_in','check_out'\)\)/);
  assert.match(migration,/continuous\/background/);
});

await ok('attendance mutation stays on guarded RPCs and cross-workspace reads stay RLS scoped',async()=>{
  assert.match(migration,/revoke all on public\.project_attendance_policies,public\.assignment_work_sessions/);
  assert.match(migration,/app_private\.can_read_attendance_assignment/);
  assert.match(migration,/app_private\.can_manage_attendance_project\(s\.project_id\)/);
  assert.match(migration,/app_private\.ngo_admin\(p\.organization_id\)/);
  assert.match(migration,/app_private\.project_staff_active\(p_project,'project_manager'\)/);
  assert.match(migration,/Independent reviewer required/);
});

await ok('worker check-in/out is explicit, idempotent and supports delayed encrypted device sync',async()=>{
  assert.match(migration,/start_request_id uuid not null unique/);
  assert.match(migration,/Check-in capture time must be within the allowed offline window/);
  assert.match(migration,/checkout_assignment_work_session/);
  assert.match(offline,/AES-GCM/);
  assert.match(offline,/syncAttendanceQueue/);
  assert.match(ui,/No 24\/7 or background tracking is performed/);
});

await ok('daily-rate payables require approved attendance while other compensation semantics remain intact',async()=>{
  assert.match(migration,/Approved attendance required for daily-rate payable/);
  assert.match(migration,/w\.compensation_type='daily_rate'/);
  assert.match(migration,/unit_id:=app_private\.ensure_attendance_daily_payable/);
  assert.match(payables,/Attendance-backed daily rate/);
  assert.match(payables,/selected\.compensation_type==='fixed_assignment'/);
  assert.match(payables,/selected\.compensation_type==='per_verified_survey'/);
});

await ok('worker attendance and timesheet routes integrate with 2.36 deep-link navigation',async()=>{
  assert.match(routes,/\/app\/field\/attendance/);
  assert.match(routes,/\/app\/field\/timesheets/);
  assert.match(routes,/\/attendance`/);
  assert.match(ui,/MY ATTENDANCE/);
  assert.match(ui,/MY TIMESHEETS/);
});

await ok('project Field Work embeds manager attendance review without granting Area Focal authority',async()=>{
  assert.match(workspace,/AttendanceWorkspace/);
  assert.match(workspace,/canManage=\{canManageProject\}/);
  assert.match(ui,/policy\?\.can_manage/);
  assert.match(ui,/PROJECT ATTENDANCE/);
  assert.match(migration,/app_private\.can_manage_attendance_project\(p_project\)/);
});

await ok('2.37 migration contract remains stable when 2.38 is appended',async()=>{
  const migrations=readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort();
  const prior='20261013000300_workforce_scheduling_assignment_safety.sql';
  const current='20261013000400_assignment_attendance_timesheets_location.sql';
  assert.equal(migrations.indexOf(current),migrations.indexOf(prior)+1);
});

const db=await schemaDb();
const ids={super:'a2380000-0000-4000-8000-000000000001',ngo:'a2380000-0000-4000-8000-000000000002',worker:'a2380000-0000-4000-8000-000000000003',outsider:'a2380000-0000-4000-8000-000000000004'};
const rows=async(q,p=[])=>(await db.query(q,p)).rows;
async function as(name){await db.exec('RESET ROLE');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[name?ids[name]:'']);await db.exec(`SET ROLE ${name?'authenticated':'anon'}`);}
async function call(name,args=[]){return (await rows(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args))[0].result;}
try{
  for(const [name,id] of Object.entries(ids))await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${name}@phase238.test`]);
  await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.super]);
  await as('super');
  const org=await call('save_organization',[null,{name:'Attendance Organization',status:'active'}]);
  await call('set_membership',[org,ids.ngo,'ngo_admin','active']);
  const province=await call('save_geography',[null,null,'province','Attendance Province','A38P','Fixture',true]);
  const division=await call('save_geography',[null,province,'division','Attendance Division','A38D','Fixture',true]);
  const district=await call('save_geography',[null,division,'district','Attendance District','A38X','Fixture',true]);
  const template=await call('publish_survey_template',['Attendance template',[{id:'q',label:'Question',type:'text',required:true}]]);
  const dates=(await rows("select (current_date-2)::text start,(current_date+20)::text finish"))[0];
  const project=await call('create_survey_project',[org,'Attendance Project',template,district,50,dates.start,dates.finish,'Attendance fixture project','a38','Attendance consent fixture.']);
  await db.exec('RESET ROLE');
  await db.query("update public.volunteer_profiles set status='verified',geography_id=$1,details=jsonb_build_object('full_name','Attendance Worker') where user_id=$2",[district,ids.worker]);
  const assignment=(await rows(`insert into public.work_assignments(survey_project_id,organization_id,user_id,volunteer_name,organization_name,project_title,source_kind,work_mode,compensation_type,currency,rate,target_surveys,start_date,end_date,terms_note,status,offered_by,responded_at,collection_geography_id) values($1,$2,$3,'Attendance Worker','Attendance Organization','Attendance Project','shortlist','paid','daily_rate','PKR',1200,10,$4,$5,'Daily attendance fixture','active',$6,now()-interval '2 days',$7) returning id`,[project,org,ids.worker,dates.start,dates.finish,ids.super,district]))[0].id;

  await ok('project policy uses a valid IANA timezone and required location fails closed',async()=>{
    await as('ngo');const p=await call('set_project_attendance_policy',[project,'UTC','required',100]);assert.equal(p.timezone,'UTC');assert.equal(p.location_policy,'required');
    await as('worker');const captured=(await rows("select (now()-interval '2 hours')::text t"))[0].t;
    await assert.rejects(()=>call('start_assignment_work_session',[assignment,captured,null,null,null,'denied','GPS permission denied','23800000-0000-4000-8000-000000000101']),/location permission is required/i);
  });

  let session;
  await ok('worker can explicitly check in and checkout with raw capture/receive timestamps retained',async()=>{
    await as('worker');
    const times=(await rows("select (now()-interval '2 hours')::text start,(now()-interval '30 minutes')::text finish"))[0];
    const started=await call('start_assignment_work_session',[assignment,times.start,24.8607,67.0011,18,'granted','', '23800000-0000-4000-8000-000000000102']);
    session=started.id;assert.equal(started.status,'open');assert.ok(started.offline_delay_seconds>=0);
    const ended=await call('checkout_assignment_work_session',[session,times.finish,24.861,67.002,22,'granted','','Completed assigned household visits.','23800000-0000-4000-8000-000000000103',started.version]);
    assert.equal(ended.status,'submitted');
    const raw=(await rows('select check_in_captured_at,check_in_received_at,check_out_captured_at,check_out_received_at from public.assignment_work_sessions where id=$1',[session]))[0];
    assert.ok(new Date(raw.check_in_received_at)>=new Date(raw.check_in_captured_at));assert.ok(raw.check_out_received_at);
  });

  await ok('unrelated account cannot read project attendance or manager workspace',async()=>{
    await as('outsider');assert.equal((await rows('select * from public.assignment_work_sessions')).length,0);
    await assert.rejects(()=>call('attendance_workspace',[project,dates.start,dates.finish,null,0]),/attendance access/i);
  });

  await ok('FieldLance staff retain attendance oversight without routine approval authority',async()=>{
    await as('super');const oversight=await call('attendance_workspace',[project,dates.start,dates.finish,null,0]);assert.equal(oversight.count,1);assert.equal(oversight.can_manage,false);
    const row=(await rows('select * from public.assignment_work_sessions where id=$1',[session]))[0];
    await assert.rejects(()=>call('review_attendance_session',[session,'approve','Platform oversight must not approve routine attendance.',row.version]),/Organization Admin or Project Manager attendance permission required/i);
  });

  await ok('reviewer time adjustment preserves an immutable adjustment record before approval',async()=>{
    await as('ngo');const row=(await rows('select * from public.assignment_work_sessions where id=$1',[session]))[0];
    const adjusted=await call('adjust_attendance_times',[session,row.effective_check_in_at,row.effective_check_out_at,'Verified against supervisor field log.',row.version]);assert.ok(adjusted.version>row.version);
    const history=await call('attendance_session_history',[session]);assert.equal(history.adjustments.length,1);assert.equal(history.events.some(e=>e.event_type==='time_adjusted'),true);
  });

  await ok('approved daily-rate attendance creates exactly one existing payable day unit',async()=>{
    await as('ngo');const row=(await rows('select * from public.assignment_work_sessions where id=$1',[session]))[0];
    const approved=await call('review_attendance_session',[session,'approve','Verified field attendance.',row.version]);assert.equal(approved.status,'approved');assert.ok(approved.payable_unit_id);
    const units=await rows("select * from public.work_payable_units where assignment_id=$1 and source_kind='day'",[assignment]);assert.equal(units.length,1);assert.equal(
      dateOnly(units[0].work_date),
      dateOnly((await rows('select work_date::text d from public.assignment_work_sessions where id=$1',[session]))[0].d),
    );
    const recovered=await call('claim_work_payable',[assignment,units[0].work_date,'Approved attendance recovery check']);assert.equal(recovered,units[0].id);
  });

  await ok('attendance workspace returns manager totals while worker sees only own timesheet',async()=>{
    await as('ngo');const manager=await call('attendance_workspace',[project,dates.start,dates.finish,null,0]);assert.equal(manager.count,1);assert.equal(manager.summary.approved,1);assert.equal(manager.can_manage,true);
    await as('worker');const own=await call('attendance_workspace',[null,dates.start,dates.finish,null,0]);assert.equal(own.count,1);assert.equal(own.rows[0].assignment_id,assignment);assert.equal(own.can_manage,false);
  });

  console.log(`\n${passed} FieldLance 2.38 Attendance, Timesheets & Location Operations scenarios passed.`);
}finally{await db.close();}
