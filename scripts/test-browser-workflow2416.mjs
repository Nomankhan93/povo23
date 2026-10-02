import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
const root=process.cwd(),temp=await mkdtemp(path.join(tmpdir(),'fieldlance-workflow-browser2416-')),dist=path.join(temp,'dist');
let server,browser;
try{
 await writeFile(path.join(temp,'index.html'),'<html><body><div id="root"></div><script type="module" src="'+path.join(root,'scripts/fixtures/workflow2416/main.jsx')+'"></script></body></html>');
 await build({configFile:false,root:temp,publicDir:path.join(root,'public'),plugins:[{name:'fixture-transport',enforce:'pre',resolveId(id){if(id.endsWith('/supabase/client'))return path.join(root,'scripts/fixtures/workflow2416/client.js');}},react()],resolve:{dedupe:['react','react-dom']},build:{outDir:dist,emptyOutDir:true},logLevel:'error'});
 server=createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');let file=!url.pathname.split('/').at(-1).includes('.')?'/index.html':url.pathname;try{const body=await readFile(path.join(dist,file));res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(body);}catch{res.writeHead(404);res.end('missing');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});

 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});page.on('dialog',dialog=>dialog.accept(dialog.defaultValue()));page.setDefaultTimeout(12000);
 const org='b4160000-0000-4000-8000-000000009002',id=n=>'b4160000-0000-4000-8000-'+String(n).padStart(12,'0');
 const templatePath='/org/'+org+'/survey-templates',projectPath='/org/'+org+'/projects';
 async function nav(name){if(await page.locator('#navigation-toggle').isVisible())await page.locator('#navigation-toggle').click();await page.locator('#workspace-navigation').getByRole('button',{name,exact:true}).click();}
 const stay=()=>page.getByRole('button',{name:'Stay / Continue editing',exact:true}).click();
 const discard=()=>page.getByRole('button',{name:'Discard changes',exact:true}).click();
 await page.goto(origin+templatePath);
 await page.getByLabel('Template name',{exact:true}).fill('Unsaved template');
 await nav('Projects');await stay();
 assert.equal(await page.getByLabel('Template name',{exact:true}).inputValue(),'Unsaved template');
 assert.equal(new URL(page.url()).pathname,templatePath);
 assert.equal(await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented}),true);
 page.removeAllListeners('dialog');
 const unloadPrompt=page.waitForEvent('dialog'),reload=page.evaluate(()=>location.reload());
 const unload=await unloadPrompt;assert.equal(unload.type(),'beforeunload');await unload.dismiss();await reload;
 assert.equal(await page.getByLabel('Template name',{exact:true}).inputValue(),'Unsaved template');
 page.on('dialog',dialog=>dialog.accept(dialog.defaultValue()));
 await page.getByRole('button',{name:'Open saved draft',exact:true}).click();await stay();
 await page.getByRole('button',{name:'New blank draft',exact:true}).click();await stay();
 assert.equal(await page.getByLabel('Template name',{exact:true}).inputValue(),'Unsaved template');
 // Native dialog keeps keyboard focus within the two explicit choices.
 await nav('Projects');await page.getByRole('button',{name:'Stay / Continue editing',exact:true}).focus();
 await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.querySelector('dialog[open]')?.contains(document.activeElement)),true);
 await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.querySelector('dialog[open]')?.contains(document.activeElement)),true);
 await page.keyboard.press('Escape');
 assert.equal(await page.getByLabel('Template name',{exact:true}).inputValue(),'Unsaved template');
 await nav('Projects');await discard();
 await page.getByLabel('Project title',{exact:true}).fill('Unsaved project');
 await nav('Survey templates');await stay();
 assert.equal(await page.getByLabel('Project title',{exact:true}).inputValue(),'Unsaved project');
 await page.getByRole('button',{name:'Open draft',exact:true}).click();await stay();
 await page.getByRole('button',{name:'New project draft',exact:true}).click();await stay();
 // Save clears dirty state, including a no-op edit restored to its saved value.
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 await page.getByText('Saved project draft',{exact:false}).waitFor();
 await page.getByLabel('Project title',{exact:true}).fill('Temporary edit');
 await page.getByLabel('Project title',{exact:true}).fill('Unsaved project');
 assert.equal(await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented}),false);
 await nav('Survey templates');
 await page.getByLabel('Template name',{exact:true}).fill('Template saved');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 await page.getByText('Organization template draft saved.',{exact:true}).waitFor();
 await nav('Projects');
 await page.getByLabel('Project title',{exact:true}).fill('History retained');
 await page.evaluate(()=>history.back());await stay();
 assert.equal(new URL(page.url()).pathname,projectPath);
 assert.equal(await page.getByLabel('Project title',{exact:true}).inputValue(),'History retained');
 await page.evaluate(()=>history.back());await discard();
 await page.getByLabel('Template name',{exact:true}).fill('Forward retained');
 await page.evaluate(()=>history.forward());await stay();
 assert.equal(new URL(page.url()).pathname,templatePath);
 await page.evaluate(()=>history.forward());await discard();
 await page.getByLabel('Project title',{exact:true}).fill('Workspace retained');
 if(await page.locator('#navigation-toggle').isVisible())await page.locator('#navigation-toggle').click();
 await page.locator('#scope').selectOption('poem');await stay();
 assert.equal(await page.getByLabel('Project title',{exact:true}).inputValue(),'Workspace retained');
 if(await page.locator('#navigation-toggle').isVisible())await page.locator('#navigation-toggle').click();
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await stay();
 assert.equal(await page.evaluate(()=>Boolean(window.signedOut)),false);
 for(const width of [360,390,430]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent?.slice(0,70),right:e.getBoundingClientRect().right})).slice(-30))))}
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByText('Project draft saved. Publish it when the project is ready to become operational.',{exact:true}).waitFor();
 await page.evaluate(()=>{window.fixture.failDraftFlush=true;history.back()});await page.getByText(/Could not protect device draft\. Please retry\./).waitFor();
 assert.equal(new URL(page.url()).pathname,projectPath);assert.equal(await page.getByLabel('Project title',{exact:true}).inputValue(),'Workspace retained');await page.evaluate(()=>window.fixture.failDraftFlush=false);
 console.log('PASS F04 actual AppShell: template/project sidebar, Stay/Discard/Escape, save/revert clean state, another draft, workspace/sign-out, Back/Forward and beforeunload');

 for(const width of [360,390,430]){
  await page.setViewportSize({width,height:844});
  await page.goto(origin+'/?surface=finance');
  const reserve=page.locator('form').filter({has:page.getByRole('button',{name:'Reserve funding',exact:true})});
  await reserve.getByLabel('Amount',{exact:true}).fill('100');
  await reserve.getByLabel('Reason',{exact:true}).fill('Retained finance intent');
  await reserve.getByRole('button',{name:'Reserve funding',exact:true}).click();
  await page.getByRole('button',{name:'Retry same request',exact:true}).waitFor();
  assert.equal(await reserve.getByLabel('Amount',{exact:true}).inputValue(),'100');
  assert.equal(await reserve.getByLabel('Reason',{exact:true}).inputValue(),'Retained finance intent');
  const key=await page.evaluate(()=>window.rpcCalls.find(c=>c.name==='reserve_project_funding').args.p_idempotency_key);
  if(width===390){await page.reload();await page.getByRole('button',{name:'Retry same request',exact:true}).waitFor();}
  await page.getByRole('button',{name:'Retry same request',exact:true}).click();
  await page.getByText('Funding operation confirmed in the journal.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(key=>JSON.parse(sessionStorage.getItem('fixture-journals')).filter(j=>j.idempotency_key===key).length,key),1);
  assert.equal(await page.getByRole('button',{name:'Retry same request',exact:true}).count(),0);
  await page.evaluate(()=>window.fixture.rejectFunding=true);
  await reserve.getByLabel('Amount',{exact:true}).fill('9999');
  await reserve.getByLabel('Reason',{exact:true}).fill('Rejected amount stays');
  await reserve.getByRole('button',{name:'Reserve funding',exact:true}).click();
  await page.getByText(/Funding was not recorded. Check/).waitFor();
  assert.equal(await reserve.getByLabel('Amount',{exact:true}).inputValue(),'9999');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }
 console.log('PASS F02 mobile 360/390/430: lost response, frozen payload, explicit safe retry, reload recovery, rejection values and no duplicate journal');

 for(const width of [360,390,430]){
  await page.setViewportSize({width,height:844});
  await page.goto(origin+'/app/work/assignments/'+id(1)+'?surface=recruitment');
  const focused=page.locator('#workforce-assignment-'+id(1));
  await focused.getByRole('button',{name:'Accept offer',exact:true}).waitFor();
  assert.equal(await page.locator('[id^="workforce-assignment-"]').count(),51);
  const queries=await page.evaluate(()=>window.queryCalls.filter(q=>q.table==='work_assignments'));
  assert(queries.some(q=>q.exact===id(1)&&q.limit===null));
  assert(queries.some(q=>!q.exact&&q.limit===51));
  await page.reload();await focused.getByRole('button',{name:'Accept offer',exact:true}).click();
  await focused.getByText(/Offer accepted/).waitFor();
  assert.equal(await focused.getByRole('button',{name:'Accept offer',exact:true}).count(),0);
  while(await page.getByRole('button',{name:'Load 50 more',exact:true}).count())await page.getByRole('button',{name:'Load 50 more',exact:true}).click();
  assert.equal(await page.locator('[id^="workforce-assignment-"]').count(),201);
  assert.equal(await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id^="workforce-assignment-"]')].map(e=>e.id);return new Set(ids).size}),201);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }
 await page.goto(origin+'/org/'+org+'/recruitment/applications/'+id(1001)+'?surface=recruitment');
 await page.locator('#workforce-application-'+id(1001)).getByRole('button',{name:'Select',exact:true}).waitFor();
 assert.equal(await page.locator('[id^="workforce-application-"]').count(),51);
 assert((await page.evaluate(()=>window.queryCalls)).some(q=>q.table==='work_applications'&&q.exact===id(1001)&&q.limit===null));
 await page.reload();await page.locator('#workforce-application-'+id(1001)).waitFor();
 while(await page.getByRole('button',{name:'Load 50 more',exact:true}).count())await page.getByRole('button',{name:'Load 50 more',exact:true}).click();
 assert.equal(await page.locator('[id^="workforce-application-"]').count(),501);
 assert.equal(await page.evaluate(()=>new Set([...document.querySelectorAll('[id^="workforce-application-"]')].map(e=>e.id)).size),501);
 await page.locator('#workforce-application-'+id(1001)).getByRole('button',{name:'Select',exact:true}).click();
 await page.locator('#workforce-application-'+id(1001)).getByRole('button',{name:'Send assignment offer',exact:true}).click();
 await page.getByRole('heading',{name:/Assignment terms for/}).waitFor();
 await page.goto(origin+'/app/work/assignments/'+id(201)+'?surface=recruitment');
 await page.locator('#workforce-assignment-'+id(201)).getByText(/Completed assignment/).waitFor();
 assert.equal(await page.locator('#workforce-assignment-'+id(201)).getByRole('button',{name:'Accept offer'}).count(),0);
 await page.goto(origin+'/app/work/assignments/'+id(999)+'?surface=recruitment');await page.getByText(/This recruitment record is unavailable/).waitFor();
 await page.goto(origin+'/app/work/assignments/'+id(1)+'?surface=recruitment&failFocus');await page.getByRole('button',{name:'Retry linked record'}).waitFor();
 await page.evaluate(()=>window.fixture.failFocus=false);await page.getByRole('button',{name:'Retry linked record'}).click();await page.locator('#workforce-assignment-'+id(1)).getByRole('button',{name:'Accept offer'}).waitFor();
 await page.addInitScript(()=>{Object.defineProperty(window,'fixture',{configurable:true,set(v){v.hidden=true;Object.defineProperty(window,'fixture',{value:v,writable:true,configurable:true})}})});
 await page.goto(origin+'/app/work/assignments/'+id(1)+'?surface=recruitment');await page.getByText(/This recruitment record is unavailable/).waitFor();
 assert.equal(await page.locator('[id^="workforce-assignment-"]').count(),0);
 console.log('PASS F05 exact older offer/application independent of 201/501 records, acceptance/reload, completed/unavailable/revoked states, bounded keyset pages without duplicates, mobile layouts');
 assert.deepEqual(errors,[]);

}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await rm(temp,{recursive:true,force:true});}
