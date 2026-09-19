import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let passed = 0;
async function ok(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

const auth = readFileSync('src/features/auth/Auth.tsx', 'utf8');
const css = readFileSync('src/styles/design-system.css', 'utf8');

await ok('auth keeps one account while presenting three workspace destinations', async () => {
  assert.match(auth, /Volunteer/);
  assert.match(auth, /Partner NGO/);
  assert.match(auth, /FieldLance staff/);
  assert.match(auth, /Choose FieldLance workspace/i);
  assert.match(auth, /Sign in to FieldLance/i);
});

await ok('auth uses role-specific operational storytelling without changing account semantics', async () => {
  assert.match(auth, /Find field work\. Build experience\. Earn\./i);
  assert.match(auth, /Build reliable field teams\./i);
  assert.match(auth, /Operate the field-work network with clarity\./i);
  assert.match(auth, /Create your FieldLance account/i);
});

await ok('authentication controls are concise and accessible', async () => {
  assert.match(auth, /Create account/);
  assert.match(auth, /: \"Sign in\"/);
  assert.match(auth, /Forgot password\?/);
  assert.match(auth, /password-toggle/);
  assert.match(auth, /EyeOff/);
  assert.match(auth, /role="tablist"/);
  assert.match(auth, /aria-selected/);
  assert.doesNotMatch(auth, /POEM \{APP_VERSION\}/);
});

await ok('premium auth styling uses a 43 57 split enterprise primary and white fields', async () => {
  assert.match(css, /43%\) minmax\(0,57%\)/);
  assert.match(css, /--fieldlance-blue:#0a78d8/i);
    assert.match(css, /--fieldlance-green:#00b96f/i);
    assert.match(css, /--fieldlance-navy:#071a32/i);
  assert.match(css, /\.auth-shell-premium input\{[^}]*background:#fff/);
  assert.match(css, /auth-account-note/);
  assert.match(css, /auth-primary-action/);
});

await ok('mobile auth keeps compact brand context instead of squeezing desktop split view', async () => {
  assert.match(css, /@media\(max-width:800px\)/);
  assert.match(css, /\.auth-shell-premium\{display:block/);
  assert.match(css, /\.auth-story-main h1[^}]*display:none/);
});

console.log(`\n${passed} POEM 2.13.2 authentication experience scenarios passed.`);
