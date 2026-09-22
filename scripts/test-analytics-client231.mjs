import assert from 'node:assert/strict';
import {reportCSV,csvCell} from '../src/features/analytics/model.ts';
for(const value of ['=cmd()','+SUM(1,2)','-10','@SUM(1)','  =HYPERLINK("x")','\tformula'])assert.ok(csvCell(value).startsWith('"\''));
assert.equal(csvCell('one,"two"\nthree'),'"one,""two""\nthree"');
const csv=reportCSV([{id:'ref',kind:'responses',label:'Safe',status:'submitted',created_at:'2026-01-01',project_name:'Project',organization_name:'Org',geography_name:'Area',due_on:null,amount:null,currency:null,person_id:'private',answers:{secret:'hidden'}}]);
assert.ok(!csv.includes('private'));assert.ok(!csv.includes('hidden'));assert.ok(csv.includes('Project'));
console.log('PASS CSV formula neutralization, escaping and explicit export-field allowlist');
