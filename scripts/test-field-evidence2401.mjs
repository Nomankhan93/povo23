import assert from 'node:assert/strict';
export async function evidenceRegression({db,as,call,rows,ok,ids,caseId,followId,now,dates,districtA,squareA}){
  await ok('2.40.1 legacy capture increments version and retains complete revision history',async()=>{
    await db.exec('RESET ROLE');
    const revisions=await rows('select version,snapshot from public.beneficiary_case_followup_revisions where followup_id=$1 order by version',[followId]);
    assert.deepEqual(revisions.map(r=>r.version),[1,2]);
    assert.equal(revisions[0].snapshot.location_permission_state,null);
    assert.equal(revisions[1].snapshot.location_latitude,25.2);
    await as('workerA');const detail=await call('my_delegated_case_detail',[caseId]);
    const f=detail.followups.find(f=>f.id===followId);
    assert.equal(f.location_permission_state,'granted');assert.equal(f.location_latitude,25.2);
    assert.equal(f.version,2);assert.equal(f.location_recorded_by,ids.workerA);assert.ok(f.location_received_at);
  });
  const visit='c2400000-0000-4000-8000-000000000002',request='24000000-0000-4000-8000-000000000202';
  const args=[visit,25,67,20,'granted','',now,request,1];
  await as('workerA');await call('create_beneficiary_case_followup',[visit,caseId,null,null,'office_visit',dates.today,'Version-aware field evidence regression']);
  await ok('2.40.1 versioned capture validates state, preserves exact retry and rejects overwrite',async()=>{
    await assert.rejects(()=>call('record_beneficiary_case_followup_location_versioned',[...args.slice(0,8),99]),/changed/);
    await assert.rejects(()=>call('record_beneficiary_case_followup_location_versioned',[visit,25,67,20,null,'',now,request,1]),/permission/);
    await assert.rejects(()=>call('record_beneficiary_case_followup_location_versioned',[visit,25,67,20,'unavailable','no GPS',now,request,1]),/without coordinates/);
    const first=await call('record_beneficiary_case_followup_location_versioned',args);assert.equal(first.version,2);
    assert.deepEqual(await call('record_beneficiary_case_followup_location_versioned',args),first);
    await assert.rejects(()=>call('record_beneficiary_case_followup_location_versioned',[visit,26,...args.slice(2)]),/different actor or evidence/);
    await assert.rejects(()=>call('record_beneficiary_case_followup_location_versioned',[...args.slice(0,7),'24000000-0000-4000-8000-000000000299',2]),/already recorded/);
    await as('pm');await assert.rejects(()=>call('record_beneficiary_case_followup_location_versioned',args),/different actor or evidence/);
    await as('outsider');await assert.rejects(()=>call('record_beneficiary_case_followup_location_versioned',args),/access required/);
    await as(null);await assert.rejects(()=>call('record_beneficiary_case_followup_location_versioned',args),/permission denied/);
    await db.exec('RESET ROLE');assert.equal((await rows('select count(*)::int n from public.beneficiary_case_followup_revisions where followup_id=$1',[visit]))[0].n,2);
    await as('workerA');await call('cancel_beneficiary_case_followup',[visit,'Test finalized follow-up',2]);
    await as('workerA');assert.equal((await call('record_beneficiary_case_followup_location_versioned',args)).version,3);
  });
  await ok('2.40.1 rejects incomplete GeoJSON and classifies malformed historic boundaries as unknown',async()=>{
    await db.exec('RESET ROLE');
    for(const value of [null,{},[],{type:'Feature'},{type:'Polygon'},{type:'Polygon',coordinates:null},{type:'Polygon',coordinates:[]},{type:'Polygon',coordinates:[null]},{type:'Polygon',coordinates:[[null,null,null,null]]},{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,null]]]},{type:'MultiPolygon',coordinates:[[]]}]){
      assert.equal((await rows('select app_private.valid_boundary_geojson($1::jsonb) valid',[JSON.stringify(value)]))[0].valid,false,JSON.stringify(value));
    }
    for(const value of [squareA,{type:'Feature',geometry:squareA},{type:'MultiPolygon',coordinates:[squareA.coordinates]}])assert.equal((await rows('select app_private.valid_boundary_geojson($1::jsonb) valid',[JSON.stringify(value)]))[0].valid,true);
    const hole={type:'Polygon',coordinates:[squareA.coordinates[0],[[66.5,24.5],[67.5,24.5],[67.5,25.5],[66.5,25.5],[66.5,24.5]]]};
    assert.equal((await rows('select app_private.geometry_contains_point($1::jsonb,25,67) inside',[JSON.stringify(hole)]))[0].inside,false);
    await as('super');await assert.rejects(()=>call('save_geography_boundary',[districtA,{},'Malformed boundary fixture','bad']),/GeoJSON|boundary|Polygon/i);
    await db.exec('RESET ROLE');
    // Simulate pre-patch malformed data without changing historical migration files.
    await db.exec('alter table public.geography_boundaries disable trigger user');
    await db.query('update public.geography_boundaries set geometry=$1::jsonb where geography_id=$2',[JSON.stringify({}),districtA]);
    assert.equal((await rows('select app_private.location_quality($1,25,67,20,100) q',[districtA]))[0].q,'unable_to_determine');
    await db.query('update public.geography_boundaries set geometry=$1::jsonb where geography_id=$2',[JSON.stringify(squareA),districtA]);
    await db.exec('alter table public.geography_boundaries enable trigger user');
  });
}
