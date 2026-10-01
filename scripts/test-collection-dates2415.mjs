import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {schemaDb} from './schema-test-db.mjs';

// The same transactional assertions run against all migrations in PGlite and a
// disposable real PostgreSQL database. Never run this fixture against postgres.
const database=process.env.FIELDLANCE_DATE_DATABASE;
if(database)assert.equal(database,'fieldlance_2415_validation');
const sql=String.raw`
begin;
create function pg_temp.check_date_guard(value boolean,label text) returns void language plpgsql as $f$
begin if value is distinct from true then raise exception 'Date guard regression: %',label;end if;end;$f$;
do $test$
declare
 admin_id uuid:=gen_random_uuid();worker_id uuid:=gen_random_uuid();legacy_id uuid:=gen_random_uuid();
 pm_id uuid:=gen_random_uuid();focal_id uuid:=gen_random_uuid();
 org uuid;area uuid;template uuid;project uuid;opportunity uuid;application uuid;offer uuid;
 today date:=(now() at time zone 'UTC')::date;
 snapshot jsonb;window_record record;member_id uuid;
begin
 insert into auth.users(id,email) values
 (admin_id,'date-admin@example.test'),(worker_id,'date-worker@example.test'),
 (legacy_id,'date-legacy@example.test'),(pm_id,'date-pm@example.test'),(focal_id,'date-focal@example.test');
 update public.accounts set platform_role='super_admin' where id=admin_id;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 set local role authenticated;
 org:=public.save_organization(null,'{"name":"Date guard regression","status":"active"}'::jsonb);
 area:=public.save_geography(null,null,'province','Date regression','DATE2415','Disposable regression',true);
 template:=public.publish_survey_template('Date guard template','[{"id":"q","label":"Question","type":"text","required":true}]'::jsonb);
 project:=public.create_survey_project(org,'Date guard project',template,area,100,today-10,today+10,'Date guard regression purpose','2415','Disposable date guard consent');
 perform public.set_membership(org,pm_id,'member','active');
 perform public.set_membership(org,focal_id,'member','active');
 perform public.assign_project_staff(project,pm_id,'project_manager','{}'::uuid[],today-10,today+10);
 perform public.assign_project_staff(project,focal_id,'area_focal_person',array[area],today-10,today+10);
 reset role;
 update public.volunteer_profiles set status='verified',geography_id=area where user_id in (worker_id,legacy_id);
 insert into public.survey_assignments(project_id,user_id,active) values(project,legacy_id,false);
 select id into opportunity from public.work_opportunities where survey_project_id=project and marketplace_current;
 perform set_config('request.jwt.claim.sub',worker_id::text,true);
 set local role authenticated;
 application:=public.apply_work_opportunity(opportunity,'Available','Date regression',true);
 reset role;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 set local role authenticated;
 perform public.review_work_application(application,'selected','Date regression selection',1);
 offer:=public.create_work_assignment(project,worker_id,'application',application,'volunteer','none','PKR',null,10,today-10,today+10,'Explicit date regression terms');
 reset role;
 perform set_config('request.jwt.claim.sub',worker_id::text,true);
 set local role authenticated;
 perform public.respond_work_assignment(offer,'accepted',1);
 reset role;
 select to_jsonb(w) into snapshot from public.work_assignments w where id=offer;

 for window_record in select * from (values
 ('A current project',-10,10,true),
 ('B/F future project changed after acceptance',1,10,false),
 ('C/F expired project changed after acceptance',-10,-1,false),
 ('D project starts today',0,10,true),
 ('E project ends today',-10,0,true),
 ('G restored current project',-10,10,true)
 ) dates(label,start_offset,end_offset,expected)
 loop
  update public.survey_projects set start_date=today+window_record.start_offset,end_date=today+window_record.end_offset where id=project;
  perform pg_temp.check_date_guard((select to_jsonb(w)=snapshot from public.work_assignments w where id=offer),'contract remains unchanged: '||window_record.label);
  perform set_config('request.jwt.claim.sub',worker_id::text,true);
  set local role authenticated;
  perform pg_temp.check_date_guard(app_private.can_collect(project)=window_record.expected,'can_collect: '||window_record.label);
  perform pg_temp.check_date_guard(public.can_collect_project(project)=window_record.expected,'public eligibility: '||window_record.label);
  reset role;
  perform pg_temp.check_date_guard(app_private.can_collect_before_governance(project)=window_record.expected,'compatibility helper: '||window_record.label);

  -- Legacy administrative activation is retained, but cannot bypass effective dates.
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  set local role authenticated;
  perform public.set_survey_assignment(project,worker_id,true);
  perform public.set_survey_assignment_scope(project,worker_id,area,true);
  perform pg_temp.check_date_guard(app_private.can_review_survey(project),'admin review: '||window_record.label);
  perform public.set_survey_assignment(project,worker_id,false);
  reset role;
  perform set_config('request.jwt.claim.sub',worker_id::text,true);
  set local role authenticated;
  perform pg_temp.check_date_guard(not app_private.can_collect(project),'revocation: '||window_record.label);
  reset role;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  set local role authenticated;
  perform public.set_survey_assignment_scope(project,worker_id,area,true);
  reset role;
  perform set_config('request.jwt.claim.sub',worker_id::text,true);
  set local role authenticated;
  perform pg_temp.check_date_guard(app_private.can_collect(project)=window_record.expected,'scope cannot bypass date gate: '||window_record.label);
  reset role;

  perform set_config('request.jwt.claim.sub',legacy_id::text,true);
  set local role authenticated;
  perform pg_temp.check_date_guard(not app_private.can_collect(project),'H direct-only denied: '||window_record.label);
  reset role;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  set local role authenticated;
  begin
   perform public.set_survey_assignment(project,legacy_id,true);
   raise exception 'Legacy activation unexpectedly succeeded';
  exception when raise_exception then
   if sqlerrm not like 'Worker acceptance required%' then raise;end if;
  end;
  begin
   perform public.set_survey_assignment_scope(project,legacy_id,area,true);
   raise exception 'Legacy scope unexpectedly succeeded';
  exception when raise_exception then
   if sqlerrm not like 'Worker acceptance required%' then raise;end if;
  end;
  reset role;
  foreach member_id in array array[pm_id,focal_id]
  loop
   perform set_config('request.jwt.claim.sub',member_id::text,true);
   set local role authenticated;
   perform pg_temp.check_date_guard(app_private.can_review_project_area(project,area),'I staff review: '||window_record.label);
   perform pg_temp.check_date_guard(not app_private.can_collect(project),'staff does not gain worker collection');
   if member_id=pm_id then
    perform pg_temp.check_date_guard(app_private.can_manage_project(project),'Project Manager administration');
   end if;
   reset role;
  end loop;
 end loop;
end;$test$;
rollback;
`;
if(database){
 const output=execFileSync('docker',['exec','-i','supabase_db_poem-phase11','sh','-c',
 'PGPASSWORD="$POSTGRES_PASSWORD" psql -w -h 127.0.0.1 -U supabase_admin -d '+database+' -v ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});
 assert.match(output,/ROLLBACK/);
 console.log('PASS real PostgreSQL date-boundary scenarios A-I; fixture transaction rolled back');
}else{
 const db=await schemaDb();
 try{await db.exec(sql);console.log('PASS all-migration date-boundary scenarios A-I (six windows, unchanged contract, legacy RPCs, revocation and staff review)');}
 finally{await db.close();}
}
