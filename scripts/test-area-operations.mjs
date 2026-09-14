import assert from 'node:assert/strict';import {schemaDb} from './schema-test-db.mjs';const db=await schemaDb();let count=0;const admin='72000000-0000-4000-8000-000000000001',other='72000000-0000-4000-8000-000000000002';
const q=async(s,p=[]) => (await db.query(s,p)).rows;const rpc=async(n,args)=>(await q(`select public.${n}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args))[0].result;
async function actor(id){await db.exec('RESET ROLE');await q("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('SET ROLE authenticated')}
async function test(n,f){await f();console.log('PASS '+n);count++}
try{
await q('insert into auth.users(id,email) values($1,$2),($3,$4)',[admin,'area-admin@example.test',other,'area-other@example.test']);await q("update public.accounts set platform_role='super_admin' where id=$1",[admin]);await actor(admin);
const org=await rpc('save_organization',[null,{name:'Area pilot',status:'active'}]);let parent=null;const ids={};for(const k of ['province','division','district','taluka','uc','village']){ids[k]=await rpc('save_geography',[null,parent,k,'Test '+k,'AREA-'+k,'Synthetic fixture',true]);parent=ids[k]}
ids.ward=await rpc('save_geography',[null,ids.uc,'ward','Test ward','AREA-ward','Synthetic fixture',true]);
const version=async()=>(await q('select operations_version v from public.organizations where id=$1',[org]))[0].v;
const save=async(areas,v)=>rpc('save_ngo_operations',[org,areas,['Education'],v??await version()]);
await test('district taluka UC village and ward round-trip without duplicates',async()=>{await save([ids.district,ids.taluka,ids.uc,ids.village,ids.ward,ids.uc]);assert.equal((await q('select * from public.organization_areas where organization_id=$1',[org])).length,5)});
await test('stale save fails without losing saved areas',async()=>{await assert.rejects(()=>save([],0),/changed/);assert.equal((await q('select * from public.organization_areas where organization_id=$1',[org])).length,5)});
await db.exec('RESET ROLE');await q('update public.geographies set active=false where id=$1',[ids.taluka]);await actor(admin);
await test('saved inactive subtree is retained when programs are saved',async()=>{await save([ids.taluka,ids.uc,ids.village]);assert.equal((await q('select * from public.organization_areas where organization_id=$1',[org])).length,3)});
await test('removed inactive area cannot be newly re-added',async()=>{await save([ids.uc,ids.village]);await assert.rejects(()=>save([ids.taluka,ids.uc,ids.village]),/active/)});
await test('province and unknown ID rejected without mutation',async()=>{await assert.rejects(()=>save([ids.province]),/active/);await assert.rejects(()=>save([crypto.randomUUID()]),/active/);assert.equal((await q('select * from public.organization_areas where organization_id=$1',[org])).length,2)});
await actor(other);await test('ordinary account cannot change NGO operations',async()=>assert.rejects(()=>rpc('save_ngo_operations',[org,[],[],1]),/permission/));
console.log(count+' area operations SQL scenarios passed');
}finally{await db.close()}
