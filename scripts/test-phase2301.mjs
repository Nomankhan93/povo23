import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerActiveDraft} from '../src/features/surveys/activeDraft.ts';
import {protectProjectNavigation} from '../src/features/projects/projectNavigation.ts';
import {workspaceTeamPermission} from '../src/features/projects/workspacePermissions.ts';

let release;
let committed=false;
const pending=new Promise(resolve=>{release=resolve});
let cleanup=registerActiveDraft(()=>pending);
const navigation=protectProjectNavigation(()=>{committed=true});
await Promise.resolve();
assert.equal(committed,false,'navigation must wait for device draft persistence');
release(); await navigation; assert.equal(committed,true); cleanup();
console.log('PASS project navigation waits for pending device writes');
for (const message of ['disk full','Wait for attachment capture/location to finish']) {
  committed=false;
  cleanup=registerActiveDraft(async()=>{throw Error(message)});
  await assert.rejects(()=>protectProjectNavigation(()=>{committed=true}),{message});
  assert.equal(committed,false,'failed save/capture guard must keep form mounted');
  cleanup();
}
console.log('PASS draft failures and active capture block project navigation');
committed=false; await protectProjectNavigation(()=>{committed=true}); assert.equal(committed,true);
console.log('PASS navigation without a mounted draft proceeds');
for (const [staff,owner,expected] of [[false,false,false],[true,false,true],[false,true,true],[true,true,true]]) {
  assert.equal(workspaceTeamPermission(staff,owner),expected);
}
console.log('PASS team management permission combinations');
const workspace=readFileSync('src/features/projects/ProjectWorkspace.tsx','utf8');
assert.match(workspace,/await protectProjectNavigation\(commit\)/);
assert.match(workspace,/onClick=\{\(\) => openTab\(item.id\)\}/);
assert.match(workspace,/onOpenTab=\{openTab\}/);
assert.match(workspace,/navigate\(\(\) => \{setTab\(next\);onRouteChange/);
for (const name of ['ProjectFundingWorkspace','SurveyProjects','ProjectGovernance','WorkforceMarketplace']) {
  assert.match(workspace,new RegExp('const '+name+' = lazy'));
  assert.doesNotMatch(workspace,new RegExp('import \{ '+name+' \} from'));
}
const overview=readFileSync('src/features/projects/ProjectOverview.tsx','utf8');
assert.match(overview,/from\("work_applications"\)[^;]*\["pending", "shortlisted"\]/);
console.log('PASS navigation wiring, lazy boundaries and pending application query contract');
