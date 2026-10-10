import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

let passed = 0;
function ok(name, fn) { fn(); passed++; console.log('PASS', name); }
function text(file) { return readFileSync(file, 'utf8'); }
function sha(file) { return createHash('sha256').update(readFileSync(file)).digest('hex'); }

const pkg = JSON.parse(text('package.json'));
const lock = JSON.parse(text('package-lock.json'));
const mapUi = text('src/features/maps/FieldOperationsMap.tsx');
const mapCss = text('src/features/maps/FieldOperationsMap.module.css');
const globalCss = text('src/styles/design-system.css');
const viewState = text('src/features/maps/fieldMapViewState.ts');
const migration440 = text('supabase/migrations/20261013000440_field_operations_map_geographic_quality.sql');
const migration460 = text('supabase/migrations/20261013000460_map_completeness_evidence_review.sql');
const migrations = readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort();

const protectedHashes = new Map([
  ['src/features/maps/fieldMapViewState.ts', 'e4807349a52eb72525cf4c2714b33ddeef00ea716ef8aa0c3cf692367a61fa73'],
  ['src/app/routes.ts', 'b54c0da60b4acb4f7f1b84cb8a9b2d090583e790435402632b6a9c5b34c87879'],
  ['src/app/capabilityContract.ts', '05ac924820b40484141eb6915f9e9f42de17e93175c279463e531a33e5ba2d62'],
  ['src/app/navigation.ts', '675b6634c864237aa97ed2726de2c0586f0757aa6a8c75ba6351a03166aae132'],
  ['src/features/projects/ProjectWorkspace.tsx', 'f1edb171031d1d2e2d1f5c240470914384e0731ba317fbbe586f8ceaf9dbfdd8'],
  ['src/features/projects/workspacePermissions.ts', 'ab5ec24668bb14a01561610f16a008e1a819ff02fd1879ba268e49f207d99fd7'],
  ['src/features/projects/projectNavigation.ts', '4108763147b73ad7ddd969711d6b270270941cabfffca7c83c9da512b51104b7'],
  ['src/lib/supabase/client.ts', '1105a65770beb2f4cc954c09ae901707859c16389d21872f2adb41208a4fa6cc'],
  ['src/lib/supabase/database.types.ts', 'e29703de0d84d0335ca185a20e155ff1d96d2558ac7e7a8e413b9c36c29a3761'],
  ['src/features/workforce/AttendanceWorkspace.tsx', 'ecd38eb75951dc078fdec612c59b360e939cdb4fa109a5ad3c882b48a1853119'],
  ['src/features/workforce/attendanceOfflineStore.ts', 'a1b42fd7c7b27700203681174cecc87220fa92730cec1c0cc98df74f69e74e8a'],
  ['src/features/workforce/attendanceDownload.ts', '05f868a2dd9814a3022f174fae0c27bfed0ee072f4dbe85d8f172da4db35e12e'],
  ['src/features/payables/PayablesWorkspace.tsx', '17d945934cf9c30e69cc8616a80e49c388be061589c424427d34cd16bc15f16d'],
  ['src/features/workforce/recruitmentQueries.ts', '8592b68b8cb7a1937bb3864475434888583b73ef7bb9a8df1d2d8a82aefb0aea'],
  ['src/features/workforce/recruitmentState.ts', 'd684d63a14ed3dac5c376106d303b0b00833b931debd909a113c45e46db677ac'],
]);

ok('2.42.6 package and lockfile versions are aligned', () => {
  assert.equal(pkg.version, '2.42.6');
  assert.equal(lock.version, '2.42.6');
  assert.equal(lock.packages?.['']?.version, '2.42.6');
});

ok('migration inventory remains exactly 87 with the expected head', () => {
  assert.equal(migrations.length, 87);
  assert.equal(migrations.at(-1), '20261013000580_project_lifecycle_e2e_integrity.sql');
});

ok('the authoritative server-side field_operations_map_page contract remains in place', () => {
  assert.match(migration460, /field_operations_map_page/);
  assert.match(mapUi, /mapRpc\("field_operations_map_page"/);
  for (const key of ['p_from','p_to','p_worker','p_geography','p_status','p_quality','p_layers','p_review_only','p_cursor_at','p_cursor_id','p_page_size']) assert.match(mapUi, new RegExp(key));
});

ok('MapLibre 6.11.2 and OpenFreeMap Liberty remain the renderer/provider', () => {
  assert.match(mapUi, /MAPLIBRE_VERSION = "6\.11\.2"/);
  assert.match(mapUi, /maplibre-gl\.mjs/);
  assert.match(mapUi, /tiles\.openfreemap\.org\/styles\/liberty/);
  assert.doesNotMatch(mapUi, /google\.maps|maps\.googleapis|mapboxgl/i);
});

ok('personal own-only and Area Focal geography authorization remain server-enforced', () => {
  assert.match(migration440, /Personal field map can only show your own evidence/i);
  assert.match(migration440, /p_worker=auth\.uid\(\)/);
  assert.match(migration440, /can_review_project_area/);
  assert.match(migration440, /can_manage_project/);
});

ok('source_openable remains current-authorization controlled', () => {
  assert.match(migration460, /source_openable/);
  assert.match(mapUi, /row\.source_openable/);
  assert.match(mapUi, /Source not currently openable/);
});

ok('no continuous or background geolocation collection was introduced', () => {
  assert.doesNotMatch(mapUi, /watchPosition|getCurrentPosition|navigator\.geolocation/);
  assert.match(mapUi, /does not continuously track workers in the background/i);
});

ok('keyset pagination and full-result totals remain distinct from loaded rows', () => {
  assert.match(mapUi, /p_cursor_at/);
  assert.match(mapUi, /p_cursor_id/);
  assert.match(mapUi, /pagination\.next_cursor/);
  assert.match(mapUi, /summary\.matched_total/);
  assert.match(mapUi, /evidence records loaded/i);
  assert.match(mapUi, /full authorized filtered result/i);
  assert.match(mapUi, /Load more evidence/);
});

ok('transient map view state still stores filters/pages/selection but no evidence payloads', () => {
  assert.match(viewState, /filters|layers|loaded page count|selected evidence ID/i);
  assert.match(viewState, /selectedEvidenceId/);
  assert.doesNotMatch(viewState, /FieldMapEvidence|rows:|boundaries:/);
  assert.match(mapUi, /Re-authorize every page on return/);
});

ok('selected evidence is synchronized across map, list and detail surfaces', () => {
  assert.match(mapUi, /selectEvidence\(row/);
  assert.match(mapUi, /selectedEvidenceId/);
  assert.match(mapUi, /data-selected=/);
  assert.match(mapUi, /aria-pressed=/);
  assert.match(mapUi, /<EvidenceDetail row=\{selectedEvidence\}/);
  assert.match(mapUi, /setPaintProperty\("fieldlance-points"/);
});

ok('custom date range participates in active-filter and Clear filters state', () => {
  assert.match(mapUi, /customDateRange/);
  assert.match(mapUi, /values\.from !== dateOffset\(-30\)/);
  assert.match(mapUi, /values\.to !== dateOffset\(0\)/);
  assert.match(mapUi, /filterCount\(\{ from, to, worker, geo, status, quality, reviewOnly, layers \}\)/);
});

ok('list selection zooms selected evidence beyond the clustering threshold', () => {
  assert.match(mapUi, /clusterMaxZoom:\s*13/);
  assert.match(mapUi, /Math\.max\(map\.getZoom\?\.\(\) \|\| 4, 14\)/);
});

ok('completeness distinguishes loaded evidence records from plottable map points', () => {
  assert.match(mapUi, /plottableTotal/);
  assert.match(mapUi, /plottedRows\.length/);
  assert.match(mapUi, /evidence records loaded/);
  assert.match(mapUi, /loaded records plottable/);
  assert.match(mapUi, /matching evidence overall/);
});

ok('desktop operational workspace keeps map and selected evidence side by side', () => {
  assert.match(mapUi, /styles\.operationalGrid/);
  assert.match(mapUi, /styles\.desktopDetail/);
  assert.match(mapUi, /SELECTED EVIDENCE/);
  assert.match(mapCss, /\.operationalGrid\s*\{[^}]*grid-template-columns/s);
});

ok('mobile filters and selected evidence use focus-managed BottomSheet surfaces', () => {
  assert.match(mapUi, /<BottomSheet open=\{filtersOpen\}/);
  assert.match(mapUi, /<BottomSheet open=\{mobileDetailOpen/);
  assert.match(mapUi, /aria-haspopup="dialog"/);
  assert.match(mapCss, /@media \(max-width: 639px\)/);
});

ok('renderer failure leaves the authorized evidence records usable', () => {
  assert.match(mapUi, /Basemap unavailable/);
  assert.match(mapUi, /authorized evidence list remains available/i);
  assert.match(mapUi, /role="list"/);
  assert.match(mapUi, /map\.on\("error"/);
});

ok('review signals remain explicitly non-accusatory and textually visible', () => {
  assert.match(mapUi, /not fraud findings/i);
  assert.match(mapUi, /Review signals/);
  assert.match(mapUi, /qualityLabels/);
  assert.match(mapUi, /StatusBadge/);
});

ok('FieldOperationsMap uses a scoped CSS module and legacy global map selectors are retired', () => {
  assert.ok(existsSync('src/features/maps/FieldOperationsMap.module.css'));
  assert.match(mapUi, /import styles from "\.\/FieldOperationsMap\.module\.css"/);
  assert.doesNotMatch(globalCss, /\.field-operations-map|\.field-map-(hero|filters|layers|stats|canvas|review|completeness|evidence|source|load|end|popup|runtime)/);
});

ok('new map CSS has no hard-coded color literals, !important, or sub-12px operational type', () => {
  assert.doesNotMatch(mapCss, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(mapCss, /!important/);
  const fontSizes = [...mapCss.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map(match => Number(match[1]));
  assert.equal(fontSizes.some(value => value < 12), false, `sub-12 font sizes: ${fontSizes.filter(value => value < 12).join(', ')}`);
});

ok('new map CSS uses only the approved 1023px and 639px feature breakpoints', () => {
  const breakpoints = [...mapCss.matchAll(/@media\s*\(max-width:\s*(\d+)px\)/g)].map(match => Number(match[1]));
  assert.deepEqual([...new Set(breakpoints)].sort((a,b)=>a-b), [639, 1023]);
});

ok('new map CSS module has no obvious orphaned static class references', () => {
  const defined = new Set([...mapCss.matchAll(/^\.([A-Za-z_][\w-]*)/gm)].map(match => match[1]));
  const referenced = new Set([...mapUi.matchAll(/styles\.([A-Za-z_][\w]*)/g)].map(match => match[1]));
  const dynamic = new Set(['layer_survey','layer_attendance_check_in','layer_attendance_check_out','layer_case_follow_up']);
  const orphans = [...defined].filter(name => !referenced.has(name) && !dynamic.has(name));
  assert.deepEqual(orphans, []);
});

ok('all declared UI-only protected files remain byte-identical to the 2.42.5 baseline', () => {
  for (const [file, expected] of protectedHashes) assert.equal(sha(file), expected, `${file} changed unexpectedly`);
});

ok('no SQL/RLS/RPC migration surface was added for 2.42.6', () => {
  assert.equal(migrations.length, 87);
  assert.equal(migrations.at(-1), '20261013000580_project_lifecycle_e2e_integrity.sql');
  assert.equal(readdirSync('supabase/migrations').filter(name => /2426|2_42_6/i.test(name)).length, 0);
});

console.log(`\n${passed}/23 FieldLance 2.42.6 Field Operations Map checks passed.`);
