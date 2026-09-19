import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {schemaDb} from './schema-test-db.mjs';

const db=await schemaDb();
let passed=0;
const worker='a1830000-0000-4000-8000-000000000001';
const rows=async(q,p=[])=>(await db.query(q,p)).rows;
async function asWorker(){
  await db.exec('RESET ROLE');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[worker]);
  await db.exec('SET ROLE authenticated');
}
async function ok(name,fn){await fn();passed+=1;console.log(`PASS ${name}`)}
const deny=(fn,re=/permission|finance administration|POEM Admin|not authorized/i)=>assert.rejects(fn,re);

try{
  await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)',[worker,'worker2183@example.test',JSON.stringify({full_name:'Release QA Worker'})]);

  await ok('2.18.3 is migration-free and retains its payment database boundary at 00930',async()=>{
    const migrations=readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort();
    assert.ok(
      migrations.includes('20261008000930_withdrawal_operations_manual_settlement.sql'),
      '2.18.3 payment boundary migration 00930 must remain present',
    );
    assert.equal(
      migrations.some(x=>x.includes('2183')||x.includes('00940')),
      false,
      '2.18.3 must remain migration-free',
    );
  });

  await ok('authenticated browser role has no direct SELECT on sensitive payout tables',async()=>{
    for(const table of ['e_wallets','e_wallet_security','e_wallet_withdrawals','e_wallet_withdrawal_allocations','e_wallet_provider_events','e_wallet_verification_events','e_wallet_manual_operations']){
      const [{allowed}]=await rows("select has_table_privilege('authenticated',$1,'select') allowed",[`public.${table}`]);
      assert.equal(allowed,false,`${table} unexpectedly readable directly`);
    }
  });

  await ok('ordinary account cannot use POEM provider/finance operations',async()=>{
    await asWorker();
    await deny(()=>rows('select public.admin_e_wallet_operations_queue(null,null,50)'));
    await deny(()=>rows('select public.admin_e_wallet_provider_reconciliation(null,null,50)'));
    await deny(()=>rows("select public.configure_e_wallet_payout_policy(100,500,1000,500,true)"));
    await deny(()=>rows("select public.simulate_mock_e_wallet_activation('00000000-0000-4000-8000-000000000000'::uuid,'00000000-0000-4000-8000-000000000001'::uuid)"));
  });

  await ok('historical 2.18 UI regression now asserts current manual/mock semantics without brittle obsolete copy',async()=>{
    const test=readFileSync('scripts/test-phase218.mjs','utf8');
    assert.doesNotMatch(test,/assert\.match\(ui,\/Development sandbox/i);
    assert.ok(
      test.includes("assert.match(ui,/manual \\+ mock/i);"),
      'Phase 2.18 regression must assert the current manual + mock UI label',
    );
    assert.match(test,/mock sandbox remains available for development testing/i);
  });

  await ok('2.18.1 activation idempotency regression compares timestamp values',async()=>{
    const test=readFileSync('scripts/test-phase2181.mjs','utf8');
    assert.match(test,/new Date\(second\)\.toISOString\(\),new Date\(first\)\.toISOString\(\)/);
  });

  await ok('2.18.2 regression respects RPC-only withdrawal-table security',async()=>{
    const test=readFileSync('scripts/test-phase2182.mjs','utf8');
    assert.doesNotMatch(test,/select version from public\.e_wallet_withdrawals/i);
    assert.match(test,/my_e_wallet_withdrawals/);
    assert.match(test,/admin_e_wallet_operations_queue/);
  });

  await ok('release source remains JazzCash/Easypaisa-only with mock/manual modes and no bank/live API claim',async()=>{
    const files=[
      'src/features/payments/EWalletWithdrawalWorkspace.tsx',
      'src/features/payments/MockEWalletSandbox.tsx',
      'src/features/payments/WithdrawalOperationsWorkspace.tsx',
      'docs/PHASE-2.18.3.md',
    ].map(path=>readFileSync(path,'utf8')).join('\n');
    assert.match(files,/JazzCash/i);
    assert.match(files,/Easypaisa/i);
    assert.match(files,/manual/i);
    assert.match(files,/mock/i);
    assert.doesNotMatch(files,/\bIBAN\b|Bank Account|bank transfer/i);
  });

  await ok('package exposes one canonical payment release regression command through 2.18.3',async()=>{
    const pkg=JSON.parse(readFileSync('package.json','utf8'));
    const phaseDoc=readFileSync('docs/PHASE-2.18.3.md','utf8');
    assert.match(phaseDoc,/2\.18\.3/);
    assert.match(pkg.scripts['test:payments'],/test-phase217\.mjs/);
    assert.match(pkg.scripts['test:payments'],/test-phase2183\.mjs/);
    for(const phase of ['217','2171','2172','218','2181','2182','2183'])assert.match(pkg.scripts['test:payments'],new RegExp(`test-phase${phase}\\.mjs`));
  });

  console.log(`\n${passed} POEM 2.18.3 payments release consolidation / operations QA scenarios passed.`);
} finally {await db.close()}
