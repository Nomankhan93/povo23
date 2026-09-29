import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

const migration=readFileSync('supabase/migrations/20261013000460_map_completeness_evidence_review.sql','utf8');
const mapUi=readFileSync('src/features/maps/FieldOperationsMap.tsx','utf8');
const routes=readFileSync('src/app/routes.ts','utf8');
const shell=readFileSync('src/app/AppShell.tsx','utf8');
const workspace=readFileSync('src/features/projects/ProjectWorkspace.tsx','utf8');
const surveyProjects=readFileSync('src/features/surveys/SurveyProjects.tsx','utf8');
const surveyDetail=readFileSync('src/features/surveys/SurveyProjectDetail.tsx','utf8');

export async function mapReviewStatic(ok){
  await ok('2.41.1 migration is a forward append after 2.40.1 stabilization',async()=>{
    const migrations=readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql')).sort();
    const prior='20261013000450_field_evidence_attendance_stabilization.sql';
    const current='20261013000460_map_completeness_evidence_review.sql';
    assert.equal(migrations.indexOf(current),migrations.indexOf(prior)+1);
  });

  await ok('2.41.1 paged map contract preserves the legacy map RPC and adds keyset pagination',async()=>{
    assert.match(migration,/create function public\.field_operations_map_page\(/);
    assert.match(migration,/p_cursor_at timestamptz/);
    assert.match(migration,/\(f\.captured_at,f\.evidence_id\) < \(p_cursor_at,p_cursor_id\)/);
    assert.match(migration,/limit page_size\+1/);
    assert.match(migration,/'matched_total'/);
    assert.match(migration,/'has_more'/);
    assert.match(migration,/'next_cursor'/);
    assert.doesNotMatch(migration,/drop function public\.field_operations_map\b/i);
  });

  await ok('2.41.1 applies operational filters before true totals and page slicing',async()=>{
    const filtered=migration.indexOf('), filtered as (');
    const cursor=migration.indexOf('), cursor_rows as (');
    assert.ok(filtered>0&&cursor>filtered);
    for(const token of ['p_worker is null','p_geography is null','p_status is null','p_quality is null','p_layers is null','p_review_only'])assert.match(migration,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    assert.match(migration,/'matched_total',\(select count\(\*\) from filtered\)/);
    assert.match(migration,/'workers'/);
    assert.match(migration,/'geographies'/);
    assert.match(migration,/'statuses'/);
  });

  await ok('2.41.1 boundary output is derived only from authorized page/project scope',async()=>{
    assert.match(migration,/select distinct geography_id from page_rows/);
    assert.doesNotMatch(migration,/union select p_geography where p_geography is not null/i);
    assert.match(migration,/where app_private\.valid_boundary_geojson\(b\.geometry\)/);
  });

  await ok('2.41.1 evidence rows expose source actions only when the current actor may read the source',async()=>{
    assert.match(migration,/source_openable/);
    assert.match(migration,/can_manage_attendance_project/);
    assert.match(migration,/can_review_project_area/);
    assert.match(migration,/case_delegate_active/);
    assert.match(mapUi,/row\.source_openable/);
  });

  await ok('2.41.1 UI distinguishes matched totals from loaded evidence and removes the twelve-row review slice',async()=>{
    assert.match(mapUi,/matching evidence/i);
    assert.match(mapUi,/currently loaded/i);
    assert.match(mapUi,/Partial map view/i);
    assert.match(mapUi,/Load more evidence/);
    assert.doesNotMatch(mapUi,/\.slice\(0,\s*12\)/);
    assert.match(mapUi,/Needs review only/);
  });

  await ok('2.41.1 keeps evidence review usable when the renderer or basemap fails',async()=>{
    assert.match(mapUi,/Basemap unavailable/);
    assert.match(mapUi,/evidence list remains available/i);
    assert.match(mapUi,/map\.on\("error"/);
    assert.match(mapUi,/field-map-evidence-list/);
    assert.match(mapUi,/getClusterExpansionZoom/);
  });

  await ok('2.41.1 source navigation supports response, attendance assignment and case context',async()=>{
    assert.match(routes,/"response"/);
    assert.match(routes,/\/responses\//);
    assert.match(routes,/\/field-work\/assignments\//);
    assert.match(shell,/source_kind === "response"/);
    assert.match(workspace,/source_kind === "attendance"/);
    assert.match(workspace,/source_kind === "case"/);
    assert.match(surveyProjects,/initialResponseId/);
    assert.match(surveyDetail,/survey_responses/);
    assert.match(surveyDetail,/collector_id/);
  });
}

export async function mapReviewRegression({db,as,call,rows,ok,ids,project,personA,districtA,districtB,dates}){
  await ok('2.41.1 project manager receives true totals and duplicate-free keyset pages above 2,500 records',async()=>{
    await db.exec('RESET ROLE');
    await db.query(`
      insert into public.survey_responses(project_id,person_id,collector_id,answers,consent,status,collection_geography_id,created_at,updated_at)
      select $1,$2,$3,
        jsonb_build_object('gps',jsonb_build_object('latitude',25,'longitude',67,'accuracy',20,'captured_at',(now()-(g||' seconds')::interval)::text),'q','2.41.1 bulk'),
        '{"agreed":true,"method":"fixture"}'::jsonb,'submitted',$4,now()-(g||' seconds')::interval,now()-(g||' seconds')::interval
      from generate_series(1,2605) g
    `,[project,personA,ids.workerA,districtA]);
    await as('pm');
    let cursorAt=null,cursorId=null,matched=null,pages=0;
    const seen=[];
    do{
      const result=await call('field_operations_map_page',[project,dates.start,dates.finish,null,null,'submitted',null,['survey'],false,cursorAt,cursorId,500]);
      pages++;
      matched ??= result.summary.matched_total;
      assert.equal(result.summary.matched_total,matched);
      assert.ok(result.pagination.returned<=500);
      assert.equal(result.rows.every(x=>x.layer==='survey'&&x.status==='submitted'),true);
      for(const row of result.rows)seen.push(row.id);
      if(result.pagination.has_more){assert.ok(result.pagination.next_cursor);cursorAt=result.pagination.next_cursor.captured_at;cursorId=result.pagination.next_cursor.id;}
      else{cursorAt=null;cursorId=null;break;}
      assert.ok(pages<20,'pagination did not converge');
    }while(true);
    assert.ok(matched>=2605);
    assert.equal(seen.length,matched);
    assert.equal(new Set(seen).size,seen.length);
    assert.ok(pages>=6);
  });

  await ok('2.41.1 server quality/worker filters keep totals, rows and source permissions aligned',async()=>{
    await as('pm');
    const result=await call('field_operations_map_page',[project,dates.start,dates.finish,ids.workerA,districtA,'submitted','within_assigned_area',['survey'],false,null,null,200]);
    assert.ok(result.summary.matched_total>=2605);
    assert.equal(result.rows.every(x=>x.worker_id===ids.workerA&&x.geography_id===districtA&&x.status==='submitted'&&x.quality==='within_assigned_area'),true);
    assert.equal(result.rows.every(x=>x.source_kind==='response'&&x.source_openable===true),true);
  });

  await ok('2.41.1 Area Focal paging remains geography-scoped and cannot request another area boundary',async()=>{
    await as('focalA');
    const own=await call('field_operations_map_page',[project,dates.start,dates.finish,null,null,'submitted',null,['survey'],false,null,null,100]);
    assert.ok(own.summary.matched_total>=2605);
    assert.equal(own.rows.every(x=>x.geography_id===districtA&&x.worker_id===ids.workerA),true);
    const other=await call('field_operations_map_page',[project,dates.start,dates.finish,null,districtB,'submitted',null,['survey'],false,null,null,100]);
    assert.equal(other.summary.matched_total,0);
    assert.equal(other.rows.length,0);
    assert.equal(other.boundaries.some(x=>x.geography_id===districtB),false);
  });

  await ok('2.41.1 worker personal paging is own-only and unrelated organizations remain denied',async()=>{
    await as('workerA');
    await assert.rejects(()=>call('field_operations_map_page',[null,dates.start,dates.finish,ids.workerB,null,null,null,null,false,null,null,100]),/personal field map/i);
    const personal=await call('field_operations_map_page',[null,dates.start,dates.finish,null,null,'submitted',null,['survey'],false,null,null,100]);
    assert.ok(personal.summary.matched_total>=2605);
    assert.equal(personal.rows.every(x=>x.worker_id===ids.workerA),true);
    await as('otherNgo');
    await assert.rejects(()=>call('field_operations_map_page',[project,dates.start,dates.finish,null,null,null,null,null,false,null,null,100]),/access required/i);
    await as('outsider');
    await assert.rejects(()=>call('field_operations_map_page',[project,dates.start,dates.finish,null,null,null,null,null,false,null,null,100]),/access required/i);
  });
  await ok('2.41.1 historical survey source actions honor revoked project access',async()=>{
    await db.exec('RESET ROLE');
    await db.query('update public.survey_assignments set active=false where project_id=$1 and user_id=$2',[project,ids.workerA]);
    try {
      await as('workerA');
      const personal=await call('field_operations_map_page',[null,dates.start,dates.finish,null,null,null,null,['survey'],false,null,null,20]);
      assert.ok(personal.rows.length>0,'own historical map evidence should remain available');
      assert.equal(personal.rows.every(x=>x.source_openable===false),true);
      assert.equal((await rows('select id from public.survey_responses where project_id=$1',[project])).length,0);
    } finally {
      await db.exec('RESET ROLE');
      await db.query('update public.survey_assignments set active=true where project_id=$1 and user_id=$2',[project,ids.workerA]);
    }
  });
}

if(import.meta.url===`file://${process.argv[1]}`){
  let passed=0;
  const ok=async(name,fn)=>{await fn();passed++;console.log('PASS',name)};
  await mapReviewStatic(ok);
  console.log(`\n${passed} FieldLance 2.41.1 static map review checks passed.`);
}
