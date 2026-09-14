import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const dir=mkdtempSync(resolve('.workflow-ui-test-'));
try{
 const source=readFileSync('src/components/ui/WorkflowOverview.tsx','utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 writeFileSync(dir+'/component.mjs',compiled);
 const {WorkflowOverview,navigationGroups,StatusBadge}=await import(pathToFileURL(dir+'/component.mjs'));
 const render=props=>renderToStaticMarkup(React.createElement(WorkflowOverview,{staff:false,personal:false,profileStatus:'Draft',unread:0,allowed:[],onNavigate(){},onField(){},...props}));
 const limited=render({staff:true,allowed:['Survey projects']});
 assert(limited.includes('Open survey projects'));assert(!limited.includes('Open canonical registry'));assert(!limited.includes('Open volunteers'));
 console.log('PASS dashboard actions respect supplied role navigation');
 const personal=render({personal:true,allowed:['My profile','Invitations'],unread:3,profileStatus:'Active'});
 assert(personal.includes('Admin approval is not required'));assert(personal.includes('Open invitations'));assert(!personal.includes('Open verification'));assert(personal.includes('Active'));
 console.log('PASS personal workspace preserves self-publication and relevant actions');
 assert(render({profileStatus:'<script>',personal:true}).includes('&lt;script&gt;'));
 assert(renderToStaticMarkup(React.createElement(StatusBadge,{tone:'warning'},'Offline')).includes('Offline'));
 console.log('PASS status uses visible text and profile values are escaped');
 const pages=navigationGroups.flatMap(g=>g.pages);assert.equal(new Set(pages).size,pages.length);
 for(const page of ['Overview','My profile','Private documents','Canonical registry','Survey projects','Notifications','Activity'])assert(pages.includes(page));
 console.log('PASS navigation groups are unique and cover key workflows');
}finally{rmSync(dir,{recursive:true,force:true})}
