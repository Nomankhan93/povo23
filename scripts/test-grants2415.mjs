// Real local catalog regression; default privileges are probed in rolled-back transactions.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
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
for(const owner of ['postgres','supabase_admin']){
 const output=sql("begin; set local role "+owner+"; create table public.fieldlance_2415_acl_probe(id integer); select count(*) from (values ('anon'),('authenticated')) r(role) cross join (values ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege) where has_table_privilege(r.role,'public.fieldlance_2415_acl_probe',p.privilege); rollback;");
 assert.match(output,/\n0\n/);
}
console.log('PASS real PostgreSQL effective grants, required Storage/RPC access and both creator default ACLs:',database);
