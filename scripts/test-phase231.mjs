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


  const report=(orgId=null,projectId=null,geo=null,from=null,to=null,kind=null,status=null,offset=0,exported=false)=>call('operational_report',[orgId,projectId,geo,from,to,kind,status,offset,exported]);
  await ok('analytics preserves focal geography and excludes beneficiary identities',async()=>{
    await as('focal');const x=await report(null,project,null,null,null,'responses');
    assert.equal(x.total,1);assert.equal(x.rows[0].id,responseA);assert.ok(!JSON.stringify(x).includes('Area Alpha Person'));
    assert.equal((await report(null,project,talukaB,null,null,'responses')).total,0);
    await deny(()=>report(null,project,null,null,null,'finance'));
    await deny(()=>report(org));
  });
  await ok('manager has project reports but no finance or organization-wide escalation',async()=>{
    await as('manager');assert.equal((await report(null,project,null,null,null,'responses')).total,2);
    await deny(()=>report(null,project,null,null,null,'finance'));await deny(()=>report(org));await deny(()=>report());
  });
  await ok('worker and anonymous users cannot open operational reports',async()=>{
    await as('collectorA');await deny(()=>report(null,project));await deny(()=>report());
    await as(null);await deny(()=>report());
  });
  await as('super');
  const otherOrg=await call('save_organization',[null,{name:'Foreign Reporting Organization',status:'active'}]);
  const otherProject=await call('create_survey_project',[otherOrg,'Foreign private project',template,district,100,dates.start,dates.finish,'Foreign reporting test project','a14','Consent notice for reporting test.']);
  await ok('organization scope cannot include or export foreign project records',async()=>{
    await as('ngo');const x=await report(org,null,null,null,null,'projects');assert.equal(x.total,1);
    await deny(()=>report(otherOrg));await deny(()=>report(null,otherProject));
    await assert.rejects(()=>report(org,otherProject),/permission|match/);
    const csv=await report(org,null,null,null,null,'projects',null,0,true);assert.equal(csv.rows.some(r=>r.project_id===otherProject),false);
  });
  await db.exec('reset role');
  await db.query("insert into public.survey_responses(project_id,person_id,collector_id,answers,consent,status,collection_geography_id,created_at) select project_id,person_id,collector_id,answers,consent,'correction_required',collection_geography_id,'2026-01-31 23:59:59+00'::timestamptz from public.survey_responses cross join generate_series(1,601) where id=$1",[responseA]);
  await ok('exact totals exceed old 500-row cap and pagination has no overlap',async()=>{
    await as('ngo');const a=await report(org,project,null,null,null,'responses');const b=await report(org,project,null,null,null,'responses',null,50);
    assert.equal(a.total,603);assert.equal(a.totals.responses,603);assert.equal(a.counts['responses.correction_required'],601);
    assert.equal(a.rows.length,50);assert.equal(b.rows.length,50);assert.equal(a.rows.some(x=>b.rows.some(y=>x.id===y.id)),false);
  });
  await ok('UTC date boundaries, trends and status drill-down agree',async()=>{
    const x=await report(org,project,null,'2026-01-31','2026-01-31','responses','correction_required');
    assert.equal(x.total,601);assert.equal(x.trend.reduce((n,r)=>n+r.n,0),601);
    assert.equal((await report(org,project,null,'2026-02-01','2026-02-01','responses')).total,0);
    assert.equal((await report(org,project,null,null,null,'responses','__review')).total,603);
    await assert.rejects(()=>report(org,project,null,'2026-02-02','2026-01-01'),/date range/);
  });
  await ok('export includes all filtered rows and records an audit event',async()=>{
    const x=await report(org,project,null,null,null,'responses','correction_required',0,true);assert.equal(x.rows.length,601);
    await db.exec('reset role');const e=(await rows("select detail from public.audit_events where action='analytics_export_requested' order by id desc limit 1"))[0];assert.equal(e.detail.rows,601);
  });
  await db.query("insert into public.survey_responses(project_id,person_id,collector_id,answers,consent,status,collection_geography_id) select project_id,person_id,collector_id,answers,consent,'submitted',collection_geography_id from public.survey_responses cross join generate_series(1,5001) where id=$1",[responseA]);
  await ok('exports over 5000 are refused rather than silently truncated',async()=>{
    await as('ngo');await assert.rejects(()=>report(org,project,null,null,null,'responses',null,0,true),/5000/);
  });
  await ok('finance exports separate currencies and deny operational-only roles',async()=>{
    // Owner fixtures isolate reporting; existing finance suites validate posting workflows.
    await db.exec('reset role');
    const assignment=(await rows("insert into public.work_assignments(survey_project_id,organization_id,user_id,volunteer_name,organization_name,project_title,source_kind,work_mode,compensation_type,target_surveys,start_date,end_date,offered_by,status) values($1,$2,$3,'Reporting worker','Reporting organization','Reporting project','shortlist','volunteer','none',1,$4,$5,$6,'cancelled') returning id",[project,org,ids.collectorA,dates.start,dates.finish,ids.super]))[0].id;
    for(const currency of ['PKR','USD']){
      const unit=(await rows("insert into public.work_payable_units(assignment_id,source_kind,work_date,rate,currency,terms_snapshot,note) values($1,'day',$2,10,$3,'{}','Reporting fixture') returning id",[assignment,currency==='PKR'?dates.start:dates.finish,currency]))[0].id;
      await db.query("insert into public.work_payable_events(unit_id,assignment_id,kind,amount,note) values($1,$2,'dispute',0,'Reporting fixture event')",[unit,assignment]);
    }
    await as('ngo');const x=await report(org,project,null,null,null,'finance',null,0,true);
    assert.deepEqual(x.money.map(m=>m.currency).sort(),['PKR','USD']);assert.ok(x.money.every(m=>m.state==='dispute'&&Number(m.amount)===0));
    await as('manager');await deny(()=>report(null,project,null,null,null,'finance',null,0,true));
    const hidden=await rows('select * from app_private.analytics_finance_rows()');assert.equal(hidden.length,0);
    await as('super');assert.equal((await report(null,project,null,null,null,'finance')).total,2);
  });
  await ok('revoked membership removes old-session report access immediately',async()=>{
    await db.exec('reset role');await db.query("update public.organization_memberships set status='suspended' where organization_id=$1 and user_id=$2",[org,ids.focal]);
    await as('focal');await deny(()=>report(null,project));
  });
  console.log(`\n${passed} FieldLance 2.31 analytics scenarios passed.`);
}finally{await db.close()}
