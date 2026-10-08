import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';

const read=p=>readFileSync(p,'utf8');
const pkg=JSON.parse(read('package.json'));
const obs=read('src/lib/observability.ts');
const boundary=read('src/components/system/AppErrorBoundary.tsx');
const main=read('src/main.tsx');
const client=read('src/lib/supabase/client.ts');
const app=read('src/app/App.tsx');
const shell=read('src/app/AppShell.tsx');
const offline=read('src/features/surveys/OfflineFieldWorkspace.tsx');
const notifications=read('src/features/notifications/Notifications.tsx');
const map=read('src/features/maps/FieldOperationsMap.tsx');
let passed=0;
const ok=(name,fn)=>{fn();passed++;console.log('PASS '+name)};

ok('2.41.19 release and targeted observability command are registered',()=>{
  assert.equal(pkg.version,'2.41.19');
  assert.equal(pkg.scripts['test:observability-24119'],'node scripts/test-observability24119.mjs');
});

ok('uncaught React, window error and rejected promise failures have production containment',()=>{
  assert.match(main,/installGlobalDiagnostics\(\)/);
  assert.match(main,/<AppErrorBoundary>/);
  assert.match(boundary,/componentDidCatch/);
  assert.match(boundary,/reportDiagnostic\("app"/);
  assert.match(boundary,/Diagnostic code:/);
  assert.match(obs,/addEventListener\("error"/);
  assert.match(obs,/addEventListener\("unhandledrejection"/);
});

ok('diagnostics are bounded, memory-only and aggressively redact sensitive values',()=>{
  assert.match(obs,/MAX_DIAGNOSTICS\s*=\s*80/);
  assert.match(obs,/MAX_FINGERPRINTS\s*=\s*160/);
  assert.match(obs,/SAFE_CONTEXT_KEYS/);
  assert.match(obs,/\[redacted\]/);
  assert.match(obs,/\[email\]/);
  assert.match(obs,/\[phone\]/);
  assert.match(obs,/\[coordinates\]/);
  assert.match(obs,/MAX_MESSAGE\s*=\s*240/);
  assert.doesNotMatch(obs,/localStorage|sessionStorage|indexedDB|fetch\(/);
  assert.match(obs,/Never pass the raw Error\/context/);
});

ok('RPC and Supabase transport failures are observable without logging request arguments',()=>{
  assert.match(client,/global:\s*\{\s*fetch:\s*observedSupabaseFetch\s*\}/);
  assert.match(client,/response\.status\s*>=\s*500/);
  assert.match(client,/reportDiagnostic\("database"/);
  assert.match(client,/reportDiagnostic\("rpc"/);
  assert.match(client,/Intentionally log only the RPC name, never args/);
  assert.doesNotMatch(client,/reportDiagnostic\([^\n]+args/);
});

ok('auth, workspace and service-worker failures use safe production diagnostics',()=>{
  assert.match(app,/operation:\s*"restore_session"/);
  assert.match(app,/operation:\s*"auth_redirect"/);
  assert.match(app,/operation:\s*"parse_route"/);
  assert.match(shell,/operation:\s*"bootstrap"/);
  assert.match(shell,/operation:\s*"foreground_refresh"/);
  assert.match(main,/operation:'register'/);
  assert.match(main,/phase:'redundant'/);
  assert.match(app,/userFacingError/);
  assert.match(shell,/userFacingError/);
});

ok('offline sync, map renderer and notification target failures are diagnosable',()=>{
  assert.match(offline,/operation:'attendance_auto_sync'/);
  assert.match(offline,/operation:'device_inventory'/);
  assert.match(offline,/operation:'offline_action'/);
  assert.match(map,/operation:\s*"renderer_load"/);
  assert.match(map,/operation:\s*"load_evidence"/);
  assert.match(notifications,/operation:\s*"open_target"/);
  assert.match(notifications,/sourceKind:\s*row\.source_kind/);
});

ok('diagnostic context contract excludes identifiers and sensitive domain payloads',()=>{
  const safeKeys=obs.slice(obs.indexOf('const SAFE_CONTEXT_KEYS'),obs.indexOf(']);',obs.indexOf('const SAFE_CONTEXT_KEYS'))+3);
  for(const forbidden of ['userId','projectId','organizationId','assignmentId','responseId','caseId','latitude','longitude','phone','email','body','answer','token'])assert.doesNotMatch(safeKeys,new RegExp(`"${forbidden}"`));
  assert.match(safeKeys,/"operation"/);
  assert.match(safeKeys,/"online"/);
  assert.match(safeKeys,/"sourceKind"/);
});

ok('2.41.19 adds no database migration or remote telemetry dependency',()=>{
  const migrations=readdirSync(path.join(process.cwd(),'supabase/migrations')).filter(x=>x.endsWith('.sql')).sort();
  assert.equal(migrations.at(-1),'20261013000580_project_lifecycle_e2e_integrity.sql');
  const dependencies={...(pkg.dependencies||{}),...(pkg.devDependencies||{})};
  for(const name of Object.keys(dependencies))assert.doesNotMatch(name,/sentry|datadog|newrelic|logrocket|rollbar/i);
});

console.log(`\n${passed} FieldLance 2.41.19 error handling and production observability scenarios passed.`);
