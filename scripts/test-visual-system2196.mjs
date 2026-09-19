import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
const read=(p)=>readFileSync(p,'utf8');
let passed=0;
const ok=(name,fn)=>{fn();passed+=1;console.log(`PASS ${name}`)};

const pkg=JSON.parse(read('package.json'));
const css=read('src/styles/design-system.css');
const auth=read('src/features/auth/Auth.tsx');
const intent=read('src/features/auth/entryIntent.ts');
const shell=read('src/app/AppShell.tsx');
const nav=read('src/app/navigation.ts');
const brand=read('src/components/ui/FieldLanceBrand.tsx');
const overview=read('src/components/ui/WorkflowOverview.tsx');

ok('release is FieldLance 2.19.6 with a dedicated visual-system test command',()=>{
  assert.equal(pkg.name,'fieldlance-platform');
  assert.equal(pkg.version,'2.19.6');
  assert.equal(pkg.scripts['test:visual-system'],'node scripts/test-visual-system2196.mjs');
});

ok('approved wordmark is used for full brand surfaces while the supplied FL icon remains the compact identity',()=>{
  assert.match(brand,/fieldlance-wordmark\.png/);
  assert.match(brand,/fieldlance-icon\.png/);
  assert.match(brand,/variant='wordmark'/);
  assert.match(brand,/fieldlance-brand-wordmark/);
  assert.match(brand,/fieldlance-brand-compact/);
  assert.match(auth,/<FieldLanceBrand variant="wordmark" \/>/);
  assert.match(auth,/<FieldLanceBrand variant="compact" \/>/);
});

ok('public workspace labels are Field Worker Organization and FieldLance Staff while internal keys stay compatible',()=>{
  assert.match(auth,/label: "Field Worker"/);
  assert.match(auth,/label: "Organization"/);
  assert.match(auth,/label: "FieldLance Staff"/);
  assert.match(intent,/"volunteer" \| "ngo" \| "poem"/);
  assert.match(auth,/entry === "poem"/);
  assert.match(intent,/poem-workspace-entry-intent/);
});

ok('navigation groups are centralized and include worker earnings recruitment and administration',()=>{
  assert.equal(existsSync('src/app/navigation.ts'),true);
  for(const label of ['Overview','Work & earnings','People & recruitment','Field operations','Administration']) assert.match(nav,new RegExp(`label: "${label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}"`));
  for(const page of ['Available Opportunities','My Applications','My Assigned Surveys','Recruitment','E-Wallets & withdrawals','Withdrawal operations','Beneficiary cases','Assistance ledger']) assert.match(nav,new RegExp(`"${page.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}"`));
  assert.match(shell,/from "\.\/navigation"/);
});

ok('canonical FieldLance tokens define navy blue emerald canvas surface status colors and legacy aliases',()=>{
  for(const token of ['--fieldlance-deep-navy:#041426','--fieldlance-navy:#071a32','--fieldlance-blue:#0a78d8','--fieldlance-emerald:#00b96f','--fieldlance-canvas:#f6f8fc','--fieldlance-surface:#ffffff']) assert.match(css,new RegExp(token));
  assert.match(css,/--poem-navy:var\(--fieldlance-navy\)/);
  assert.match(css,/--poem-teal:var\(--fieldlance-blue\)/);
});

ok('sidebar uses the dark FieldLance shell with blue selection and emerald active indicator',()=>{
  assert.match(css,/\.app>\.sidebar\{[^}]*background:var\(--fieldlance-deep-navy\)/);
  assert.match(css,/\.sidebar nav button\.active\{[^}]*background:#0c3761[^}]*var\(--fieldlance-emerald\)/);
  assert.match(shell,/<FieldLanceBrand variant="wordmark" \/>/);
  assert.match(css,/\.sidebar>\.fieldlance-brand-wordmark\{[^}]*width:226px/);
});

ok('header exposes page context workspace context notifications and offline field controls',()=>{
  assert.match(shell,/className="header-context"/);
  assert.match(shell,/currentWorkspaceLabel/);
  assert.match(shell,/header-icon-button/);
  assert.match(shell,/Notifications, \$\{unreadNotifications\} unread/);
  assert.match(shell,/header-offline-action/);
});

ok('overview language matches the field-work marketplace positioning',()=>{
  assert.match(shell,/Your next opportunity starts here\./);
  assert.match(shell,/Build the field team your project needs\./);
  assert.match(shell,/Operate the field network with confidence\./);
  assert.match(overview,/Find field work, build verified experience and grow your earnings\./);
});

ok('status foundation covers neutral info success warning and danger without changing stored statuses',()=>{
  assert.match(overview,/tone\?:'neutral'\|'success'\|'warning'\|'danger'\|'info'/);
  for(const cls of ['status-info','status-success','status-warning','status-danger','status-neutral']) assert.match(css,new RegExp(`\\.${cls}`));
});

ok('responsive drawer accessibility remains intact',()=>{
  assert.match(shell,/aria-controls="workspace-navigation"/);
  assert.match(shell,/aria-expanded=\{menu\}/);
  assert.match(shell,/e\.key==='Escape'/);
  assert.match(shell,/setAttribute\('inert',''\)/);
  assert.match(css,/@media\(max-width:800px\)/);
});

ok('2.19.6 is migration-free and preserves the 2.19.5 database head',()=>{
  const migrations=readdirSync('supabase/migrations').filter((n)=>n.endsWith('.sql')).sort();
  assert.equal(migrations.at(-1),'20261009000500_fieldlance_brand_compatibility.sql');
  assert.equal(migrations.some((n)=>/2196|visual.*system|navigation/i.test(n)),false);
});

console.log(`\n${passed} FieldLance 2.19.6 visual-system/navigation scenarios passed.`);
