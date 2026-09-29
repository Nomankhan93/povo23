import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {create,act} from 'react-test-renderer';
const require=createRequire(import.meta.url);
function load(file,mocks){const module={exports:{}};const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(name=>name in mocks?mocks[name]:require(name),module,module.exports);return module.exports;}
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const Null=()=>null;
function MapFixture(){return null;}
const emptyQuery={select(){return this},eq(){return this},maybeSingle:async()=>({data:{title:'Project'},error:null})};
const mocks={
 '../../lib/supabase/client':{db:{from:()=>emptyQuery}},
 './ProjectTeamWorkspace':{ProjectTeamWorkspace:Null},'./ProjectOverview':{ProjectOverview:Null},'./ProjectDocuments':{ProjectDocuments:Null},'./ProjectActivity':{ProjectActivity:Null},
 './projectNavigation':{protectProjectNavigation:async commit=>commit()},
 '../maps/FieldOperationsMap':{FieldOperationsMap:MapFixture},
 '../cases/BeneficiaryCasesWorkspace':{BeneficiaryCasesWorkspace:Null},
 'lucide-react':new Proxy({},{get:()=>Null})
};
const {ProjectWorkspace}=load('src/features/projects/ProjectWorkspace.tsx',mocks);
const props={userId:'alice',projectId:'project',organization:null,geographies:[],orgs:[],canManageTeam:false,canManageRecruitment:false,canManageProject:false,canManageFinance:false,canManageCases:false,platformFinance:false,surveyManage:false,routeTab:'map'};
let selected=null,route=null,view;
await act(async()=>{view=create(React.createElement(ProjectWorkspace,{...props,onNavigate:()=>{throw Error('Generic navigation must not lose case identity')},onOpenDelegatedCase:id=>selected=id,onRouteChange:(...args)=>route=args}));});
await act(async()=>{view.root.findByType(MapFixture).props.onOpenSource({source_kind:'case',source_context_id:'case-exact'});});
assert.equal(selected,'case-exact');assert.equal(route,null);
await act(async()=>view.unmount());
await act(async()=>{view=create(React.createElement(ProjectWorkspace,{...props,canManageCases:true,onNavigate:()=>{},onRouteChange:(...args)=>route=args}));});
await act(async()=>{view.root.findByType(MapFixture).props.onOpenSource({source_kind:'case',source_context_id:'managed-case'});});
assert.deepEqual(route,['cases','case','managed-case']);
await act(async()=>view.unmount());
const {routePath,parseAppRoute}=load('src/app/routes.ts',{});
for(const scope of ['personal','project:project']){
 const page=scope==='personal'?'My Cases':'Beneficiary cases';
 const path=routePath({scope,page,entityKind:'case',entityId:'case-exact'});
 assert.equal(parseAppRoute(path).entityId,'case-exact');
}
console.log('PASS rendered delegated map action and personal/project routes retain exact case ID');
