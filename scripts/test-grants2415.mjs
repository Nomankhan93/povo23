// Real local catalog regression; default privileges are probed in rolled-back transactions.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const database=process.env.FIELDLANCE_GRANTS_DATABASE || 'postgres';
if(!['fieldlance_2415_validation','postgres'].includes(database))throw Error('Unexpected local database');
function sql(query){return execFileSync('docker',['exec','-i','supabase_db_poem-phase11','sh','-c',
 'PGPASSWORD="$POSTGRES_PASSWORD" psql -w -h 127.0.0.1 -U supabase_admin -d '+database+' -v ON_ERROR_STOP=1 -At'],{input:query,encoding:'utf8'}).trim();}
assert.equal(sql("select has_function_privilege('postgres','app_private.has_accepted_collection_assignment(uuid,uuid)','EXECUTE') and not has_function_privilege('authenticated','app_private.has_accepted_collection_assignment(uuid,uuid)','EXECUTE')"),'t');
const excessive=sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join (values ('anon'),('authenticated')) r(role) cross join (values ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege) where n.nspname='public' and c.relkind in ('r','p') and has_table_privilege(r.role,c.oid,p.privilege)");
assert.equal(excessive,'0');
assert.equal(sql("select has_table_privilege('authenticated','public.survey_capture_files','SELECT') and not has_table_privilege('authenticated','public.survey_capture_files','INSERT') and not has_table_privilege('anon','public.survey_capture_files','UPDATE')"),'t');
assert.equal(sql("select has_function_privilege('authenticated','public.respond_work_assignment(uuid,text,integer)','EXECUTE') and not has_function_privilege('anon','public.respond_work_assignment(uuid,text,integer)','EXECUTE')"),'t');
assert.equal(sql("select has_table_privilege('service_role','public.operational_tasks','TRUNCATE') and has_table_privilege('authenticated','storage.objects','INSERT')"),'t');
// Only postgres-owned future tables are enforceable by hosted migrations.
for(const owner of ['postgres']){
 const output=sql("begin; set local role "+owner+"; create table public.fieldlance_2415_acl_probe(id integer); select count(*) from (values ('anon'),('authenticated')) r(role) cross join (values ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege) where has_table_privilege(r.role,'public.fieldlance_2415_acl_probe',p.privilege); rollback;");
 assert.match(output,/\n0\n/);
}
console.log('PASS real PostgreSQL effective grants, required Storage/RPC access and postgres creator default ACLs:',database);

// Report the platform-managed policy separately; never describe it as hardened.
// Read-only catalog evidence retains visibility of every unexpected grant.
const managed=sql("select coalesce(json_agg(x),'[]'::json)::text from (select a.grantee::regrole::text role,a.privilege_type from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a where d.defaclrole='supabase_admin'::regrole and d.defaclnamespace in (0,'public'::regnamespace) and d.defaclobjtype='r' and a.grantee in ('anon'::regrole,'authenticated'::regrole) and a.privilege_type in ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')) x");
const managedProbe=sql("begin; create table public.fieldlance_2415_managed_probe(id integer); select count(*) from (values ('anon'),('authenticated')) r(role) cross join (values ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege) where has_table_privilege(r.role,'public.fieldlance_2415_managed_probe',p.privilege); rollback;");
const managedCount=Number(managedProbe.match(/CREATE TABLE\n(\d+)\nROLLBACK/)[1]);
assert.equal(sql("select to_regclass('public.fieldlance_2415_managed_probe') is null"),'t');
console.log('PLATFORM DEFAULT POLICY:',managedCount ? 'NEEDS FOLLOW-UP' : 'PASS',
 'effective excessive grants:',managedCount,'catalog:',managed);

// Reproduce the hosted privilege boundary without changing persistent ACLs.
// The real local postgres role must be non-superuser and cannot use the internal
// supabase_admin role. No role memberships or ownership are changed for this test.
const migration=readFileSync('supabase/migrations/20261013000500_application_table_privileges.sql','utf8');
const portability=sql(`
begin;
do $check$ begin
 if (select rolsuper from pg_roles where rolname='postgres')
    or pg_has_role('postgres','supabase_admin','USAGE') then
  raise exception 'Portability test requires non-superuser postgres without supabase_admin privileges';
 end if;
end;$check$;
grant truncate,references,trigger,maintain on
 public.survey_capture_files,public.operational_task_sla_policies,
 public.operational_tasks,public.operational_task_events,
 public.worker_availability_preferences,public.worker_availability_rules,
 public.worker_unavailable_periods to anon,authenticated;
grant insert,update,delete on public.survey_capture_files to anon,authenticated;
alter default privileges for role postgres in schema public grant all on tables to anon,authenticated;
alter default privileges for role supabase_admin in schema public grant all on tables to anon,authenticated;
select set_config('fieldlance.test_admin_acl',(select defaclacl::text from pg_default_acl
 where defaclrole='supabase_admin'::regrole and defaclnamespace='public'::regnamespace and defaclobjtype='r'),true);
set local role postgres;
${migration}
do $check$ begin
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 cross join (values ('anon'),('authenticated')) r(role)
 cross join (values ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege)
 where n.nspname='public' and c.relkind in ('r','p')
 and has_table_privilege(r.role,c.oid,p.privilege)) then
  raise exception 'Portable migration left excessive effective privileges';
 end if;
 if exists(select 1 from (values ('anon'),('authenticated')) r(role)
 cross join (values ('INSERT'),('UPDATE'),('DELETE')) p(privilege)
 where has_table_privilege(r.role,'public.survey_capture_files',p.privilege)) then
  raise exception 'Capture metadata permits direct browser writes';
 end if;
end;$check$;
create table public.fieldlance_2415_portability_probe(id integer);
do $check$ begin
 if exists(select 1 from (values ('anon'),('authenticated')) r(role)
 cross join (values ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege)
 where has_table_privilege(r.role,'public.fieldlance_2415_portability_probe',p.privilege)) then
  raise exception 'Postgres future defaults remain excessive';
 end if;
 if not has_table_privilege('authenticated','public.survey_capture_files','SELECT')
 or not has_function_privilege('authenticated','public.respond_work_assignment(uuid,text,integer)','EXECUTE')
 or not has_table_privilege('service_role','public.operational_tasks','TRUNCATE') then
  raise exception 'Required application access was lost';
 end if;
 if (select defaclacl::text from pg_default_acl where defaclrole='supabase_admin'::regrole
 and defaclnamespace='public'::regnamespace and defaclobjtype='r')
 is distinct from current_setting('fieldlance.test_admin_acl') then
  raise exception 'Inaccessible internal defaults were changed';
 end if;
end;$check$;
select 'portable-postgres-pass';
rollback;
`);
assert.match(portability,/portable-postgres-pass/);
assert.equal(sql("select to_regclass('public.fieldlance_2415_portability_probe') is null"),'t');
console.log('PASS non-superuser postgres replay, F10, future defaults, unchanged internal defaults and rollback');
