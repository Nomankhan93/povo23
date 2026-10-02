import assert from 'node:assert/strict';
import {schemaDb} from './schema-test-db.mjs';
const db=await schemaDb(),worker='a4170000-0000-4000-8000-000000000001',admin='a4170000-0000-4000-8000-000000000002',other='a4170000-0000-4000-8000-000000000003';
const rows=async(q,p=[])=>(await db.query(q,p)).rows;
async function as(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+(id?'authenticated':'anon'))}
const call=async(name,args=[])=>(await rows('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') value',args))[0].value;
try{
 assert.equal((await rows("select pg_get_function_result('public.simulate_mock_e_wallet_provider(uuid,text,uuid)'::regprocedure) result"))[0].result,'jsonb');
 for(const id of [worker,admin,other])await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",[id,id+'@example.test',{full_name:'Wallet Test'}]);
 await db.query("update public.accounts set platform_role='super_admin' where id=$1",[admin]);
 await as(worker);
 assert.deepEqual(await call('wallet_capabilities'),{sandbox_enabled:false,enrollment_available:false,production_verification_available:false,verification_mode:'unavailable'});
 await db.query("select set_config('app.wallet_sandbox_enabled','true',false)");
 await assert.rejects(()=>call('save_my_e_wallet',['jazzcash','Wallet Test','03001234567']),/unavailable/);
 await assert.rejects(()=>db.exec('update app_private.wallet_capabilities set sandbox_enabled=true'),/permission/);
 for(const id of [worker,admin]){
  await as(id);
  for(const [name,args]of [
   ['simulate_mock_e_wallet_verification',[worker,'verified',crypto.randomUUID()]],
   ['simulate_mock_e_wallet_activation',[worker,crypto.randomUUID()]],
   ['simulate_mock_e_wallet_provider',[worker,'succeeded',crypto.randomUUID()]],
   ['admin_mock_e_wallet_queue',[]]
  ])await assert.rejects(()=>call(name,args),/sandbox is disabled/);
 }
 await db.exec('reset role');
 for(const role of ['anon','authenticated','service_role']){
  assert.equal((await rows("select has_table_privilege($1,'app_private.wallet_capabilities','update') allowed",[role]))[0].allowed,false);
  for(const fn of ['save_my_e_wallet(text,text,text)','simulate_mock_e_wallet_verification(uuid,text,uuid)','simulate_mock_e_wallet_activation(uuid,uuid)','simulate_mock_e_wallet_provider(uuid,text,uuid)','admin_mock_e_wallet_queue()']){
   assert.equal((await rows('select has_function_privilege($1,$2,$3) allowed',[role,'app_private.'+fn,'execute']))[0].allowed,false);
  }
 }
 console.log('PASS production defaults closed; forged session flag and direct/private capability bypass denied for workers and admins');
 await db.exec('update app_private.wallet_capabilities set sandbox_enabled=true');
 await as(worker);const wallet=await call('save_my_e_wallet',['jazzcash','Wallet Test','03001234567']);
 await assert.rejects(()=>call('simulate_mock_e_wallet_verification',[wallet,'verified',crypto.randomUUID()]),/Admin.*access/);
 await as(other);assert.equal((await call('my_e_wallets')).rows.length,0);
 await assert.rejects(()=>call('set_default_e_wallet',[wallet]),/own|Verified|wallet/i);
 await as(admin);await call('simulate_mock_e_wallet_verification',[wallet,'verified',crypto.randomUUID()]);await call('simulate_mock_e_wallet_activation',[wallet,crypto.randomUUID()]);
 await as(worker);const pending=await call('save_my_e_wallet',['easypaisa','Wallet Test','03007654321']);
 await db.exec('reset role');
 const before=await rows('select * from public.e_wallets order by id'),events=await rows('select * from public.e_wallet_verification_events order by id');
 await db.exec('update app_private.wallet_capabilities set sandbox_enabled=false');
 await as(worker);const readable=await call('my_e_wallets');assert.equal(readable.rows.length,2);assert.equal(readable.rows.find(w=>w.id===wallet).withdrawal_eligible,true);assert.equal(readable.rows.find(w=>w.id===pending).withdrawal_eligible,false);
 await assert.rejects(()=>call('request_e_wallet_withdrawal',[pending,100,'123456',crypto.randomUUID()]),/Verified own/);
 await assert.rejects(()=>call('save_my_e_wallet',['easypaisa','Wallet Test','03007654321']),/unavailable/);
 await db.exec('reset role');assert.deepEqual(await rows('select * from public.e_wallets order by id'),before);assert.deepEqual(await rows('select * from public.e_wallet_verification_events order by id'),events);
 await as(null);await assert.rejects(()=>call('wallet_capabilities'),/permission/);
 console.log('PASS explicit isolated sandbox retains admin-only mocks; cross-user denial; production keeps historical rows and existing eligibility without verifying pending wallets');
}finally{await db.close()}
