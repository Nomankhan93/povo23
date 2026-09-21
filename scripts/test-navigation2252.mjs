import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getNavigationGroups,readSidebarCollapsed,saveSidebarCollapsed,workspacePageLabel} from '../src/app/navigation.ts';
let passed=0;
const ok=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)};
await ok('every workspace groups authorized pages exactly once without adding permissions',()=>{
 const allowed=['Overview','Notifications','Task Center','My profile','Work experience','Private documents','Project team','Project funding','Unknown future page'];
 for(const kind of ['personal','organization','staff','project','onboarding','access']){
  const groups=getNavigationGroups(kind,allowed);const pages=groups.flatMap(g=>g.pages);
  assert.deepEqual([...pages].sort(),[...allowed].sort());assert.equal(new Set(pages).size,pages.length);assert.equal(new Set(groups.map(g=>g.label)).size,groups.length);
  assert(groups.every(g=>g.pages.length>0));assert.deepEqual(getNavigationGroups(kind,[]),[]);
 }
});
await ok('worker Updates and Tasks belong to Overview and verification belongs to Profile',()=>{
 const groups=getNavigationGroups('personal',['Overview','Task Center','Notifications','Verification','My profile','Private documents','Work experience']);
 assert.deepEqual(groups.find(g=>g.label==='Overview').pages,['Overview','Task Center','Notifications']);
 assert.deepEqual(groups.find(g=>g.label==='Profile').pages,['My profile','Verification','Private documents']);
 assert.deepEqual(groups.find(g=>g.label==='Career').pages,['Work experience']);
});
await ok('organization and staff finance and optional impact modules stay distinct',()=>{
 for(const kind of ['organization','staff']){
  const groups=getNavigationGroups(kind,['Project funding','Beneficiary cases','Assistance ledger','Data sharing']);
  assert.deepEqual(groups.find(g=>g.label==='Finance').pages,['Project funding']);
  assert.deepEqual(groups.find(g=>g.label==='Impact operations').pages,['Beneficiary cases','Assistance ledger','Data sharing']);
 }
});
await ok('onboarding exposes only application and updates supplied by resolver',()=>{
 assert.deepEqual(getNavigationGroups('onboarding',['Partner NGO application','Notifications']),[{label:'Organization',pages:['Partner NGO application','Notifications']}]);
});
await ok('sidebar preference persists and unavailable storage is safe',()=>{
 const data=new Map();globalThis.localStorage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 assert.equal(readSidebarCollapsed(),false);saveSidebarCollapsed(true);assert.equal(readSidebarCollapsed(),true);saveSidebarCollapsed(false);assert.equal(readSidebarCollapsed(),false);
 globalThis.localStorage={getItem:()=>{throw Error('blocked')},setItem:()=>{throw Error('blocked')}};
 assert.equal(readSidebarCollapsed(),false);saveSidebarCollapsed(true);delete globalThis.localStorage;
});
await ok('public labels preserve internal page identifiers',()=>{
 assert.equal(workspacePageLabel('Partner NGOs',true),'Organizations');assert.equal(workspacePageLabel('Partner NGO application',false),'Organization application');assert.equal(workspacePageLabel('Activity',true),'Account activity');
});
await ok('rendered navigation has accessible names active indication and notification count',async()=>{
 const {createServer}=await import('vite');const React=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
 const server=await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{
  const {SidebarNavigation}=await server.ssrLoadModule('/src/components/layout/SidebarNavigation.tsx');
  const html=renderToStaticMarkup(React.createElement(SidebarNavigation,{groups:getNavigationGroups('personal',['Overview','Notifications']),items:[['Overview',()=>null],['Notifications',()=>null]],page:'Notifications',label:p=>workspacePageLabel(p,true),unread:5,onNavigate:()=>{}}));
  assert.match(html,/aria-label="Main navigation"/);assert.match(html,/aria-label="Updates, 5 unread"/);assert.match(html,/aria-current="page"/);assert.match(html,/title="Updates"/);assert.match(html,/aria-controls="sidebar-group-0"/);
 }finally{await server.close()}
});
await ok('production sandbox rendering and import are dev-gated; unavailable channels are not shown',()=>{
 const shell=readFileSync('src/app/AppShell.tsx','utf8'),notifications=readFileSync('src/features/notifications/Notifications.tsx','utf8');
 assert.match(shell,/const MockEWalletSandbox = import.meta.env.DEV \? lazy/);assert.match(shell,/name !== "E-Wallet sandbox" \|\| import.meta.env.DEV/);assert.match(shell,/page === "E-Wallet sandbox" && import.meta.env.DEV/);
 assert.doesNotMatch(notifications,/<strong>Email alerts<\/strong>|<strong>Push alerts<\/strong>/);
 assert.match(notifications,/p_email: preferences.email_enabled/);assert.match(notifications,/p_push: preferences.push_enabled/);
});
console.log(`\n${passed} navigation stabilization scenarios passed.`);
