import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

let passed = 0;
function ok(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

const read = (path) => readFileSync(path, 'utf8');

ok('sidebar groups include recruitment and withdrawal operations', () => {
  const source = read('src/components/ui/WorkflowOverview.tsx');
  assert.match(source, /pages:\[[^\]]*'Recruitment'/s);
  assert.match(source, /pages:\[[^\]]*'Withdrawal operations'/s);
});

ok('shared pager is the only pager implementation', () => {
  assert.equal(existsSync('src/components/ui/Pager.tsx'), true);
  assert.equal(existsSync('src/features/needs/Pager.tsx'), false);
  assert.equal(existsSync('src/features/surveys/Pager.tsx'), false);

  for (const path of [
    'src/features/needs/NeedDetail.tsx',
    'src/features/needs/NeedsPanel.tsx',
    'src/features/surveys/SurveyProjectDetail.tsx',
    'src/features/surveys/SurveyProjects.tsx',
    'src/features/surveys/SurveyTemplates.tsx',
  ]) {
    assert.match(read(path), /components\/ui\/Pager/);
    assert.doesNotMatch(read(path), /\bchange=\{/);
  }
});

ok('confirmed dead volunteer review component is removed', () => {
  assert.equal(existsSync('src/features/volunteers/ReviewForm.tsx'), false);
});

ok('unused legacy favicon is removed while branded favicon remains', () => {
  assert.equal(existsSync('public/favicon.svg'), false);
  const html = read('index.html');
  assert.match(html, /poem-emblem\.jpeg/);
  assert.doesNotMatch(html, /favicon\.svg/);
  assert.doesNotMatch(read('scripts/build-field-worker.mjs'), /favicon\.svg/);
  assert.doesNotMatch(read('scripts/test-field-worker211.mjs'), /favicon\.svg/);
});

ok('frontend foundation release remains migration-free', () => {
  const migrations = read('FILES.txt')
    .split(/\r?\n/)
    .filter((path) => path.startsWith('supabase/migrations/') && path.endsWith('.sql'));
  assert.equal(migrations.at(-1), 'supabase/migrations/20261009000400_case_followup_outcomes_closure.sql');
});

console.log(`\n${passed} POEM 2.19.4 frontend foundation scenarios passed.`);
