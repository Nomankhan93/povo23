// Runtime harness: real WebCrypto and serialized IndexedDB transaction model.
// This is not a browser/real IndexedDB test; the browser checklist remains required.
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import assert from 'node:assert/strict';
const stores=new Map(), lanes=new Map();let generated=0,release;
const barrier=new Promise(r=>release=r);
const subtle=new Proxy(webcrypto.subtle,{get(t,n){if(n==='generateKey')return async(...args)=>{const k=await t.generateKey(...args);if(++generated===2)release();if(generated<=2)await barrier;return k};const v=Reflect.get(t,n);return typeof v==='function'?v.bind(t):v;}});
const cryptoMock={subtle,getRandomValues:webcrypto.getRandomValues.bind(webcrypto)};
const database={objectStoreNames:{contains:n=>stores.has(n)},createObjectStore:n=>stores.set(n,new Map()),transaction(n){
 const lane=lanes.get("all")||[];lanes.set("all",lane);const tx={oncomplete:null,onerror:null,onabort:null};let active=false,pending=0,ended=false;const tasks=[];
 function finish(){if(!active||pending||ended)return;ended=true;tx.oncomplete?.();lane.shift();lane[0]?.();}
 function operation(fn){const req={};pending++;const run=()=>setTimeout(()=>{try{req.result=fn();req.onsuccess?.()}catch(e){req.error=e;req.onerror?.();tx.error=e;tx.onerror?.()}pending--;setTimeout(finish,0)},0);if(active)run();else tasks.push(run);return req;}
 tx.objectStore=(storeName=n)=>({get:k=>operation(()=>structuredClone(stores.get(storeName).get(k))),getAll:()=>operation(()=>structuredClone([...stores.get(storeName).values()])),add:v=>operation(()=>{assert(!stores.get(storeName).has(v.id));stores.get(storeName).set(v.id,structuredClone(v));return v.id}),put:v=>operation(()=>{stores.get(storeName).set(v.id,structuredClone(v));return v.id}),delete:k=>operation(()=>stores.get(storeName).delete(k))});
 const start=()=>{active=true;for(const f of tasks)f();setTimeout(finish,0)};lane.push(start);if(lane.length===1)start();return tx;
}};
const indexedDBMock={open(){const req={};setTimeout(()=>{req.result=database;req.onupgradeneeded?.();req.onsuccess?.()},0);return req}};
const local=new Map();const windowMock={indexedDB:indexedDBMock,crypto:cryptoMock,localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)},dispatchEvent(){}};
let owner='owner',online=true,rpcCalls=[],rpcError=null;
const client={auth:{getSession:async()=>({data:{session:{user:{id:owner}}},error:null}),getUser:async()=>({data:{user:{id:owner}},error:null})},rpc(_name,args){rpcCalls.push(structuredClone(args));const result=Promise.resolve({data:'response',error:rpcError});result.abortSignal=()=>result;return result;}};
const navigatorMock={get onLine(){return online}};
const source=readFileSync(new URL('../src/features/surveys/offlineSurveyStore.ts',import.meta.url),'utf8').replace('import { db } from "../../lib/supabase/client";','const db=client;');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function module(){const out={};new Function('exports','require','window','indexedDB','crypto','client','navigator',js)(out,(name)=>{if(name==='./fieldAttachments')return {prepareSurveyAttachments:async()=>{throw Error('Upload invoked outside storage-only harness')}};throw Error('unexpected import: '+name)},windowMock,indexedDBMock,cryptoMock,client,navigatorMock);return out;}
const a=module();
await a.putFieldRecords('owner',[{kind:'attachment',key:'file',value:{filename:'private-child.jpg'}},{kind:'attachment-bytes',key:'file',value:'private file bytes'}]);
assert.equal(await a.getFieldRecord('owner','attachment-bytes','file'),'private file bytes');
assert(!JSON.stringify([...stores.get('field_records').values()]).includes('private file bytes'));
assert.equal(stores.get('keys').get('survey-device-key').key.extractable,false);
console.log('PASS atomic attachment metadata/bytes use existing nonextractable encryption key');
owner='other';await assert.rejects(()=>a.getFieldRecord('owner','attachment-bytes','file'),/owner/);assert.deepEqual(await a.fieldRecords('other','attachment'),[]);owner='owner';
console.log('PASS another signed-in account cannot read previous owner field records');
a.rememberFieldOwner('owner');online=false;const getSession=client.auth.getSession;client.auth.getSession=async()=>{throw Error('Network forbidden')};assert.equal(await a.getFieldRecord('owner','attachment-bytes','file'),'private file bytes');
a.lockFieldDevice();await assert.rejects(()=>a.getFieldRecord('owner','attachment-bytes','file'),/locked/);assert.equal(a.offlineOwner(),null);assert(stores.get('field_records').size);
client.auth.getSession=getSession;online=true;a.rememberFieldOwner('owner');
console.log('PASS offline reopen uses local owner marker; explicit lock retains bytes and blocks access');
await a.enqueueSurveySave('owner',{p_request_id:'receipt-test',p_project:'project',p_id:null});
await a.removeQueuedSurveySave('owner','receipt-test','server-response');
const inventory=await a.fieldInventory('owner');assert.equal(inventory.queue.length,0);assert.equal(inventory.receipts[0].responseId,'server-response');
await a.saveSurveyDeviceDraft('owner','project',null,{name:'Retained draft'});await a.clearFieldReceipts('owner');assert.equal((await a.fieldInventory('owner')).receipts.length,0);assert.equal((await a.loadSurveyDeviceDraft('owner','project',null)).name,'Retained draft');
console.log('PASS acknowledged status is recorded atomically; receipt cleanup preserves drafts');
owner='other';await a.putFieldRecord('other','bundle','project',{title:'Other account'});owner='owner';await a.eraseOwnerFieldData('owner');assert.equal((await a.fieldInventory('owner')).drafts.length,0);assert.equal(await a.getFieldRecord('owner','attachment-bytes','file'),null);owner='other';assert.equal((await a.getFieldRecord('other','bundle','project')).title,'Other account');
console.log('PASS explicit owner erase leaves other account records intact');
console.log('5 encrypted field storage scenarios passed (serialized IDB model, not a browser)');
