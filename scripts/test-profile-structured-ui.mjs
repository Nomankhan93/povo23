import assert from "node:assert/strict";
import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const profile = fs.readFileSync("src/features/volunteers/ProfileForm.tsx", "utf8");
const structured = fs.readFileSync("src/features/volunteers/StructuredProfileFields.tsx", "utf8");
const helpers = fs.readFileSync("src/features/volunteers/profileStructure.ts", "utf8");
const experience = fs.readFileSync("src/features/volunteers/ExperiencePanel.tsx", "utf8");
const shell = fs.readFileSync("src/app/AppShell.tsx", "utf8");
const view = fs.readFileSync("src/features/volunteers/ProfileDetailsView.tsx", "utf8");

function ok(name, fn) {
  fn();
  console.log(`PASS ${name}`);
}

ok("release is Phase 2.7.3", () => assert.equal(pkg.version, "2.7.3"));
ok("profile replaces free-text CV fields with structured editors", () => {
  assert.match(profile, /StructuredProfileFields/);
  assert.doesNotMatch(profile, /\["education", "Education"\]/);
  assert.doesNotMatch(profile, /\["skills", "Skills \(comma separated\)"\]/);
  assert.doesNotMatch(profile, /\["experience", "Work and survey experience"\]/);
  assert.doesNotMatch(profile, /\["references", "References"\]/);
});
ok("education is a controlled dropdown with Other", () => {
  assert.match(structured, /Highest education level/);
  assert.match(structured, /educationOptions/);
  assert.match(structured, /Other education/);
});
ok("skills and languages are searchable multi-selects", () => {
  assert.match(structured, /SearchableMultiSelect label="Skills"/);
  assert.match(structured, /SearchableMultiSelect label="Languages"/);
  assert.match(structured, /type="checkbox"/);
  assert.match(structured, /Search .*toLowerCase/);
});
ok("preferred work areas use the structured geography picker", () => {
  assert.match(structured, /Preferred work areas/);
  assert.match(structured, /<GeographyPicker rows=\{rows\}/);
  assert.match(structured, /Add preferred area/);
  assert.match(helpers, /encodePreferredAreaIds/);
});
ok("references are repeatable structured records with bounded JSON compatibility", () => {
  assert.match(structured, /ReferencesEditor/);
  assert.match(structured, /Add reference/);
  assert.match(structured, /rows\.length >= 3/);
  assert.match(helpers, /encodeReferences/);
  assert.match(helpers, /Legacy reference/);
});
ok("work experience reuses the NGO-confirmable structured experience workflow", () => {
  const myProfile = shell.slice(shell.indexOf('page === "My profile"'), shell.indexOf('page === "Volunteers"'));
  assert.match(myProfile, /<ExperiencePanel/);
  assert.match(experience, /Choose role/);
  assert.match(experience, /Other role/);
  assert.match(experience, /Work performed/);
});
ok("authorized profile detail view decodes structured fields instead of exposing raw JSON", () => {
  assert.match(view, /preferredAreaLabels/);
  assert.match(view, /parseReferences/);
  assert.match(view, /parseCommaList/);
  assert.match(shell, /<ProfileDetailsView/);
});
ok("legacy profile data remains backward compatible", () => {
  assert.match(helpers, /splitEducation/);
  assert.match(helpers, /parseCommaList/);
  assert.match(helpers, /Legacy reference/);
  assert.match(profile, /legacy work-experience note is preserved/i);
});

console.log("9 Phase 2.7.3 structured volunteer-profile UI tests passed.");
