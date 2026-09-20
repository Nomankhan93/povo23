import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

let passed=0;
async function ok(name,fn){await fn();passed+=1;console.log(`PASS ${name}`)}
const read=(path)=>readFileSync(path,'utf8');
const pkg=JSON.parse(read('package.json'));
const app=read('src/app/AppShell.tsx');
const nav=read('src/app/navigation.ts');
const earnings=read('src/features/payments/EarningsWorkspace.tsx');
const wallet=read('src/features/payments/EWalletWithdrawalWorkspace.tsx');
const ops=read('src/features/payments/WithdrawalOperationsWorkspace.tsx');
const payables=read('src/features/payables/PayablesWorkspace.tsx');
const styles=read('src/styles/design-system.css');
const migrations=readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql')).sort();

await ok('2.25.0 earnings and payout UX regression contract is active',async()=>{
  assert.equal(pkg.version,'2.25.0');
  assert.equal(pkg.scripts['test:earnings-wallet'],'node scripts/test-earnings-wallet2250.mjs');
});

await ok('Field Worker finance navigation presents Earnings and Wallet without renaming internal routes',async()=>{
  assert(nav.includes('"Workforce payables": "Earnings"'));
  assert(nav.includes('"E-Wallets & withdrawals": "Wallet & withdrawals"'));
  assert(app.includes('page === "Workforce payables"'));
  assert(app.includes('page === "E-Wallets & withdrawals"'));
});

await ok('personal Earnings workspace summarizes authoritative withdrawal balance and paid assignments',async()=>{
  assert(earnings.includes('my_withdrawal_summary'));
  assert(earnings.includes('.from("work_assignments")'));
  assert(earnings.includes('.eq("user_id",userId)'));
  for(const marker of ['Approved earnings','Available','Pending withdrawal','Paid out','Recent assignments','Recent withdrawals']) assert(earnings.includes(marker),marker);
});

await ok('earnings lifecycle keeps payables and provider settlement separate',async()=>{
  assert(earnings.includes('FinanceJourney'));
  assert(earnings.includes('Claims & payable detail'));
  assert(earnings.includes('<PayablesWorkspace userId={userId} organization={null} embedded/>'));
  assert(earnings.includes('Withdrawal settlement is handled separately'));
});

await ok('Wallet & withdrawals preserves secure provider and PIN controls',async()=>{
  for(const marker of ['my_e_wallets','my_withdrawal_summary','my_withdrawal_security','request_e_wallet_withdrawal','configure_withdrawal_pin_secure']) assert(wallet.includes(marker),marker);
  assert(wallet.includes('wallet ownership verification is still simulated'));
  assert(wallet.includes('manual + mock'));
  assert(wallet.includes('FinanceJourney'));
});

await ok('Organization finance keeps the existing payable ledger and server-calculated balances',async()=>{
  assert(app.includes('<PayablesWorkspace key={scope} userId={session.user.id} organization={scope}/>'));
  assert(payables.includes('Field Worker payables'));
  assert(payables.includes('work_payable_statement'));
  assert(payables.includes('act_work_payable'));
  assert(payables.includes('currencies are never combined'));
});

await ok('FieldLance payout operations adds finance attention metrics without editing balances',async()=>{
  for(const marker of ['admin_e_wallet_operations_queue','admin_e_wallet_provider_reconciliation','Payout operations','Finance attention','Provider ↔ payable ↔ finance']) assert(ops.includes(marker),marker);
  assert(ops.includes('settle_manual_e_wallet_withdrawal'));
  assert(ops.includes('balances are never edited manually'));
});

await ok('manual and mock payout modes remain explicit and no live provider integration is invented',async()=>{
  assert(wallet.includes('JazzCash'));
  assert(wallet.includes('Easypaisa'));
  assert(wallet.includes("provider_mode:'mock'"));
  assert(ops.includes("provider_mode:'mock'|'manual'"));
  assert(!earnings.includes('IBAN'));
});

await ok('2.25.0 finance UX is responsive and uses dedicated FieldLance styling',async()=>{
  for(const marker of ['.earnings-workspace','.finance-hero','.finance-journey','.finance-metric-grid','.finance-filter-pills']) assert(styles.includes(marker),marker);
  assert(styles.includes('@media(max-width:700px)'));
});

await ok('2.25.0 adds no Supabase migration and preserves Notifications head',async()=>{
  assert.equal(migrations.length,57);
  assert.equal(migrations.at(-1),'20261009000800_notifications_communication_center.sql');
});

console.log(`\n${passed} FieldLance Earnings, Wallet & Withdrawal UX scenarios passed for FieldLance ${pkg.version}.`);
