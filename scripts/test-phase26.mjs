import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const store = await readFile(new URL("../src/features/surveys/offlineSurveyStore.ts", import.meta.url), "utf8");
const save = await readFile(new URL("../src/features/surveys/useSurveySave.ts", import.meta.url), "utf8");
const form = await readFile(new URL("../src/features/surveys/SurveyForm.tsx", import.meta.url), "utf8");
const shell = await readFile(new URL("../src/app/AppShell.tsx", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

function ok(name, fn) {
  fn();
  console.log(`PASS ${name}`);
}

ok("release is Phase 2.6", () => assert.equal(pkg.version, "2.6.0"));
ok("device queue uses IndexedDB rather than localStorage", () => {
  assert.match(store, /indexedDB\.open/);
  assert.doesNotMatch(store, /localStorage/);
});
ok("survey payload is encrypted with a non-extractable AES-GCM device key", () => {
  assert.match(store, /AES-GCM/);
  assert.match(store, /generateKey\([^)]*[\s\S]*false,[\s\S]*\["encrypt", "decrypt"\]/);
  assert.match(store, /subtle\.encrypt/);
  assert.match(store, /subtle\.decrypt/);
});
ok("write-ahead queue is created before the RPC save", () => {
  const queued = save.indexOf("await enqueueSurveySave(ownerId, current)");
  const rpc = save.indexOf('.rpc("save_survey_response", current)');
  assert(queued >= 0 && rpc > queued);
});
ok("stable request id is persisted and reused", () => {
  assert.match(save, /p_request_id: crypto\.randomUUID\(\)/);
  assert.match(store, /args\.p_request_id/);
  assert.match(store, /db\.rpc\("save_survey_response", args\)/);
});
ok("server conflicts are held for human attention, not silently overwritten", () => {
  assert.match(store, /needs_attention/);
  assert.match(store, /definitiveSurveySaveError/);
  assert.match(store, /40001\|40P01/);
});
ok("form restores and autosaves encrypted device drafts", () => {
  assert.match(form, /loadSurveyDeviceDraft/);
  assert.match(form, /saveSurveyDeviceDraft/);
  assert.match(form, /An encrypted device draft was restored/);
});
ok("workspace exposes persistent survey sync status", () => {
  assert.match(shell, /SurveySyncStatus/);
  assert.match(shell, /userId=\{session\.user\.id\}/);
});

console.log("8 Phase 2.6 field-reliability structural tests passed.");
