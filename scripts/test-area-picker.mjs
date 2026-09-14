import assert from 'node:assert/strict';import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import ts from 'typescript';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
const dir=mkdtempSync(resolve('.area-test-'));let count=0;function test(n,f){f();count++;console.log('PASS '+n)}
try{
for(const name of ['areaSelection','AreaSelector']){const file='src/features/geography/'+name+(name==='AreaSelector'?'.tsx':'.ts');let code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace("'./areaSelection'","'./areaSelection.mjs'");writeFileSync(dir+'/'+name+'.mjs',code)}
const h=await import(pathToFileURL(dir+'/areaSelection.mjs')), {AreaSelector}=await import(pathToFileURL(dir+'/AreaSelector.mjs'));
const g=(id,parent_id,kind,name=id,active=true)=>({id,parent_id,kind,name,active,code:id,source_note:''});
const rows=[g('s',null,'province','Sindh'),g('b',null,'province','Balochistan'),g('i',null,'province','Islamabad'),g('div','s','division','Mirpurkhas'),g('d','div','district','Umerkot'),g('t2','d','taluka','Umerkot'),g('t','d','taluka','Kunri'),g('uc','t','uc','UC 1'),g('v','uc','village','Village 1'),g('w','uc','ward','Ward 1'),g('ict','i','district','Islamabad District'),g('bad','missing','district'),g('off','d','taluka','Inactive',false),g('offchild','off','uc')];
const render=value=>renderToStaticMarkup(React.createElement(AreaSelector,{rows,value,onChange(){}}));
test('all provinces alphabetical; no reference-code-only restriction',()=>assert.deepEqual(h.areaOptions(null,rows).map(g=>g.name),['Balochistan','Islamabad','Sindh']));
test('children filtered and alphabetically sorted',()=>assert.deepEqual(h.areaOptions('d',rows).map(g=>g.name),['Kunri','Umerkot']));
test('district selection represents whole district',()=>{const html=render('d');assert(html.includes('Whole Umerkot'));assert(html.includes('Selected: Sindh / Mirpurkhas / Umerkot'));assert(!html.includes('value="t" selected'))});
test('changing parent discards all descendant values',()=>{assert.deepEqual(h.areaPath('s',rows).map(g=>g.id),['s']);assert(!render('b').includes('Kunri'));assert(!render('d').includes('Village 1'))});
test('configured UC village and ward appear at their parent',()=>{const html=render('uc');assert(html.includes('Village 1'));assert(html.includes('Ward 1'));assert(render('t').includes('Union Council'))});
test('skipped division hierarchy works',()=>assert(render('i').includes('Islamabad District')));
test('inactive ancestors missing parents and cycles cannot be selected',()=>{assert(!h.selectableArea('offchild',rows));assert(!h.selectableArea('bad',rows));assert(!h.selectableArea('cycle',[g('cycle','cycle','district')]))});
test('multi-area add preserves saved IDs and prevents duplicates',()=>{const old=['saved-inactive'];const a=h.addOperatingArea(old,'t',rows);assert.deepEqual(a,['saved-inactive','t']);assert.equal(h.addOperatingArea(a,'t',rows),a);assert.equal(h.addOperatingArea(old,'s',rows),old);assert.equal(h.addOperatingArea(old,'off',rows),old);assert(h.areaCaption('saved-inactive',rows).includes('saved-inactive'))});
test('selection maximum retained',()=>{const old=Array.from({length:100},(_,i)=>String(i));assert.equal(h.addOperatingArea(old,'t',rows),old)});
console.log(count+' area picker scenarios passed');
}finally{rmSync(dir,{recursive:true,force:true})}
