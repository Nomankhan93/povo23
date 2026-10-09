import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const form = read('src/features/surveys/SurveyForm.tsx');
const capture = read('src/features/surveys/CaptureFields.tsx');
const detail = read('src/features/surveys/SurveyProjectDetail.tsx');
const queue = read('src/features/surveys/SurveyReviewQueue.tsx');
const formCss = read('src/features/surveys/SurveyForm.module.css');
const captureCss = read('src/features/surveys/CaptureFields.module.css');
const responsesCss = read('src/features/surveys/SurveyResponses.module.css');
const queueCss = read('src/features/surveys/SurveyReviewQueue.module.css');
const cssModules = [formCss, captureCss, responsesCss, queueCss];
let passed = 0;

async function ok(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

await ok('2.42.3 is registered and adds no database migration', async () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.version, '2.42.3');
  assert.equal(pkg.scripts['test:survey-collection-responses-2423'], 'node --experimental-strip-types scripts/test-survey-collection-responses2423.mjs');
  const migrations = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort();
  assert.equal(migrations.length, 87);
  assert.equal(migrations.at(-1), '20261013000580_project_lifecycle_e2e_integrity.sql');
  assert.equal(sha256('supabase/migrations/20261013000580_project_lifecycle_e2e_integrity.sql'), '7c46de397a816df58450c22f51a5259608331de8e2fdd9b58e85a19c3b3b24c5');
});

await ok('protected 2.42.2 survey and offline/save files remain byte-identical', async () => {
  const expected = {
    'src/features/surveys/SurveyTemplates.tsx': '98b575818320d3ab1edadf5daab85b081aeff27863f71e14c60ba1a11d76130e',
    'src/features/surveys/SurveyTemplates.module.css': '3c526a3b2ab87758fa6c5c4b0e6c216fba27bc3d9a4aef61f11608c94493d298',
    'src/features/surveys/offlineSurveyStore.ts': '3e3cbe89250434b7be6ab831293bbe915895f2d09b09e875fbd59da7a2151204',
    'src/features/surveys/useSurveySave.ts': 'e0ab44f52b602bf4eabb33eca05e07fa8a5ca6f2598a76bb4468fbceffcda2c3',
    'src/features/surveys/OfflineFieldWorkspace.tsx': 'a6ad7bb54bdffc7c3e30456b9774dffb948aeb2f942530055c66546f4f4e4f38',
    'src/features/surveys/fieldDeviceLifecycle.ts': '03b181ad006db51397cdc959a60bd2a93325918fe584e7065bcdbad7597df28b',
    'src/features/surveys/fieldAttachments.ts': 'b24b18f64b5fc7c2a42ce01b1de038b346e1bcd397e3ab433243eaaf12469037',
    'src/features/surveys/capture.ts': '5ae517c88f70b95e84b11ea5e4df33b78511a30d3c6be112d3592fecf579b3c7',
  };
  for (const [path, hash] of Object.entries(expected)) assert.equal(sha256(path), hash, path);
});

await ok('route capability navigation and Supabase client contracts remain byte-identical', async () => {
  assert.equal(sha256('src/app/routes.ts'), 'b54c0da60b4acb4f7f1b84cb8a9b2d090583e790435402632b6a9c5b34c87879');
  assert.equal(sha256('src/app/capabilityContract.ts'), '05ac924820b40484141eb6915f9e9f42de17e93175c279463e531a33e5ba2d62');
  assert.equal(sha256('src/app/navigation.ts'), '675b6634c864237aa97ed2726de2c0586f0757aa6a8c75ba6351a03166aae132');
  assert.equal(sha256('src/lib/supabase/client.ts'), '1105a65770beb2f4cc954c09ae901707859c16389d21872f2adb41208a4fa6cc');
});

await ok('SurveyForm keeps question grouping visibility validation and mobile stepping wiring', async () => {
  assert.match(form, /surveyQuestionSections\(qs\)/);
  assert.match(form, /isVisible\(q,visible\)/);
  assert.match(form, /captureErrors\(qs,answers,button\?\.value === "submit"/);
  assert.match(form, /const \[step,setStep\]=useState\('consent'\)/);
  assert.match(form, /function nextSection\(\)/);
  assert.match(form, /moveSection\(sections\[stepIndex\+1\]\.id\)/);
  assert.doesNotMatch(form, /useNarrowScreen/);
  assert.match(form, /className=\{styles\.mobileNavigation\}/);
  assert.match(form, /hidden=\{currentStep !== group\.id\}/);
  assert.doesNotMatch(form, /Demographics|Household demographics|Health section|Income section/);
});

await ok('SurveyForm preserves consent representative draft-save close and final-submit callbacks', async () => {
  assert.match(form, /registerActiveDraft\(async\(\)=>/);
  assert.match(form, /saveSurveyDeviceDraft\(userId,project\.id,draftResponse/);
  assert.match(form, /loadSurveyDeviceDraft\(userId, project\.id, draftResponse\)/);
  assert.match(form, /deleteSurveyDeviceDraft\(userId, project\.id, draftResponse\)/);
  assert.match(form, /representativeNeeded\(knownBirth,qs,visible\)/);
  assert.match(form, /p_consent: \{\.\.\.consent, governance_version: project\.governance_version,template_id:template\.id\}/);
  assert.match(form, /p_submit: button\?\.value === "submit"/);
  assert.match(form, /p_version: response\?\.version \|\| 0/);
  assert.match(form, /onSaved\(\)/);
  assert.match(form, /onQueued\(\)/);
  assert.match(form, /await saveSurveyDeviceDraft[\s\S]*cancel\(\)/);
});

await ok('uncertain-save and unchanged-request retry semantics remain explicit', async () => {
  assert.match(form, /request\.uncertain/);
  assert.match(form, /Retry unchanged request/);
  assert.match(form, /onClick=\{\(\) => void request\.send\(\)\}/);
  assert.match(form, /disabled=\{request\.saving \|\| request\.uncertain \|\| captureBusy > 0\}/);
});

await ok('collection presentation uses focused section workspace and compact existing-state header', async () => {
  assert.match(form, /className=\{styles\.collectionHeader\}/);
  assert.match(form, /className=\{styles\.workspace\}/);
  assert.match(form, /aria-label="Survey sections"/);
  assert.match(form, /Section \{stepIndex \+ 1\} of \{sections\.length\}/);
  assert.match(form, /visible questions answered/);
  assert.match(form, /Online|Offline/);
  assert.match(formCss, /grid-template-columns: minmax\(220px, 260px\) minmax\(0, 1fr\)/);
});

await ok('device draft status remains exposed through a polite live region', async () => {
  assert.match(form, /const draftStatusText = draftWriteState === "saving"/);
  assert.match(form, /Saving device draft… keep this form open/);
  assert.match(form, /Saved locally at/);
  assert.match(form, /Device draft save needs attention/);
  assert.match(form, /Device draft ready/);
  assert.match(form, /<span className="sr-only" role="status" aria-live="polite" aria-atomic="true">[\s\S]*\{draftStatusText\}[\s\S]*<\/span>/);
});

await ok('local draft write presentation transitions saving to saved without clearing dirty', async () => {
  assert.match(form, /const \[draftWriteState,setDraftWriteState\]=useState<"ready"\|"saving"\|"saved"\|"error">\("ready"\)/);
  assert.match(form, /const draftWriteRevision=useRef\(0\)/);
  const autosaveStart = form.indexOf('  useEffect(() => {\n    if (!hydrated || !dirty || finalizing.current) return;');
  const autosaveEnd = form.indexOf('\n\n  useEffect(() => {\n    const yes = () => setOnline(true);', autosaveStart);
  assert.ok(autosaveStart >= 0 && autosaveEnd > autosaveStart, 'autosave effect block not found');
  const autosave = form.slice(autosaveStart, autosaveEnd);
  assert.match(autosave, /const writeRevision=\+\+draftWriteRevision\.current;[\s\S]*setDraftWriteState\("saving"\)/);
  assert.match(autosave, /saveSurveyDeviceDraft\(userId, project\.id, draftResponse, payload\)/);
  assert.match(autosave, /setSavedAt\(Date\.now\(\)\);[\s\S]*draftWriteRevision\.current===writeRevision[\s\S]*setDraftWriteState\("saved"\)/);
  assert.match(autosave, /setDraftWriteState\("error"\);[\s\S]*setDraftError/);
  assert.doesNotMatch(autosave, /setDirty\(false\)/);
  assert.match(form, /\[dirty, setDirty\] = useState\(false\)/);
  assert.match(form, /if\(dirty\)await saveSurveyDeviceDraft/);
  assert.match(form, /if\(dirty&&!finalizing\.current\)/);
});

await ok('SurveyForm mobile presentation uses the approved 639px CSS breakpoint without 640-650 hybrid state', async () => {
  assert.doesNotMatch(form, /useNarrowScreen|matchMedia\([^)]*650|max-width:\s*650px/);
  assert.match(form, /data-current-section=\{currentStep\}/);
  assert.match(form, /className=\{styles\.mobileNavigation\}/);
  assert.match(form, /className=\{styles\.submitButton\}/);
  assert.match(formCss, /@media \(max-width: 639px\)/);
  assert.doesNotMatch(formCss, /@media \(max-width: (?:64[0-9]|650)px\)/);
  assert.match(formCss, /\.mobileNavigation \{[\s\S]*display: flex;/);
  assert.match(formCss, /\.form:not\(\[data-current-section="review"\]\) \.submitButton \{[\s\S]*display: none;/);
});

await ok('review queue labels created_at accurately without expanding the query', async () => {
  assert.match(queue, /select\("id,project_id,status,created_at"\)/);
  assert.match(queue, /Created \{new Date\(row\.created_at\)\.toLocaleString\(\)\}/);
  assert.doesNotMatch(queue, /Submitted \{new Date\(row\.created_at\)/);
  assert.doesNotMatch(queue, /submitted_at|updated_at/);
});

await ok('r1 removes only the proven-unused 2.42.3 CSS selectors and duplicate responseFlow media rules', async () => {
  assert.doesNotMatch(formCss, /\.draftNoticeActions|\.sectionHeader/);
  assert.doesNotMatch(captureCss, /\.stateText/);
  assert.doesNotMatch(responsesCss, /\.answerMeta/);
  const responseFlowBlocks = responsesCss.match(/\.responseFlow\s*\{/g) || [];
  assert.equal(responseFlowBlocks.length, 1);
});

await ok('CaptureFields keeps attachment security staging consent authority and allowed file formats', async () => {
  assert.match(capture, /stageAttachment\([\s\S]*ownerId,[\s\S]*projectId,[\s\S]*q\.id,[\s\S]*file,[\s\S]*capture_authority: authority/);
  assert.match(capture, /q\.type === "photo" \? "image\/jpeg,image\/png" : "image\/jpeg,image\/png,application\/pdf"/);
  assert.match(capture, /authorize_survey_capture_view/);
  assert.match(capture, /createSignedUrl\(path, 60\)/);
  assert.match(capture, /local-file:/);
  assert.match(capture, /adult_subject/);
  assert.match(capture, /representative/);
});

await ok('CaptureFields keeps GPS API options and serialized location values unchanged', async () => {
  assert.match(capture, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(capture, /latitude: p\.coords\.latitude/);
  assert.match(capture, /longitude: p\.coords\.longitude/);
  assert.match(capture, /accuracy: p\.coords\.accuracy/);
  assert.match(capture, /captured_at: new Date\(p\.timestamp\)\.toISOString\(\)/);
  assert.match(capture, /enableHighAccuracy: true, timeout: 20000, maximumAge: 0/);
  assert.match(capture, /\{ unavailable_reason: e\.target\.value \}/);
});

await ok('household semantics limits and stored member shape remain unchanged', async () => {
  assert.match(capture, /maximum 30/i);
  assert.match(capture, /members\.length >= 30/);
  assert.match(capture, /\{ full_name: "", birth_date: "", relationship: "" \}/);
  assert.match(capture, /members\.filter\(\(_, n\) => n !== i\)/);
  assert.match(capture, /update\(i, key, e\.target\.value\)/);
});

await ok('duplicate visible choice labels cannot collide in React presentation keys', async () => {
  assert.doesNotMatch(capture, /key=\{o\}/);
  assert.match(capture, /key=\{`\$\{q\.id\}:multiple:\$\{index\}`\}/);
  assert.match(capture, /key=\{`\$\{q\.id\}:\$\{q\.type\}:\$\{index\}`\}/);
  assert.match(capture, /value=\{o\}/);
  assert.match(capture, /value\.includes\(o\)/);
});

await ok('response query selection status pagination and correction edit wiring remain unchanged', async () => {
  assert.match(detail, /from\("survey_responses"\)[\s\S]*select\("\*"\)[\s\S]*eq\("project_id", project\.id\)/);
  assert.match(detail, /range\(page \* 50, page \* 50 \+ 50\)/);
  assert.match(detail, /if \(!review\) r = r\.eq\("collector_id", userId\)/);
  assert.match(detail, /if \(responseStatus !== "all"\) r = r\.eq\("status", responseStatus\)/);
  assert.match(detail, /setSelected\(responseRow\)/);
  assert.match(detail, /\["draft", "correction_required"\]\.includes\(responseRow\.status\)/);
  assert.match(detail, /setEditing\(responseRow\)/);
});

await ok('direct response opening and project workspace modes preserve route-neutral local selection', async () => {
  assert.match(detail, /initialResponseId/);
  assert.match(detail, /eq\("id", initialResponseId\)\.eq\("project_id", project\.id\)/);
  assert.match(detail, /workspaceMode === "full"/);
  assert.match(detail, /workspaceMode === "responses" \? styles\.responseWorkspace : styles\.responseFlow/);
  assert.match(detail, /onClick=\{\(\) => setSelected\(null\)\}/);
  assert.doesNotMatch(detail, /history\.pushState|location\.href|navigate\(/);
});

await ok('workspace modes suppress duplicate project context while standalone mode retains it', async () => {
  const intro = detail.slice(detail.indexOf('return ('), detail.indexOf('{error &&'));
  assert.match(intro, /workspaceMode === "full"/);
  assert.match(intro, /<h2>\{project\.title\}<\/h2>/);
  assert.match(intro, /← \{backLabel\}/);
  assert.doesNotMatch(intro, /workspaceMode === "field-work"[\s\S]*<h2>\{project\.title\}/);
  assert.doesNotMatch(intro, /workspaceMode === "responses"[\s\S]*<h2>\{project\.title\}/);
});

await ok('response review preserves exact statuses note validation RPC and secure attachments', async () => {
  for (const status of ['approved', 'correction_required', 'rejected']) assert.match(detail, new RegExp(`value="${status}"`));
  assert.match(detail, /rpc\("review_survey_response", \{/);
  assert.match(detail, /p_id: selected\.id/);
  assert.match(detail, /p_status: get\(form, "status"\)/);
  assert.match(detail, /p_note: get\(form, "note"\)/);
  assert.match(detail, /p_version: selected\.version/);
  assert.match(detail, /name="note" required minLength=\{3\} maxLength=\{2000\}/);
  assert.match(detail, /<AttachmentView id=\{value\} \/>/);
});

await ok('response detail uses structured primary answers while preserving raw audit and revisions', async () => {
  assert.match(detail, /function ResponseAnswer/);
  assert.match(detail, /question\.type === "gps"/);
  assert.match(detail, /question\.type === "household"/);
  assert.match(detail, /Structured answer/);
  assert.match(detail, /Technical \{label\.toLowerCase\(\)\}/);
  assert.match(detail, /JSON\.stringify\(value, null, 2\)/);
  assert.match(detail, /from\("survey_response_revisions"\)/);
  assert.match(detail, /Show latest 50 revisions/);
});

await ok('responses mode visually demotes needs and registry without changing their callbacks', async () => {
  assert.match(detail, /Related project tools/);
  assert.match(detail, /Needs and case follow-up/);
  assert.match(detail, /<NeedsPanel refreshKey=\{rev\} projectId=\{project\.id\} onChanged=\{\(\) => setRev\(\(n\) => n \+ 1\)\} \/>/);
  assert.match(detail, /<RegistryOperations/);
  assert.match(detail, /Review identity \/ assistance/);
});

await ok('review queue preserves existing queries pagination routing callback and has no person-name dependency', async () => {
  assert.match(queue, /from\("survey_responses"\)[\s\S]*select\("id,project_id,status,created_at"\)/);
  assert.match(queue, /\.in\("status", \["submitted", "correction_required"\]\)/);
  assert.match(queue, /\.range\(page \* 50, page \* 50 \+ 50\)/);
  assert.match(queue, /from\("survey_projects"\)\.select\("id,title"\)\.in\("id", ids\)/);
  assert.doesNotMatch(queue, /registry_persons|person_id|full_name/);
  assert.match(queue, /onOpen\(row\.project_id, row\.id\)/);
  assert.match(queue, /setPage\(\(v\) => v - 1\)/);
  assert.match(queue, /setPage\(\(v\) => v \+ 1\)/);
});

await ok('collection response and review features use scoped CSS Modules only', async () => {
  assert.match(form, /import styles from "\.\/SurveyForm\.module\.css"/);
  assert.match(capture, /import styles from "\.\/CaptureFields\.module\.css"/);
  assert.match(detail, /import styles from "\.\/SurveyResponses\.module\.css"/);
  assert.match(queue, /import styles from "\.\/SurveyReviewQueue\.module\.css"/);
});

await ok('new feature modules use FieldLance tokens with no palette important rules broad selectors or tiny operational type', async () => {
  for (const css of cssModules) {
    assert.match(css, /var\(--fl-/);
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
    assert.doesNotMatch(css, /\brgb\s*\(/i);
    assert.doesNotMatch(css, /!important/);
    assert.doesNotMatch(css, /(?:^|\})\s*(?:header|nav|input|table|\.actions|\.panel)\s*\{/m);
    assert.doesNotMatch(css, /font-size:\s*(?:[0-9]|1[01](?:\.\d+)?)px/);
    assert.match(css, /@media \(max-width: 1023px\)/);
    assert.match(css, /@media \(max-width: 639px\)/);
  }
});

await ok('SurveyTemplates and Offline Field styling remain isolated from the new modules', async () => {
  assert.doesNotMatch(formCss + captureCss + responsesCss + queueCss, /SurveyTemplates|OfflineFieldWorkspace|offline-field|survey-template-builder/);
  assert.equal(sha256('src/features/surveys/SurveyTemplates.module.css'), '3c526a3b2ab87758fa6c5c4b0e6c216fba27bc3d9a4aef61f11608c94493d298');
  assert.equal(sha256('src/features/surveys/OfflineFieldWorkspace.tsx'), 'a6ad7bb54bdffc7c3e30456b9774dffb948aeb2f942530055c66546f4f4e4f38');
});

console.log(`\n${passed} FieldLance 2.42.3 Survey Collection & Response Review scenarios passed.`);
