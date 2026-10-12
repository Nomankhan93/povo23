import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';

const read=path=>readFileSync(path,'utf8');
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
let passed=0;
async function ok(name,fn){await fn();passed+=1;console.log(`PASS ${name}`);}

const pkg=JSON.parse(read('package.json'));
const lock=JSON.parse(read('package-lock.json'));
const offline=read('src/features/surveys/OfflineFieldWorkspace.tsx');
const sync=read('src/features/surveys/SurveySyncStatus.tsx');
const shell=read('src/features/surveys/OfflineShellStatus.tsx');
const offlineCss=read('src/features/surveys/OfflineFieldWorkspace.module.css');
const syncCss=read('src/features/surveys/SurveySyncStatus.module.css');
const permissions=read('docs/PERMISSIONS.md');
const attendanceClient=read('scripts/test-attendance-client2401.mjs');
const migrations=readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql')).sort();

const protectedHashes={
  'src/features/surveys/offlineSurveyStore.ts':'3e3cbe89250434b7be6ab831293bbe915895f2d09b09e875fbd59da7a2151204',
  'src/features/surveys/fieldAttachments.ts':'b24b18f64b5fc7c2a42ce01b1de038b346e1bcd397e3ab433243eaaf12469037',
  'src/features/surveys/fieldDeviceLifecycle.ts':'03b181ad006db51397cdc959a60bd2a93325918fe584e7065bcdbad7597df28b',
  'src/features/surveys/deviceFreshness.ts':'563c13cc9979fe39ad5f0857636a51d02a8bc034974bf85501bdceae66845f95',
  'src/features/workforce/attendanceOfflineStore.ts':'a1b42fd7c7b27700203681174cecc87220fa92730cec1c0cc98df74f69e74e8a',
  'src/features/workforce/attendanceDownload.ts':'05f868a2dd9814a3022f174fae0c27bfed0ee072f4dbe85d8f172da4db35e12e',
  'src/features/surveys/SurveyForm.tsx':'1fb6ddb56b4b3e4bcb8eb0897092e8e7de8f4208f811eda6d1512353e12e1f59',
  'src/features/surveys/SurveyForm.module.css':'da5b82aa1012ccc1e04b6f16e91379c2e18c8dfd6d5a90e2df8a3d87b2ce898a',
  'src/features/workforce/AttendanceWorkspace.tsx':'ecd38eb75951dc078fdec612c59b360e939cdb4fa109a5ad3c882b48a1853119',
  'src/features/workforce/AttendanceWorkspace.module.css':'761ee849ba984461addc00453c32071940b914f65ac700ab74afa2ced50f94d7',
  'scripts/build-field-worker.mjs':'852cbc7846a38adf73f2bc18642fb9031aa96cf5b5cfa9b3741102aaa22021f9',
  'src/app/routes.ts':'b54c0da60b4acb4f7f1b84cb8a9b2d090583e790435402632b6a9c5b34c87879',
  'src/app/capabilityContract.ts':'05ac924820b40484141eb6915f9e9f42de17e93175c279463e531a33e5ba2d62',
  'src/app/navigation.ts':'675b6634c864237aa97ed2726de2c0586f0757aa6a8c75ba6351a03166aae132',
  'src/app/AppShell.tsx':'428e73f7de2df65b423c9acc819ad2237d048396be292557aec048cfd1b89397',
  'src/lib/supabase/client.ts':'1105a65770beb2f4cc954c09ae901707859c16389d21872f2adb41208a4fa6cc',
  'src/lib/supabase/database.types.ts':'e29703de0d84d0335ca185a20e155ff1d96d2558ac7e7a8e413b9c36c29a3761',
};

function migrationAggregate(){const digest=createHash('sha256');for(const name of migrations){digest.update(name);digest.update('\0');digest.update(readFileSync(`supabase/migrations/${name}`));digest.update('\0');}return digest.digest('hex');}

await ok('package and lockfile are FieldLance 2.42.10',async()=>{
  assert.equal(pkg.version,'2.42.10');assert.equal(lock.version,'2.42.10');assert.equal(lock.packages?.['']?.version,'2.42.10');
});
await ok('database migration inventory is unchanged',async()=>{
  assert.equal(migrations.length,87);assert.equal(migrations.at(-1),'20261013000580_project_lifecycle_e2e_integrity.sql');assert.equal(migrationAggregate(),'a652ce1f61f4e8f3f63b5be83599b36ed716c05c6bcaea811454368af0e80f16');
});
await ok('offline stores, SurveyForm, Attendance and routing/security integration remain byte-identical',async()=>{
  for(const [path,expected] of Object.entries(protectedHashes))assert.equal(hash(path),expected,`${path} changed unexpectedly`);
});
await ok('Offline Field separates Surveys, Attendance and Device without inventing offline capabilities',async()=>{
  assert.match(offline,/type View='surveys'\|'attendance'\|'device'/);
  assert.match(offline,/id:'surveys',label:'Surveys'/);assert.match(offline,/id:'attendance',label:'Attendance'/);assert.match(offline,/id:'device',label:'Device'/);
  assert.match(offline,/Financial actions, case operations and basemaps are not available offline/);
  assert.match(offline,/Background Sync support is not required/);
});
await ok('survey downloads use desktop tables and mobile record cards while preserving bounded download semantics',async()=>{
  assert.match(offline,/limit\(200\)/);assert.match(offline,/download_field_project/);assert.match(offline,/up to 200 active assignments/i);
  assert.match(offline,/<DataTable caption="Available survey project downloads"/);assert.match(offline,/<DataTable caption="Downloaded survey projects"/);assert.match(offline,/<MobileRecordCard/);
});
await ok('download freshness and revocation remain server-aware and seven-day bounded',async()=>{
  assert.match(offline,/deviceFreshness\(/);assert.match(offline,/Downloaded access expires after at most seven days/);assert.match(offline,/Remote revocation is checked/);
});
await ok('Attendance remains embedded through the existing AttendanceWorkspace and queue/download contracts',async()=>{
  assert.match(offline,/<AttendanceWorkspace/);assert.match(offline,/syncAttendanceQueue\(ownerId,false\)/);assert.match(offline,/readAttendanceDownload/);assert.match(offline,/downloadAttendance/);assert.match(offline,/invalidateAttendanceDownload/);
});
await ok('device inventory keeps surveys, attendance and attachment evidence distinct',async()=>{
  assert.match(offline,/title="Survey copies"/);assert.match(offline,/title="Attendance copies"/);assert.match(offline,/title="Attachments"/);
  assert.match(offline,/inventory\.surveys\.drafts/);assert.match(offline,/inventory\.surveys\.queue/);assert.match(offline,/inventory\.surveys\.receipts/);assert.match(offline,/inventory\?\.attendance/);assert.match(offline,/files\.map/);
});
await ok('device erase uses an accessible typed confirmation and keeps the server-record boundary explicit',async()=>{
  assert.doesNotMatch(offline,/window\.prompt|window\.confirm/);assert.match(offline,/<Dialog open=\{eraseOpen\}/);assert.match(offline,/eraseText!=='ERASE'/);assert.match(offline,/Type ERASE to confirm/);assert.match(offline,/Server records remain unchanged/);assert.match(offline,/eraseConfirmation\(eraseSnapshot\)/);
});
await ok('lock and sign-out confirmation no longer depends on native browser confirm',async()=>{
  assert.match(offline,/<ConfirmDialog open=\{logoutOpen\}/);assert.match(offline,/lockFieldDevice\(\)/);assert.match(offline,/auth\.signOut\(\{scope:'local'\}\)/);
});
await ok('survey sync preserves exact request/recovery semantics while using shared confirmation',async()=>{
  assert.doesNotMatch(sync,/window\.confirm|window\.prompt/);assert.match(sync,/Retry original request/);assert.match(sync,/Recover for editing/);assert.match(sync,/Pending saves retain their original request ID/);assert.match(sync,/Only confirmed rejections can be recovered for editing/);assert.match(sync,/Recovery never overwrites an existing draft/);assert.match(sync,/<ConfirmDialog/);
});
await ok('offline shell still reports production service-worker readiness without changing shell policy',async()=>{
  assert.match(shell,/serviceWorker/);assert.match(shell,/Offline app shell installed for app routes/);assert.match(shell,/Survey and attendance data must be downloaded separately/);assert.match(shell,/<Alert title="Offline app files"/);
});
await ok('2.42.9 delegated attendance-client harness correction is carried forward',async()=>{
  assert.match(attendanceClient,/DelegatedCasesWorkspace\.tsx/);assert.match(attendanceClient,/\.\.\/\.\.\/components\/ui\/FieldLanceUI/);assert.match(attendanceClient,/\.\/DelegatedCasesWorkspace\.module\.css/);
});
await ok('Offline Field and Survey Sync CSS use 2.42 tokens, approved breakpoints and interaction sizes',async()=>{
  for(const css of [offlineCss,syncCss]){
    assert.match(css,/min-height: 44px/);assert.match(css,/min-height: 48px/);assert.match(css,/@media \(max-width: 639px\)/);assert.doesNotMatch(css,/#[0-9a-f]{3,8}\b/i);assert.doesNotMatch(css,/!important/);
    const breakpoints=[...css.matchAll(/@media \(max-width: (\d+)px\)/g)].map(match=>Number(match[1]));assert.ok(breakpoints.every(value=>value===1023||value===639));
    for(const px of [...css.matchAll(/font-size:\s*(\d+)px/g)].map(match=>Number(match[1])))assert.ok(px>=12,`font-size ${px}px is below 12px`);
  }
  assert.match(offlineCss,/@media \(max-width: 1023px\)/);
});
await ok('2.42.10 permissions note preserves owner-bound offline scope and denies new background/case/finance authority',async()=>{
  assert.match(permissions,/Current permissions note — FieldLance 2\.42\.10/);assert.match(permissions,/owner-bound/i);assert.match(permissions,/server RLS\/RPC authorization remains authoritative/i);assert.match(permissions,/does not add offline case operations, finance authority, basemap access, background tracking or background synchronization/i);assert.match(permissions,/server records remain unchanged/i);
});

console.log(`\n${passed} FieldLance 2.42.10 Offline / Mobile Field Workspace scenarios passed.`);
