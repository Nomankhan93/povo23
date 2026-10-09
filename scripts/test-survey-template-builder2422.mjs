import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const source = read('src/features/surveys/SurveyTemplates.tsx');
const css = read('src/features/surveys/SurveyTemplates.module.css');
let passed = 0;

async function ok(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

await ok('2.42.2 is presentation-only and adds no database migration', async () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.version, '2.42.2');
  assert.equal(pkg.scripts['test:survey-template-builder-2422'], 'node --experimental-strip-types scripts/test-survey-template-builder2422.mjs');
  const migrations = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort();
  assert.equal(migrations.length, 87);
  assert.equal(migrations.at(-1), '20261013000580_project_lifecycle_e2e_integrity.sql');
  assert.equal(sha256('supabase/migrations/20261013000580_project_lifecycle_e2e_integrity.sql'), '7c46de397a816df58450c22f51a5259608331de8e2fdd9b58e85a19c3b3b24c5');
});

await ok('survey routes and capability implementation remain byte-identical', async () => {
  assert.equal(sha256('src/app/routes.ts'), 'b54c0da60b4acb4f7f1b84cb8a9b2d090583e790435402632b6a9c5b34c87879');
  assert.equal(sha256('src/app/capabilityContract.ts'), '05ac924820b40484141eb6915f9e9f42de17e93175c279463e531a33e5ba2d62');
});

await ok('survey data model and question-type identifiers remain byte-identical', async () => {
  assert.equal(sha256('src/features/surveys/model.tsx'), 'a1235d4b8322b5cdc901201200699ad6cb9e243923c7d77f442f04399ecfefde');
  for (const type of ['text','number','date','choice','yesno','multiple','phone','identity','household','gps','photo','document']) {
    assert.match(source, new RegExp(`"${type}"`), type);
  }
});

await ok('template-library and unsaved-authoring semantics remain unchanged', async () => {
  assert.equal(sha256('src/features/surveys/templateLibrary.ts'), '625c439d1e90642fc4e2f01c5d655040af45a7e4e51a2f401218599545903ca5');
  assert.equal(sha256('src/shared/authoringNavigation.tsx'), 'd93c54c26c766e36357a9f5aedeeef0235f8a66b518cfa451e079ba56f8c03d7');
  assert.match(source, /useDirtyAuthoring\(dirty\)/);
  assert.match(source, /if \(!\(await requestAuthoringNavigation\(\)\)\) return;/);
});

await ok('draft save and publish RPC callbacks remain wired to the existing operations', async () => {
  for (const rpcName of [
    'save_organization_template_draft',
    'save_template_draft',
    'publish_organization_template_draft',
    'publish_template_draft',
    'moderate_survey_template',
  ]) assert.match(source, new RegExp(`"${rpcName}"`), rpcName);
  assert.match(source, /if \(dirty \|\| !version\) throw new Error\("Save this draft before continuing\."\)/);
  assert.match(source, /const errors = dependencyErrors\(qs\)/);
});

await ok('question add remove duplicate and reorder behavior remains wired to existing structures', async () => {
  assert.match(source, /function move\(i: number, delta: number\)/);
  assert.match(source, /const errors = dependencyErrors\(next\)/);
  assert.match(source, /setQs\(\(items\) => \[\.\.\.items, next\]\)/);
  assert.match(source, /structuredClone\(qs\[i\]\)/);
  assert.match(source, /\.\.\.items\.slice\(0, i \+ 1\), copy, \.\.\.items\.slice\(i \+ 1\)/);
  assert.match(source, /other\.when\?\.question === question\.id \|\| other\.after === question\.id/);
  assert.match(source, /setQs\(\(items\) => items\.filter\(\(_, n\) => n !== i\)\)/);
});

await ok('conditional logic and validation wiring preserves existing semantics', async () => {
  assert.match(source, /parent\.type === "yesno" \? true : parent\.options\?\.\[0\] \|\| ""/);
  assert.match(source, /q\.when!\.question/);
  assert.match(source, /e\.target\.value === "true"/);
  assert.match(source, /q\.type === "date"/);
  assert.match(source, /after: e\.target\.value \|\| undefined/);
  assert.match(source, /required: e\.target\.checked/);
  assert.match(source, /min: e\.target\.value === "" \? undefined : Number\(e\.target\.value\)/);
  assert.match(source, /max: e\.target\.value === "" \? undefined : Number\(e\.target\.value\)/);
});

await ok('preview and publish action hierarchy keep the existing callbacks', async () => {
  assert.match(source, /<TemplatePreview questions=\{qs\} \/>/);
  assert.match(source, /onClick=\{\(\) => setPreview\(true\)\}/);
  assert.match(source, /<form onSubmit=\{publishOrSubmit\}/);
  assert.match(source, /onClick=\{\(\) => void saveDraft\(\)\}/);
  assert.match(source, /disabled=\{busy \|\| !qs\.length \|\| dirty \|\| !version\}/);
});

await ok('SurveyTemplates does not introduce a nested main landmark', async () => {
  assert.doesNotMatch(source, /<main\b/);
  assert.match(source, /<section className=\{styles\.canvasPanel\} aria-label="Survey question canvas">/);
});

await ok('SurveyTemplates does not duplicate the AppShell page-level Survey Templates heading', async () => {
  assert.doesNotMatch(source, /title=\{ngoMode \? "Organization survey templates" : "Survey templates"\}/);
  assert.match(source, /title="Template library"/);
  assert.match(source, /id: "drafts", label:/);
  assert.match(source, /id: "builder", label: "Builder"/);
  assert.match(source, /id: "published", label:/);
});

await ok('collector preview lists use collision-safe presentation keys instead of option labels', async () => {
  const previewStart = source.indexOf('const renderQuestionPreview');
  const previewEnd = source.indexOf('const renderQuestionList');
  assert.ok(previewStart >= 0 && previewEnd > previewStart);
  const previewSource = source.slice(previewStart, previewEnd);
  assert.doesNotMatch(previewSource, /key=\{option\}/);
  assert.match(previewSource, /key=\{`\$\{question\.id\}-preview-choice-\$\{optionIndex\}`\}/);
  assert.match(previewSource, /key=\{`\$\{question\.id\}-preview-multiple-\$\{optionIndex\}`\}/);
});

await ok('builder separates library drafts builder and published-version presentation', async () => {
  assert.match(source, /type MineView = "drafts" \| "builder" \| "published"/);
  assert.match(source, /id: "drafts", label:/);
  assert.match(source, /id: "builder", label: "Builder"/);
  assert.match(source, /id: "published", label:/);
  assert.match(source, /tab === "library"/);
  assert.match(source, /mineView === "drafts"/);
  assert.match(source, /mineView === "builder"/);
  assert.match(source, /mineView === "published"/);
});

await ok('desktop builder uses questions canvas and settings regions with shared primitives', async () => {
  assert.match(source, /className=\{styles\.questionsPanel\}/);
  assert.match(source, /className=\{styles\.canvasPanel\}/);
  assert.match(source, /className=\{styles\.settingsPanel\}/);
  for (const primitive of ['ActionMenu','Alert','Button','Card','Drawer','Field','FieldGroup','FormActions','FormSection','SectionHeader','Select','StatusBadge','Tabs','Textarea']) {
    assert.match(source, new RegExp(`\\b${primitive}\\b`), primitive);
  }
  assert.match(css, /grid-template-columns: minmax\(220px, \.8fr\) minmax\(360px, 1\.7fr\) minmax\(280px, 1fr\)/);
});

await ok('mobile and tablet builder use sheet or drawer presentation instead of shrinking three columns', async () => {
  assert.match(source, /<BottomSheet open=\{questionsOpen\} title="Questions"/);
  assert.match(source, /<Drawer open=\{settingsOpen\} title="Question settings"/);
  assert.match(css, /@media \(max-width: 1023px\)/);
  assert.match(css, /@media \(max-width: 639px\)/);
  assert.match(css, /\.settingsPanel \{\s*display: none;/);
  assert.match(css, /\.questionsPanel \{\s*display: none;/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /safe-area-inset-bottom/);
});

await ok('Survey Template Builder uses a scoped CSS Module and approved FieldLance tokens', async () => {
  assert.match(source, /import styles from "\.\/SurveyTemplates\.module\.css"/);
  assert.match(css, /var\(--fl-/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(css, /\brgb\s*\(/i);
  assert.doesNotMatch(css, /!important/);
  assert.doesNotMatch(css, /(?:^|\})\s*(?:header|nav|input|table|\.actions|\.panel)\s*\{/m);
});

await ok('feature-local operational typography respects the 12px design-system floor', async () => {
  const sizes = [...css.matchAll(/font-size:\s*([0-9.]+)px/g)].map((match) => Number(match[1]));
  assert.ok(sizes.length > 0);
  assert.equal(sizes.some((size) => size < 12), false, `sizes=${sizes.join(',')}`);
});

await ok('feature module does not introduce brand palette or generic shared-control styling', async () => {
  assert.doesNotMatch(css, /--fl-[a-z-]+\s*:/);
  assert.doesNotMatch(css, /\.fl-button\s*\{/);
  assert.doesNotMatch(css, /\.fl-field\s*\{/);
  assert.doesNotMatch(css, /\.fl-card\s*\{/);
  assert.doesNotMatch(css, /\.fl-status-badge\s*\{/);
});

await ok('Survey Form Responses and Offline field implementations remain byte-identical', async () => {
  assert.equal(sha256('src/features/surveys/SurveyForm.tsx'), '76f8199c4748615eadaa5179fdb62f66fa1b7722a54a71c2599f76b9e2aa6c8c');
  assert.equal(sha256('src/features/surveys/SurveyProjectDetail.tsx'), '78ddf3b5ccc327ef568b46c76f950b1d9a9a0098dd2910a6cef6fa75524ee828');
  assert.equal(sha256('src/features/surveys/SurveyReviewQueue.tsx'), '9c612cdf3f20ba5d0620e8d8861ba0c54e25c804a4b4a88079df457ae35676cd');
  assert.equal(sha256('src/features/surveys/OfflineFieldWorkspace.tsx'), 'a6ad7bb54bdffc7c3e30456b9774dffb948aeb2f942530055c66546f4f4e4f38');
});

await ok('Supabase client and authorization surface remain unchanged by the presentation patch', async () => {
  assert.equal(sha256('src/lib/supabase/client.ts'), '1105a65770beb2f4cc954c09ae901707859c16389d21872f2adb41208a4fa6cc');
  assert.doesNotMatch(source, /\.from\("(?!survey_template_drafts|survey_template_review_events|survey_templates)[^"]+"\)/);
});

console.log(`\n${passed} FieldLance 2.42.2 Survey Template Builder scenarios passed.`);
