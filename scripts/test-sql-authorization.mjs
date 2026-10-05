// Full-chain regression for private-helper and anonymous API grant boundaries.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {schemaDb} from './schema-test-db.mjs';
const db=await schemaDb();
try {
 // PGlite does not install Supabase automatic grants. Seed the excessive
 // anonymous table ACLs explicitly, then prove the actual migration removes them.
 await db.exec('grant all on public.survey_capture_files,public.operational_task_sla_policies,public.operational_tasks,public.operational_task_events to anon');
 await db.exec(readFileSync('supabase/migrations/20261013000560_private_helper_and_anonymous_grants.sql','utf8'));
 const actor='aa560000-0000-4000-8000-000000000001';
 const person='aa560000-0000-4000-8000-000000000002';
 await db.query("insert into auth.users(id,email) values($1,'sql-authorization@example.test')",[actor]);
 await db.query("insert into public.canonical_persons(id,display_name,created_by) values($1,'Private canonical fixture',$2)",[person,actor]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
 await db.exec('set role authenticated');
 await assert.rejects(()=>db.query("select app_private.capture_canonical_revision($1,'Unauthorized revision',$2)",[person,actor]),/permission denied/);
 await db.exec('reset role');
 assert.equal((await db.query('select count(*)::int n from public.canonical_person_revisions where canonical_person_id=$1',[person])).rows[0].n,0);
 // Trusted definer owner retains access: legitimate internal snapshots still work.
 await db.query("select app_private.capture_canonical_revision($1,'Authorized internal revision',$2)",[person,actor]);
 assert.equal((await db.query('select count(*)::int n from public.canonical_person_revisions where canonical_person_id=$1',[person])).rows[0].n,1);
 for(const role of ['anon','authenticated']){
  for(const fn of ['app_private.capture_canonical_revision(uuid,text,uuid)','app_private.ensure_canonical_person()']){
   assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,fn])).rows[0].allowed,false);
  }
 }
 for(const table of ['survey_capture_files','operational_task_sla_policies','operational_tasks','operational_task_events']){
  for(const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']){
   assert.equal((await db.query("select has_table_privilege('anon',$1,$2) allowed",['public.'+table,privilege])).rows[0].allowed,false);
  }
  assert.equal((await db.query("select has_table_privilege('authenticated',$1,'SELECT') allowed",['public.'+table])).rows[0].allowed,true);
 }
 assert.equal((await db.query("select has_function_privilege('anon','public.project_staff_candidates(uuid,text)','EXECUTE') allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select has_function_privilege('authenticated','public.project_staff_candidates(uuid,text)','EXECUTE') allowed")).rows[0].allowed,true);
 assert.equal((await db.query("select has_function_privilege('anon','public.verify_field_worker_certificate(text)','EXECUTE') allowed")).rows[0].allowed,true);
 console.log('PASS private mutations denied, trusted snapshot preserved, anonymous table/RPC grants removed, authenticated and public certificate contracts retained');
} finally {await db.close();}
