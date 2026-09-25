import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

let passed=0;
async function ok(name,fn){await fn();passed++;console.log('PASS',name)}
const migration=readFileSync('supabase/migrations/20261013000440_field_operations_map_geographic_quality.sql','utf8');
const mapUi=readFileSync('src/features/maps/FieldOperationsMap.tsx','utf8');
const boundaryUi=readFileSync('src/features/geography/GeographyBoundaryManager.tsx','utf8');
const routes=readFileSync('src/app/routes.ts','utf8');
const shell=readFileSync('src/app/AppShell.tsx','utf8');
const workspace=readFileSync('src/features/projects/ProjectWorkspace.tsx','utf8');
const delegated=readFileSync('src/features/cases/DelegatedCasesWorkspace.tsx','utf8');

await ok('2.40 reuses operational evidence instead of creating a parallel location system',async()=>{
  assert.match(migration,/assignment_session_locations/);
  assert.match(migration,/survey_responses/);
  assert.match(migration,/beneficiary_case_followups/);
  assert.doesNotMatch(migration,/create table public\.(survey_locations|attendance_locations|field_tracking|worker_tracking)\b/i);
  assert.match(migration,/create table public\.geography_boundaries/);
});

await ok('MapLibre is keyless and isolated from the location authority',async()=>{
  assert.match(mapUi,/MapLibre/);
  assert.match(mapUi,/MAPLIBRE_VERSION = "6\.11\.2"/);
  assert.match(mapUi,/maplibre-gl\.mjs/);
  assert.match(mapUi,/tiles\.openfreemap\.org\/styles\/liberty/);
  assert.doesNotMatch(mapUi,/google\.maps|maps\.googleapis|GOOGLE_MAP/i);
  assert.match(migration,/app_private\.location_quality/);
});

await ok('geographic quality is review-only and fails unknown when no boundary exists',async()=>{
  assert.match(migration,/within_assigned_area/);
  assert.match(migration,/outside_assigned_area/);
  assert.match(migration,/poor_accuracy/);
  assert.match(migration,/location_unavailable/);
  assert.match(migration,/unable_to_determine/);
  assert.match(migration,/if contained is null then return 'unable_to_determine'/);
  assert.match(mapUi,/review signal/i);
});

await ok('map authorization keeps workers personal and Area Focals geography-scoped',async()=>{
  assert.match(migration,/Personal field map can only show your own evidence/);
  assert.match(migration,/can_review_project_area/);
  assert.match(migration,/p_worker=auth\.uid\(\)/);
  assert.match(migration,/can_manage_project/);
  assert.match(migration,/case_delegate_active/);
  assert.match(migration,/revoke all on public\.geography_boundaries,public\.geography_boundary_revisions from public,anon,authenticated/);
  assert.doesNotMatch(migration,/grant execute on function app_private\.location_quality/i);
});

await ok('explicit case-visit evidence does not introduce continuous tracking',async()=>{
  assert.match(migration,/record_beneficiary_case_followup_location/);
  assert.match(migration,/location_recorded_by/);
  assert.match(migration,/Location evidence is only valid for visit follow-ups/);
  assert.match(delegated,/Capture current location/);
  assert.match(delegated,/No background tracking/i);
  assert.doesNotMatch(migration,/watchPosition|background geolocation|continuous tracking API/i);
});

await ok('project and personal map navigation are wired',async()=>{
  assert.match(routes,/\/app\/field\/map/);
  assert.match(shell,/My Field Map/);
  assert.match(shell,/FieldOperationsMap/);
  assert.match(workspace,/FieldOperationsMap/);
  assert.match(workspace,/id:\s*"map"/);
});

await ok('boundary administration keeps source/version audit and validates GeoJSON',async()=>{
  assert.match(migration,/valid_boundary_geojson/);
  assert.match(migration,/save_geography_boundary/);
  assert.match(migration,/source_version/);
  assert.match(migration,/geography_boundary_revisions/);
  assert.match(migration,/geography_boundary_saved/);
  assert.match(boundaryUi,/Polygon\/MultiPolygon/i);
  assert.match(boundaryUi,/source/i);
});

await ok('2.40 migration is appended directly after the 2.39 permission fix',async()=>{
  const migrations=readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort();
  const prior='20261013000431_case_ownership_task_rls_helper_permission.sql';
  const current='20261013000440_field_operations_map_geographic_quality.sql';
  assert.equal(migrations.indexOf(current),migrations.indexOf(prior)+1);
});

if(process.env.FIELDLANCE_STATIC_ONLY==='1'){console.log(`\n${passed} FieldLance 2.40.0 static contract checks passed.`);process.exit(0)}

const {schemaDb}=await import('./schema-test-db.mjs');
const db=await schemaDb();
const ids={
  super:'a2400000-0000-4000-8000-000000000001',ngo:'a2400000-0000-4000-8000-000000000002',pm:'a2400000-0000-4000-8000-000000000003',
  focalA:'a2400000-0000-4000-8000-000000000004',focalB:'a2400000-0000-4000-8000-000000000005',workerA:'a2400000-0000-4000-8000-000000000006',
  workerB:'a2400000-0000-4000-8000-000000000007',outsider:'a2400000-0000-4000-8000-000000000008',otherNgo:'a2400000-0000-4000-8000-000000000009'
};
const rows=async(q,p=[])=>(await db.query(q,p)).rows;
async function as(name){await db.exec('RESET ROLE');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[name?ids[name]:'']);await db.exec(`SET ROLE ${name?'authenticated':'anon'}`)}
async function call(name,args=[]){return (await rows(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args))[0].result}
const deny=(fn,re=/permission|required|access|authority|personal field map/i)=>assert.rejects(fn,re);

try{
  for(const [name,id] of Object.entries(ids))await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)',[id,`${name}@phase240.test`,JSON.stringify({full_name:name})]);
  await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.super]);
  await as('super');
  const org=await call('save_organization',[null,{name:'2.40 Field Map NGO',status:'active'}]);
  const otherOrg=await call('save_organization',[null,{name:'2.40 Other NGO',status:'active'}]);
  for(const u of ['ngo','pm','focalA','focalB'])await call('set_membership',[org,ids[u],u==='ngo'?'ngo_admin':'member','active']);
  await call('set_membership',[otherOrg,ids.otherNgo,'ngo_admin','active']);
  const province=await call('save_geography',[null,null,'province','2.40 Province','M240P','Map fixture',true]);
  const division=await call('save_geography',[null,province,'division','2.40 Division','M240D','Map fixture',true]);
  const districtA=await call('save_geography',[null,division,'district','2.40 District A','M240A','Map fixture',true]);
  const districtB=await call('save_geography',[null,division,'district','2.40 District B','M240B','Map fixture',true]);
  const squareA={type:'Polygon',coordinates:[[[66,24],[68,24],[68,26],[66,26],[66,24]]]};
  const squareB={type:'Polygon',coordinates:[[[68,24],[70,24],[70,26],[68,26],[68,24]]]};
  await call('save_geography_boundary',[districtA,squareA,'2.40 automated fixture','v1']);
  await call('save_geography_boundary',[districtB,squareB,'2.40 automated fixture','v1']);

  await ok('point-in-polygon quality classifies inside, outside, poor and unavailable safely',async()=>{
    await db.exec('RESET ROLE');
    assert.equal((await rows("select app_private.location_quality($1,25,67,20,100) q",[districtA]))[0].q,'within_assigned_area');
    assert.equal((await rows("select app_private.location_quality($1,25,69,20,100) q",[districtA]))[0].q,'outside_assigned_area');
    assert.equal((await rows("select app_private.location_quality($1,25,67,150,100) q",[districtA]))[0].q,'poor_accuracy');
    assert.equal((await rows("select app_private.location_quality($1,null,null,null,100) q",[districtA]))[0].q,'location_unavailable');
    assert.equal((await rows("select app_private.location_quality($1,25,67,20,100) q",[province]))[0].q,'unable_to_determine');
  });

  const template=await call('publish_survey_template',['2.40 Map Template',[{id:'gps',label:'Collection location',type:'gps',required:false},{id:'q',label:'Question',type:'text',required:true}]]);
  const dates=(await rows("select (current_date-2)::text start,(current_date+20)::text finish,current_date::text today"))[0];
  const project=await call('create_survey_project',[org,'2.40 Field Map Project',template,province,100,dates.start,dates.finish,'Field operations map fixture','v1','Obtain consent and capture explicit GPS when allowed.']);

  await as('ngo');
  await call('assign_project_staff',[project,ids.pm,'project_manager',[],dates.start,dates.finish]);
  await call('assign_project_staff',[project,ids.focalA,'area_focal_person',[districtA],dates.start,dates.finish]);
  await call('assign_project_staff',[project,ids.focalB,'area_focal_person',[districtB],dates.start,dates.finish]);
  await db.exec('RESET ROLE');
  for(const [worker,geo,label] of [[ids.workerA,districtA,'Map Worker A'],[ids.workerB,districtB,'Map Worker B']]){
    await db.query("update public.volunteer_profiles set status='verified',geography_id=$1,details=jsonb_build_object('full_name',$2) where user_id=$3",[geo,label,worker]);
    await db.query('insert into public.survey_assignments(project_id,user_id,active,collection_geography_id) values($1,$2,true,$3)',[project,worker,geo]);
  }
  const hhA=(await rows('insert into public.registry_households(project_id,label,geography_id,created_by) values($1,$2,$3,$4) returning id',[project,'Map A',districtA,ids.workerA]))[0].id;
  const hhB=(await rows('insert into public.registry_households(project_id,label,geography_id,created_by) values($1,$2,$3,$4) returning id',[project,'Map B',districtB,ids.workerB]))[0].id;
  const personA=(await rows("insert into public.registry_persons(project_id,household_id,full_name,birth_date,created_by) values($1,$2,'Map Person A','1990-01-01',$3) returning id",[project,hhA,ids.workerA]))[0].id;
  const personB=(await rows("insert into public.registry_persons(project_id,household_id,full_name,birth_date,created_by) values($1,$2,'Map Person B','1991-01-01',$3) returning id",[project,hhB,ids.workerB]))[0].id;
  const now=(await rows("select now()::text t"))[0].t;
  const insertResponse=async(person,worker,geo,gps)=>rows("insert into public.survey_responses(project_id,person_id,collector_id,answers,consent,status,review_note,reviewed_by,reviewed_at,collection_geography_id) values($1,$2,$3,$4::jsonb,$5::jsonb,'approved','Map fixture',$6,now(),$7) returning id",[project,person,worker,JSON.stringify({gps,q:'ok'}),JSON.stringify({agreed:true,method:'verbal'}),ids.ngo,geo]);
  const sourceResponse=(await insertResponse(personA,ids.workerA,districtA,{latitude:25,longitude:67,accuracy:20,captured_at:now}))[0].id;
  await insertResponse(personA,ids.workerA,districtA,{latitude:25,longitude:69,accuracy:20,captured_at:now});
  await insertResponse(personA,ids.workerA,districtA,{latitude:25,longitude:67,accuracy:250,captured_at:now});
  await insertResponse(personA,ids.workerA,districtA,{unavailable_reason:'Location permission unavailable'});
  await insertResponse(personB,ids.workerB,districtB,{latitude:25,longitude:69,accuracy:20,captured_at:now});

  await ok('project manager sees authorized multi-worker evidence and quality summary',async()=>{
    await as('pm');const result=await call('field_operations_map',[project,dates.start,dates.finish,null,null,100]);
    assert.equal(result.summary.total,5);
    assert.equal(result.summary.within_assigned_area,2);
    assert.equal(result.summary.outside_assigned_area,1);
    assert.equal(result.summary.poor_accuracy,1);
    assert.equal(result.summary.location_unavailable,1);
    assert.equal(result.boundaries.length,2);
  });

  await ok('Area Focal only receives evidence inside delegated geography',async()=>{
    await as('focalA');const result=await call('field_operations_map',[project,dates.start,dates.finish,null,null,100]);
    assert.equal(result.rows.length,4);
    assert.equal(result.rows.every(x=>x.worker_id===ids.workerA&&x.geography_id===districtA),true);
    assert.equal(result.rows.some(x=>x.worker_id===ids.workerB),false);
  });

  await ok('worker personal map cannot query another worker and only returns own evidence',async()=>{
    await as('workerA');
    await deny(()=>call('field_operations_map',[null,dates.start,dates.finish,ids.workerB,null,100]));
    const result=await call('field_operations_map',[null,dates.start,dates.finish,null,null,100]);
    assert.equal(result.scope.personal,true);
    assert.equal(result.rows.length,4);
    assert.equal(result.rows.every(x=>x.worker_id===ids.workerA),true);
  });

  await ok('unrelated organization/account cannot open the project field map',async()=>{
    await as('otherNgo');await deny(()=>call('field_operations_map',[project,dates.start,dates.finish,null,null,100]));
    await as('outsider');await deny(()=>call('field_operations_map',[project,dates.start,dates.finish,null,null,100]));
  });

  const caseId='b2400000-0000-4000-8000-000000000001',followId='c2400000-0000-4000-8000-000000000001';
  await as('pm');
  await call('create_beneficiary_case',[caseId,personA,sourceResponse,null,'2.40 visit evidence case','Validate explicit case visit evidence on the project map','medium',dates.today,'Field map visit fixture']);
  await call('set_beneficiary_case_owner',[caseId,ids.workerA,'field_worker','Delegate visit evidence fixture',null,null]);
  await as('workerA');
  await call('create_beneficiary_case_followup',[followId,caseId,null,null,'field_visit',dates.today,'Capture explicit visit location for the field map']);
  await call('record_beneficiary_case_followup_location',[followId,25.2,67.2,18,'granted','',now,'24000000-0000-4000-8000-000000000201']);
  await ok('delegated visit location is explicit, scoped and appears as case follow-up evidence',async()=>{
    await as('pm');const result=await call('field_operations_map',[project,dates.start,dates.finish,ids.workerA,districtA,100]);
    const visit=result.rows.find(x=>x.layer==='case_follow_up'&&x.source_id===followId);assert.ok(visit);assert.equal(visit.quality,'within_assigned_area');
  });

  await db.exec('RESET ROLE');
  const assignment=(await rows(`insert into public.work_assignments(survey_project_id,organization_id,user_id,volunteer_name,organization_name,project_title,source_kind,work_mode,compensation_type,currency,rate,target_surveys,start_date,end_date,terms_note,status,offered_by,responded_at,collection_geography_id) values($1,$2,$3,'Map Worker A','2.40 Field Map NGO','2.40 Field Map Project','shortlist','volunteer','none','PKR',null,10,$4,$5,'Map attendance fixture','active',$6,now(),$7) returning id`,[project,org,ids.workerA,dates.start,dates.finish,ids.ngo,districtA]))[0].id;
  await as('ngo');await call('set_project_attendance_policy',[project,'UTC','optional',100]);
  await as('workerA');
  const times=(await rows("select (now()-interval '2 hours')::text a,(now()-interval '1 hour')::text b"))[0];
  const started=await call('start_assignment_work_session',[assignment,times.a,25,67,15,'granted','','24000000-0000-4000-8000-000000000101']);
  await call('checkout_assignment_work_session',[started.id,times.b,25.1,67.1,15,'granted','','Map fixture checkout','24000000-0000-4000-8000-000000000102',started.version]);

  await ok('attendance check-in/out evidence is exposed without a second attendance location table',async()=>{
    await as('pm');const result=await call('field_operations_map',[project,dates.start,dates.finish,ids.workerA,districtA,100]);
    assert.equal(result.rows.some(x=>x.layer==='attendance_check_in'),true);
    assert.equal(result.rows.some(x=>x.layer==='attendance_check_out'),true);
    assert.equal(result.rows.filter(x=>x.layer.startsWith('attendance_')).every(x=>x.quality==='within_assigned_area'),true);
  });

  await ok('historical location evidence remains after assignment closure',async()=>{
    await db.exec('RESET ROLE');await db.query("update public.work_assignments set status='completed' where id=$1",[assignment]);
    await as('pm');const result=await call('field_operations_map',[project,dates.start,dates.finish,ids.workerA,districtA,100]);
    assert.equal(result.rows.some(x=>x.layer==='attendance_check_in'),true);
    assert.equal(result.rows.some(x=>x.layer==='attendance_check_out'),true);
  });

  await ok('project moderation does not erase authorized historical field evidence',async()=>{
    await db.exec('RESET ROLE');await db.query("update public.survey_projects set moderation_status='blocked',moderation_reason='2.40 historical evidence fixture' where id=$1",[project]);
    await as('pm');const result=await call('field_operations_map',[project,dates.start,dates.finish,ids.workerA,districtA,100]);
    assert.ok(result.rows.length>=1);assert.equal(result.rows.some(x=>x.layer==='survey'),true);
  });

  console.log(`\n${passed} FieldLance 2.40.0 Field Operations Map & Geographic Quality scenarios passed.`);
}finally{await db.close()}
