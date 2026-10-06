import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
const root=process.cwd(),temp=await mkdtemp(path.join(tmpdir(),'fieldlance-recruitment2418-')),dist=path.join(temp,'dist');
const id=n=>'b4180000-0000-4000-8000-'+String(n).padStart(12,'0'),org=id(2),project=id(3),opportunity=id(4);
let server,browser,stage='build';
try{
 await writeFile(path.join(temp,'index.html'),'<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><div id="root"></div><script type="module" src="'+path.join(root,'scripts/fixtures/recruitment2418/main.jsx')+'"></script></body></html>');
 await build({configFile:false,root:temp,publicDir:path.join(root,'public'),plugins:[{name:'fixture-transport',enforce:'pre',resolveId(id){if(id.endsWith('/supabase/client'))return path.join(root,'scripts/fixtures/recruitment2418/client.js');}},react()],resolve:{dedupe:['react','react-dom']},build:{outDir:dist,emptyOutDir:true},logLevel:'error'});
 server=createServer(async(req,res)=>{const p=new URL(req.url,'http://localhost').pathname;const file=p.startsWith('/assets/')?p:'/index.html';try{const body=await readFile(path.join(dist,file));res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(body)}catch{res.writeHead(404);res.end('missing')}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error('Page error:',e.message)});page.setDefaultTimeout(12000);
 await page.addInitScript(()=>{window.gpsRequests=0;Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(){window.gpsRequests++}}})});
 const go=async(route,role='worker',scenario='normal')=>{await page.goto(origin+route+'?role='+role+'&case='+scenario)};
 const assignmentCard=()=>page.locator('#workforce-assignment-'+id(20));
 const applicationCard=()=>page.locator('#workforce-application-'+id(10));
 for(const width of [360,390,430]){
  await page.setViewportSize({width,height:844});
  for(const index of [0,10,20]){
   stage='Apply '+width+'/'+index;
   await go('/app/work/opportunities','worker','apply');
   const trigger=page.locator('.workforce-opportunity-card').nth(index).getByRole('button',{name:'Apply',exact:true});
   await trigger.click();
   const dialog=page.getByRole('dialog',{name:'Apply — Community opportunity '+index});await dialog.waitFor();
   const bounds=await dialog.boundingBox();assert.ok(bounds.y>=0&&bounds.y+bounds.height<=845);
   assert.equal(await dialog.getByLabel('Availability for this assignment').evaluate(el=>el===document.activeElement),true);
   if(width===390&&index===10){
    await dialog.getByLabel('Short message').fill('Preserve my application draft');
    await dialog.getByRole('checkbox').check();
    await page.evaluate(()=>window.fixture.failApply=true);
    await dialog.getByRole('button',{name:'Submit application'}).click();
    await dialog.getByRole('alert').waitFor();
    assert.equal(await dialog.getByLabel('Short message').inputValue(),'Preserve my application draft');
    await page.evaluate(()=>window.fixture.failApply=false);
   }
   await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
   assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
  }
 }
 console.log('PASS F01: first/middle/last Apply dialogs visible and focused at 360/390/430; error retains draft; cancel restores focus');
 stage='old pending offer';await go('/app/home','worker','old-offer');
 await page.getByRole('button',{name:'Review offers',exact:true}).waitFor();
 assert.equal(await page.locator('.field-worker-metric').filter({hasText:'Offers waiting'}).locator('strong').innerText(),'1');
 assert.equal(await page.locator('.field-worker-metric').filter({hasText:'Active assignments'}).locator('strong').innerText(),'1');
 assert.equal(await page.locator('.field-worker-metric').filter({hasText:'Completed work'}).locator('strong').innerText(),'150');
 await page.evaluate(()=>window.fixture.failCounts=true);
 await page.getByRole('button',{name:'Refresh Field Worker dashboard'}).click();
 await page.getByText('Work status is unavailable',{exact:true}).waitFor();
 assert.equal(await page.locator('.field-worker-metric').filter({hasText:'Offers waiting'}).locator('strong').innerText(),'—');
 console.log('PASS F03: older pending offer and active assignment survive >100 records; failed exact count is unknown, not zero');
 for(const scenario of ['no-offer','offered','normal','completed']){
  stage='application linkage '+scenario;await go('/org/'+org+'/recruitment','org',scenario);
  await page.getByRole('tab',{name:/^Applications/}).click();
  const card=applicationCard();await card.waitFor();
  if(scenario==='no-offer')await card.getByRole('button',{name:'Send assignment offer'}).waitFor();
  else{
   const label={offered:'Offer sent',normal:'Active assignment',completed:'Completed assignment'}[scenario];
   await card.getByText(label,{exact:true}).first().waitFor();
   assert.equal(await card.getByRole('button',{name:'Send assignment offer'}).count(),0);
  }
  await go('/org/'+org+'/home','org',scenario);
  await page.getByRole('heading',{name:'Partner Organization',exact:true}).waitFor();
  await page.waitForFunction(()=>window.queryCalls.some(q=>q.table==='work_applications'&&q.limit===200));
  if(scenario==='no-offer')await page.getByRole('button',{name:'Send offers',exact:true}).waitFor();
  else{await page.getByRole('button',{name:'Review projects',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Send offers',exact:true}).count(),0)}
 }
 await go('/org/'+org+'/home','org','guidance');
 await page.getByRole('button',{name:'Review project recruitment',exact:true}).waitFor();
 await page.getByText(/Published projects appear automatically/).waitFor();
 assert.equal(await page.getByText(/Publish an opportunity so eligible/).count(),0);
 console.log('PASS F05/F10: selected applications derive no/offered/active/completed state; existing assignments suppress duplicate-offer priority; automatic publication guidance');
 stage='candidate application offer';await go('/org/'+org+'/recruitment','org','candidate');
 await page.getByRole('tab',{name:/Find Field Workers/}).click();
 await page.locator('.workforce-search-card select').selectOption(project);
 await page.getByRole('button',{name:'Search Field Workers',exact:true}).click();
 await page.getByRole('button',{name:'Offer assignment',exact:true}).click();
 const offerForm=page.locator('.workforce-offer-form');await offerForm.waitFor();
 await offerForm.getByLabel('Survey target').fill('10');
 await offerForm.getByText('Schedule clear',{exact:true}).waitFor();
 await offerForm.getByRole('button',{name:'Send formal offer'}).click();
 await page.waitForFunction(()=>window.rpcCalls.some(c=>c.name==='create_work_assignment'));
 const sent=await page.evaluate(()=>window.rpcCalls.find(c=>c.name==='create_work_assignment').args);
 assert.equal(sent.p_source_kind,'application');assert.equal(sent.p_source_id,id(10));
 console.log('PASS F06: selected application candidate opens and submits formal offer with exact source');
 stage='out of order filters';await go('/app/work/opportunities','worker','race');
 await page.getByRole('button',{name:'Filters',exact:true}).click();
 const skill=page.getByPlaceholder('e.g. Data collection');await skill.fill('old');
 await page.waitForFunction(()=>window.rpcCalls.some(c=>c.name==='available_work_opportunities'&&c.args.p_skill==='old'));
 await skill.fill('new');await page.getByRole('button',{name:'Apply filters',exact:true}).click();await page.getByRole('heading',{name:'new opportunity 0'}).waitFor();await page.waitForTimeout(1100);
 assert.equal(await page.locator('.workforce-opportunity-card h4').innerText(),'new opportunity 0');
 console.log('PASS F04: reversed async responses preserve latest filter/results');
 stage='opportunity filter';await go('/org/'+org+'/recruitment','org','no-offer');
 await page.locator('.workforce-opportunity-card').filter({has:page.getByRole('heading',{name:'Community opportunity',exact:true})}).getByRole('button',{name:'View applicants'}).click();
 await applicationCard().waitFor();
 assert.equal(await page.locator('#workforce-application-'+id(11)).count(),0);
 assert.ok(new URL(page.url()).pathname.includes('/opportunities/'+opportunity+'/applications'));
 await page.reload();await applicationCard().waitFor();assert.equal(await page.locator('#workforce-application-'+id(11)).count(),0);
 await page.getByRole('button',{name:'Show all applicants'}).click();await page.locator('#workforce-application-'+id(11)).waitFor();
 console.log('PASS F09: opportunity-scoped applicants survive refresh and can explicitly clear context');
 for(const scenario of ['normal','blocked','expired','ineligible']){
  stage='field continuation '+scenario;await go('/app/work/assignments','worker',scenario);
  await assignmentCard().getByRole('button',{name:'Open field work',exact:true}).click();
  await page.waitForURL('**/app/field/projects/'+project+'/work');
  await page.waitForFunction(p=>window.rpcCalls.some(c=>c.name==='can_collect_project'&&c.args.p_project===p),project);
  if(scenario==='normal'){
   await page.getByRole('button',{name:'Start survey',exact:true}).waitFor();
   await page.reload();await page.getByRole('button',{name:'Start survey',exact:true}).waitFor();
  }else{
   await page.waitForTimeout(150);
   assert.equal(await page.getByRole('button',{name:'Start survey',exact:true}).count(),0);
   assert.equal(await page.evaluate(()=>window.rpcCalls.some(c=>c.name==='save_survey_response')),false);
  }
 }
 console.log('PASS F08: active assignment routes through real AppShell to exact project; reload works; denied collection never exposes Start survey');
 stage='offer labels and acceptance';await go('/app/work/assignments','worker','offered');
 assert.equal(await page.getByRole('button',{name:'Invitations & offers',exact:true}).count(),0);
 await assignmentCard().getByRole('button',{name:'Accept offer',exact:true}).waitFor();
 await page.getByRole('button',{name:'Toggle navigation'}).click();
 await page.getByRole('button',{name:'Direct invitations',exact:true}).click();
 assert.ok(new URL(page.url()).pathname.endsWith('/app/invitations'));
 assert.equal(await page.getByRole('button',{name:'Accept offer',exact:true}).count(),0);
 await page.getByRole('button',{name:'Toggle navigation'}).click();
 await page.getByRole('button',{name:'Offers & assignments',exact:true}).click();
 await assignmentCard().getByRole('button',{name:'Accept offer',exact:true}).click();
 await assignmentCard().getByRole('button',{name:'Open field work',exact:true}).waitFor();
 console.log('PASS F07/existing acceptance: formal offers remain separate from direct invitations; acceptance retains field continuation');
 stage='Admin survey review';await go('/staff/home','admin');
 await page.getByRole('button',{name:'Open priority queue'}).click();
 await page.getByRole('heading',{name:'Survey response review',exact:true,level:2}).waitFor();
 assert.equal(await page.getByRole('heading',{name:'Independent verification',exact:true}).count(),0);
 await page.getByRole('button',{name:'Review response',exact:true}).click();
 await page.waitForURL('**/staff/projects/'+project+'/responses/'+id(40));
 await page.locator('.project-workspace').waitFor();
 await page.getByText('Review note',{exact:true}).waitFor();
 await page.reload();await page.locator('.project-workspace').waitFor();
 console.log('PASS F02: Admin priority -> survey queue -> exact project response, including reload; independent verification remains separate');
 for(const width of [360,390,430]){
  stage='Attendance layout '+width;await page.setViewportSize({width,height:844});await go('/app/field/attendance','worker');
  await page.getByRole('button',{name:'Start field work',exact:true}).waitFor();
  const boxes=await page.evaluate(()=>{
   const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
   return {hero:rect(document.querySelector('.attendance-hero')),copy:rect(document.querySelector('.attendance-hero>div')),refresh:rect(document.querySelector('.attendance-hero>button')),download:rect(document.querySelector('.attendance-download-notice')),button:rect(document.querySelector('.attendance-download-notice>button')),paragraphs:[...document.querySelectorAll('.attendance-download-notice p')].map(rect),scroll:document.documentElement.scrollWidth,width:innerWidth,gps:window.gpsRequests};
  });
  assert.ok(boxes.copy.width>=200);assert.ok(boxes.refresh.top>=boxes.copy.bottom);
  assert.ok(boxes.hero.bottom<=boxes.download.top);assert.ok(boxes.button.bottom<=boxes.download.bottom);
  for(const p of boxes.paragraphs){assert.ok(p.width>=200);assert.ok(p.bottom<=boxes.button.top)}
  assert.ok(boxes.scroll<=boxes.width);assert.equal(boxes.gps,0);
  const action=page.getByRole('button',{name:'Start field work',exact:true});await action.scrollIntoViewIfNeeded();
  const a=await action.boundingBox(),nav=await page.getByRole('navigation',{name:'Field Worker primary navigation'}).boundingBox();
  assert.ok(a.y+a.height<=nav.y);
 }
 console.log('PASS Attendance: readable widths, stacked nonoverlapping refresh/download, no overflow or hidden primary action at 360/390/430; no automatic GPS capture');
 assert.deepEqual(errors,[]);
 console.log('PASS FieldLance 2.41.8 behavioral browser suite (simulated transport; actual components, CSS and routes)');
}catch(error){console.error('FAILED STAGE:',stage);throw error}
finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await rm(temp,{recursive:true,force:true});}
