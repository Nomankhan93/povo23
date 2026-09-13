import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {schemaDb} from './schema-test-db.mjs';

let passed=0;
async function ok(name,fn){await fn();passed++;console.log('PASS '+name)}
async function denied(fn,re){await assert.rejects(fn,re)}
const db=await schemaDb();
const ids={vol:'91000000-0000-4000-8000-000000000001',other:'91000000-0000-4000-8000-000000000002',admin:'91000000-0000-4000-8000-000000000003',ngo:'91000000-0000-4000-8000-000000000004'};
const rows=async(q,p=[]) => (await db.query(q,p)).rows;
async function as(who){await db.exec('RESET ROLE');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who?ids[who]:'']);await db.exec('SET ROLE '+(who?'authenticated':'anon'));}
async function call(name,args){return (await rows(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args))[0].result}
try{
 const app=readFileSync('src/app/AppShell.tsx','utf8');
 const form=readFileSync('src/features/volunteers/ProfileForm.tsx','utf8');
 await ok('profile page keeps work experience and private documents as separate sidebar destinations',async()=>{
   assert.match(app,/\["Work experience", Users\]/);
   assert.match(app,/\["Private documents", ShieldCheck\]/);
   const profileBlock=app.slice(app.indexOf('page === "My profile"'),app.indexOf('page === "Volunteers"'));
   assert(!profileBlock.includes('<ExperiencePanel'));
   assert(!profileBlock.includes('<Documents'));
 });
 await ok('profile UI publishes directly and includes photo controls',async()=>{
   assert.match(app,/publish_my_profile/);
   assert.match(form,/Published changes go live immediately/);
   assert.match(form,/ProfilePhoto/);
   assert(!app.includes('change("Verification")'));
 });

 for(const [name,id] of Object.entries(ids)) await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,`${name}@example.test`,JSON.stringify({full_name:name})]);
 await db.query("update public.accounts set platform_role='super_admin' where id=$1",[ids.admin]);
 const geo=(await rows("select id from public.geographies where code='PKREF-SD-D05-DS03-T02'"))[0]?.id || (await rows("select id from public.geographies where kind='taluka' order by code limit 1"))[0].id;
 const details={full_name:'Direct Publish Volunteer',phone:'03001234567',address:'House 1 Test Road Kunri',union_council:'',bio:'Community volunteer',education:'Bachelor\'s',skills:'Survey / Data Collection',languages:'Sindhi, Urdu',availability:'Full-time',preference:'Volunteer',transport:'Motorcycle',smartphone:'Available',preferred_areas:'[]',references:'[]'};

 await as('vol');
 await call('publish_my_profile',[JSON.stringify(details),1,geo]);
 await ok('profile publishes immediately without admin review',async()=>{
   const p=(await rows('select * from public.volunteer_profiles where user_id=$1',[ids.vol]))[0];
   assert.equal(p.status,'verified');
   assert.equal(p.reviewed_by,null);
   assert.equal(p.reviewed_at,null);
   assert((await rows("select * from public.audit_events where subject_id=$1 and action='profile_published'",[ids.vol])).length===1);
 });
 const v2=(await rows('select version from public.volunteer_profiles where user_id=$1',[ids.vol]))[0].version;
 await call('publish_my_profile',[JSON.stringify({...details,bio:'Updated immediately'}),v2,geo]);
 await ok('published profile remains active after volunteer edits',async()=>{
   const p=(await rows('select status,details from public.volunteer_profiles where user_id=$1',[ids.vol]))[0];
   assert.equal(p.status,'verified');
   assert.equal(p.details.bio,'Updated immediately');
 });

 await db.exec('RESET ROLE');
 await db.query('select app_private.invalidate_document_review($1)',[ids.vol]);
 await ok('private document review hook no longer unpublishes profile',async()=>{
   assert.equal((await rows('select status from public.volunteer_profiles where user_id=$1',[ids.vol]))[0].status,'verified');
 });

 await as('vol');
 const path=`${ids.vol}/profile`;
 await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['poem-profile-photos',path,'{"size":1000,"mimetype":"image/jpeg"}']);
 await call('set_profile_photo',[true]);
 await ok('owner can register a private profile photo',async()=>{
   const p=(await rows('select photo_path,photo_updated_at from public.volunteer_profiles where user_id=$1',[ids.vol]))[0];
   assert.equal(p.photo_path,path);assert(p.photo_updated_at);

   // Bucket configuration is privileged catalog metadata.
   // Inspect it as the test harness owner, not as the authenticated volunteer.
   await db.exec('RESET ROLE');
   const bucket=(await rows("select * from storage.buckets where id='poem-profile-photos'"))[0];
   assert.equal(bucket.public,false);assert.equal(Number(bucket.file_size_limit),2097152);
 });
 await as('other');
 await ok('unrelated volunteer cannot read another profile photo object',async()=>assert.equal((await rows("select * from storage.objects where bucket_id='poem-profile-photos'")).length,0));

 await as('admin');
 const org=await call('save_organization',[null,JSON.stringify({name:'Photo Partner NGO',status:'active'})]);
 await call('set_membership',[org,ids.ngo,'ngo_admin','active']);
 await as('vol');await call('set_profile_sharing',[org,true]);
 await as('ngo');
 await ok('authorized shared-profile NGO can read the profile photo object',async()=>{
   const objects=await rows("select name from storage.objects where bucket_id='poem-profile-photos'");
   assert.equal(objects.length,1);assert.equal(objects[0].name,path);
 });

 await as('vol');
 await db.query("delete from storage.objects where bucket_id='poem-profile-photos' and name=$1",[path]);
 await call('set_profile_photo',[false]);
 await ok('owner can remove profile photo metadata',async()=>assert.equal((await rows('select photo_path from public.volunteer_profiles where user_id=$1',[ids.vol]))[0].photo_path,null));

 console.log(`\n${passed} Phase 2.7.4 profile-independence/photo tests passed.`);
} finally { await db.close(); }
