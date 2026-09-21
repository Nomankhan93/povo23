import fs from "node:fs";
import assert from "node:assert/strict";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const workspace = read("src/features/projects/ProjectWorkspace.tsx");
const shell = read("src/app/AppShell.tsx");
const navigation = read("src/app/navigation.ts");

for (const label of ["Overview", "Team", "Recruitment", "Field Work", "Responses", "Finance", "Governance", "Documents", "Activity"]) {
  assert.match(workspace, new RegExp(label.replace(/[ -]/g, "[ -]")), `workspace tab missing: ${label}`);
}
for (const label of ["Opportunities", "Applications", "Shortlisted", "Offers", "Direct Invitations", "Assignments"]) {
  assert.match(workspace, new RegExp(label), `recruitment pipeline missing: ${label}`);
}
assert.match(shell, /ProjectWorkspace/);
assert.match(shell, /page === "Project workspace"/);
assert.match(navigation, /project: \[/);
assert.match(navigation, /'Recruitment'/);
const organizationBlock = navigation.slice(navigation.indexOf("organization: ["), navigation.indexOf("staff: ["));
assert.doesNotMatch(organizationBlock, /pages:\[[^\]]*'Invitations'/, "direct invitations must be consolidated into recruitment");
assert.match(workspace, /mode="project"/);
assert.match(workspace, /ProjectFundingWorkspace/);
console.log("phase 2.27 project workspace checks passed");
