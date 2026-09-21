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
const windowMock={indexedDB:indexedDBMock,crypto:cryptoMock,dispatchEvent(){}};
let owner='owner',online=true,rpcCalls=[],rpcError=null;
const client={auth:{getSession:async()=>({data:{session:{user:{id:owner}}},error:null}),getUser:async()=>({data:{user:{id:owner}},error:null})},rpc(_name,args){rpcCalls.push(structuredClone(args));const result=Promise.resolve({data:'response',error:rpcError});result.abortSignal=()=>result;return result;}};
const navigatorMock={get onLine(){return online}};
const source=readFileSync(new URL('../src/features/surveys/offlineSurveyStore.ts',import.meta.url),'utf8').replace('import { db } from "../../lib/supabase/client";','const db=client;');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function module(){const out={};new Function('exports','require','window','indexedDB','crypto','client','navigator',js)(out,(name)=>{if(name==='./fieldAttachments')return {prepareSurveyAttachments:async()=>{throw Error('Upload invoked outside storage-only harness')}};throw Error('unexpected import: '+name)},windowMock,indexedDBMock,cryptoMock,client,navigatorMock);return out;}
const a=module(),b=module();
await Promise.all([a.saveSurveyDeviceDraft('owner','one',null,{name:'One'}),b.saveSurveyDeviceDraft('owner','two',null,{name:'Two'})]);
assert.equal(generated,2);assert.equal((await a.loadSurveyDeviceDraft('owner','one',null)).name,'One');assert.equal((await b.loadSurveyDeviceDraft('owner','two',null)).name,'Two');console.log('PASS concurrent tab first-writes retain one usable nonextractable encryption key');
const args={p_request_id:'request-1',p_project:'project',p_id:null,p_person:null,p_household:null,p_name:'Synthetic child',p_birth:'2012-03-04',p_household_label:'Household',p_answers:{need:'School'},p_consent:{agreed:true,method:'verbal',representative:'Guardian',relationship:'Guardian'},p_submit:true,p_version:0};
await Promise.all([a.enqueueSurveySave('owner',args),b.enqueueSurveySave('owner',{...args,p_name:'Must not replace original'})]);
assert.equal((await a.surveyQueueSummary('owner')).total,1);
await a.markQueuedSurveyAttention('owner','request-1','Rejected: correction required');
assert.equal((await a.inspectAttentionSurvey('owner','owner:request-1')).p_name,args.p_name);console.log('PASS duplicate enqueue preserves original payload and request');
owner='other';await assert.rejects(()=>a.inspectAttentionSurvey('owner','owner:request-1'),/owner/);await assert.rejects(()=>a.discardAttentionSurvey('owner','owner:request-1'),/owner/);assert.equal((await a.attentionSurveyCopies('other')).length,0);owner='owner';console.log('PASS recovery access is scoped to the signed-in owner');
await a.recoverAttentionSurvey('owner','owner:request-1');assert.equal((await a.loadSurveyDeviceDraft('owner','project',null)).name,args.p_name);assert.equal((await a.surveyQueueSummary('owner')).attention,1);await assert.rejects(()=>a.recoverAttentionSurvey('owner','owner:request-1'),/already been recovered/);console.log('PASS rejected answers recover durably without deleting source or overwriting drafts');
await assert.rejects(()=>a.retryAttentionSurvey('owner','owner:request-1'),/recovered/);
await a.discardAttentionSurvey('owner','owner:request-1');
await a.enqueueSurveySave('owner',{...args,p_request_id:'request-2'});
await a.markQueuedSurveyAttention('owner','request-2','Rejected');
await a.retryAttentionSurvey('owner','owner:request-2');assert.equal((await a.surveyQueueSummary('owner')).pending,1);await assert.rejects(()=>a.recoverAttentionSurvey('owner','owner:request-1'),/confirmed server rejection/);
await a.syncSurveyQueue('owner');assert.equal(rpcCalls.at(-1).p_request_id,'request-2');assert.equal((await a.surveyQueueSummary('owner')).total,0);console.log('PASS retry reuses original id and success removes only acknowledged queue entry');
await a.enqueueSurveySave('owner',{...args,p_request_id:'bad'});const bad=stores.get('queue').get('owner:bad');bad.cipher.data='AAAA';await a.syncSurveyQueue('owner');assert.equal((await a.attentionSurveyCopies('owner'))[0].failureKind,'unreadable');assert.equal((await a.surveyQueueSummary('owner')).attention,1);console.log('PASS corrupt ciphertext is retained for attention instead of retrying forever');
await a.enqueueSurveySave('owner',{...args,p_request_id:'pending'});await a.discardAttentionSurvey('owner','owner:pending');assert.equal((await a.surveyQueueSummary('owner')).pending,1);await a.discardAttentionSurvey('owner','owner:bad');assert.equal((await a.surveyQueueSummary('owner')).attention,0);console.log('PASS per-item discard cannot remove pending saves');
rpcError={code:'P0001',message:'Definitive validation failure'};await a.syncSurveyQueue('owner');assert.equal((await a.attentionSurveyCopies('owner'))[0].failureKind,'rejected');console.log('PASS definitive server rejection is recoverable');
console.log('8 offline recovery runtime tests passed');
