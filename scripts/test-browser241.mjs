import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
import {browserNetwork} from './browser-network2412.mjs';
const root=process.cwd(),temp=await mkdtemp(path.join(tmpdir(),'fieldlance-browser241-')),dist=path.join(temp,'dist');
let server,browser,page,network;
let stage='build fixture';
const errors=[],failedRequests=[];
try{
 await writeFile(path.join(temp,'index.html'),'<html><body><div id="root"></div><script type="module" src="'+path.join(root,'scripts/fixtures/device241/main.jsx')+'"></script></body></html>');
 await build({configFile:false,root:temp,publicDir:path.join(root,'public'),plugins:[{name:'fixture-transport',enforce:'pre',resolveId(id){if(id.endsWith('/supabase/client'))return path.join(root,'scripts/fixtures/device241/client.js');}},react()],resolve:{dedupe:['react','react-dom']},build:{outDir:dist,emptyOutDir:true},logLevel:'error'});
 execFileSync(process.execPath,[path.join(root,'scripts/build-field-worker.mjs')],{cwd:temp});
 server=createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/fixture-network-probe'){res.setHeader('Cache-Control','no-store');res.end('online');return;}let file=url.pathname==='/'||url.pathname.startsWith('/app')?'/index.html':url.pathname;try{const body=await readFile(path.join(dist,file));res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(body);}catch{res.writeHead(404);res.end('missing');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 const context=await browser.newContext();page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 page.on('requestfailed',request=>{failedRequests.push({path:new URL(request.url()).pathname,error:request.failure()?.errorText});if(failedRequests.length>15)failedRequests.shift();});
 console.log('Browser:',browser.version(),'Node:',process.version);
 await page.goto(origin);await page.waitForFunction(()=>Boolean(window.deviceTest));await page.evaluate(()=>window.deviceTest.seed());
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 network=await browserNetwork(context,page);
 if(process.env.FIELDLANCE_TEST_NETWORK_MISMATCH==='1'){
   stage='reproduce network/navigator mismatch';
   await network.reproduceMismatch();
   console.log('Reproduced blocked transport with native navigator.onLine=true; verifying recovery');
 }
 stage='offline deep-link';await network.set(true);await page.goto(origin+'/app/work/assignments/assignment-alice/attendance');await network.verify(stage);
 await page.getByRole('button',{name:'Start field work',exact:true}).waitFor();
 stage='offline check-in';await network.verify(stage);
 await page.getByRole('button',{name:'Start field work',exact:true}).click();
 await page.getByPlaceholder('What work did you complete today?').fill('Offline site visit completed');
 stage='offline checkout';await network.verify(stage);await page.getByRole('button',{name:'End & submit workday',exact:true}).click();
 await page.waitForFunction(async()=>Boolean((await window.deviceTest.attendance.pendingAttendance('alice'))[0]?.hasCheckout));
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('fixture-server')||'{"requests":[]}').requests.length),0,'Offline capture must not reach the simulated server');
 await page.getByText('This workday is queued on this device').waitFor();stage='offline reload';await page.reload();await network.verify(stage);await page.getByText('This workday is queued on this device').waitFor();
 assert.equal(await page.evaluate(async()=>(await window.deviceTest.attendance.pendingAttendance('alice'))[0].hasCheckout),true);
 console.log('PASS Chromium deep-link offline boot, check-in/checkout and reload retain encrypted evidence');
 stage='reconnect rejection';await page.evaluate(()=>localStorage.setItem('fixture-reject','yes'));await network.set(false);
 await page.waitForFunction(async()=>Boolean((await window.deviceTest.attendance.attendanceInventory('alice')).find(r=>r.status==='failed')));
 await page.evaluate(()=>localStorage.removeItem('fixture-reject'));
 stage='explicit retry';await page.getByRole('button',{name:/^(?:Sync now|Retry \/ sync attendance)$/}).click();
 await page.waitForFunction(async()=>Boolean((await window.deviceTest.attendance.attendanceInventory('alice')).find(r=>r.status==='synced')));
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('fixture-server')).requests.length),2);
 await page.getByText(/^(?:1 pending attendance record\(s\) synced\.|1 attendance records synchronized\. 0 failed\.)$/).waitFor();
 // The acknowledged local attendance copy should no longer remain pending
 // once the retry is accepted and its sync receipt is persisted.
 await page.waitForFunction(async()=>{
   const pending=await window.deviceTest.attendance.pendingAttendance('alice');
   const inventory=await window.deviceTest.attendance.attendanceInventory('alice');
   return pending.length===0&&inventory.some(r=>r.status==='synced');
 });
 console.log('PASS Chromium rejected sync retains work and retry acknowledges original requests exactly once');
 stage='expiry isolation';await network.set(true);await page.reload();await network.verify(stage);await page.waitForFunction(()=>Boolean(window.deviceTest));
 await page.evaluate(async()=>{const s=window.deviceTest.survey;const old=await s.getFieldRecord('alice','attendance-download','current');if(!old)throw Error('Missing attendance download before expiry test');const now=Date.now();await s.putFieldRecord('alice','attendance-download','current',{...old,downloadedAt:new Date(now-86400000).toISOString(),validUntil:new Date(now-1000).toISOString()});});
 await page.reload();await network.verify('expired offline reload');await page.getByText('Downloaded access expired; reconnect and refresh',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Start field work',exact:true}).isDisabled(),true);
 console.log('PASS Chromium expired download is visible and new offline captures are blocked');
 stage='malformed route and owner recovery';await page.goto(origin+'/app/field/%');await network.verify(stage);await page.getByRole('heading',{name:'Page not found'}).waitFor();
 await page.goto(origin+'/app/field');
 await page.getByRole('button',{name:'Offline field',exact:true}).click();
 await page.getByRole('heading',{name:'Offline field workspace',exact:true}).waitFor();
 await page.evaluate(()=>{localStorage.setItem('fixture-owner','bob');window.deviceTest.survey.rememberFieldOwner('bob');});
 await page.getByText('No projects downloaded yet.',{exact:false}).waitFor();assert.equal(await page.getByText('alice downloaded survey',{exact:true}).count(),0);
 await page.evaluate(()=>{localStorage.setItem('fixture-owner','alice');window.deviceTest.survey.rememberFieldOwner('alice');});await page.getByText('alice downloaded survey',{exact:true}).waitFor();
 page.once('dialog',dialog=>dialog.accept('ERASE'));await page.getByRole('button',{name:'Erase my device data',exact:true}).click();
 await page.waitForFunction(async()=>{try{const i=await window.deviceTest.lifecycle.deviceInventory('alice');return i.downloads===0&&i.attendance.length===0;}catch{return false;}});
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Lock and sign out',exact:true}).click();
 await page.waitForFunction(()=>localStorage.getItem('poem-field-locked')==='yes'&&window.deviceTest.survey.offlineOwner()===null);
 assert.equal(await page.evaluate(async()=>{
   try{
     await window.deviceTest.attendance.attendanceInventory('alice');
     return false;
   }catch(error){
     return /Field device is locked; sign in again/.test(String(error));
   }
 }),true);
 await page.getByRole('heading',{name:/^(?:Field device locked|Sign in to FieldLance)$/}).waitFor();
 console.log('PASS Chromium malformed route, owner switching, complete owner erase and locked offline screen');
 const cachePaths=await page.evaluate(async()=>{const out=[];for(const key of await caches.keys())for(const req of await (await caches.open(key)).keys())out.push(new URL(req.url).pathname);return out;});assert.ok(cachePaths.every(p=>p==='/'||p==='/index.html'||p.startsWith('/assets/')||/\.(png|webmanifest)$/.test(p)));
 await assert.rejects(()=>page.goto(origin+'/reset?token=fixture'),/ERR_INTERNET_DISCONNECTED|ERR_FAILED/);
 assert.deepEqual(errors,[]);console.log('PASS Chromium caches static assets only and bypasses authentication callback navigation');
 console.log('Browser transport was simulated; no Supabase Auth/Storage server was used.');
}catch(error){
 const details={stage,browser:browser?.version(),node:process.version,expectedOffline:network?.offline,errors,failedRequests};
 try{details.state=await page.evaluate(async()=>({online:navigator.onLine,owner:window.deviceTest?.survey.offlineOwner(),pending:await window.deviceTest?.attendance.pendingAttendance('alice').catch(e=>({error:String(e)})),inventory:await window.deviceTest?.attendance.attendanceInventory('alice').catch(e=>({error:String(e)})),workdayNotes:[...document.querySelectorAll('textarea')].map(e=>e.value)}));details.body=(await page.locator('body').innerText()).slice(0,12000);}catch(e){details.diagnosticError=String(e);}
 console.error('BROWSER FAILURE DIAGNOSTICS',JSON.stringify(details,null,2));throw error;
}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await rm(temp,{recursive:true,force:true});}
