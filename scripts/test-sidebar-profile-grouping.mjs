import assert from 'node:assert/strict';
import {getNavigationGroups} from '../src/app/navigation.ts';
const groups=getNavigationGroups('personal',['My profile','Work experience','Private documents','Verification']);
assert.deepEqual(groups.find(g=>g.label==='Profile').pages,['My profile','Verification','Private documents']);
assert.deepEqual(groups.find(g=>g.label==='Career').pages,['Work experience']);
console.log('PASS worker profile and private documents stay together; work history belongs to Career');
