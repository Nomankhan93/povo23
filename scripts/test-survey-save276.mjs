// Exercise hook control flow with React state/ref stubs; not a rendered UI test.
import ts from 'typescript';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/features/surveys/useSurveySave.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function scenario(online,callbackName){let calls=0,queued=0,saved=0;
 const client={auth:{getSession:async()=>({data:{session:{user:{id:'owner'}}},error:null})},rpc(){calls++;const p=Promise.resolve({data:'response',error:null});p.abortSignal=()=>p;return p;}};
 const storage={assertOwner:async()=>{},enqueueSurveySave:async()=>{},removeQueuedSurveySave:async()=>{},markQueuedSurveyPending:async()=>{},markQueuedSurveyAttention:async()=>{},definitiveSurveySaveError:()=>false};
 const exports={};new Function('exports','require','navigator',js)(exports,name=>name==='react'?{useRef:v=>({current:v}),useState:v=>[v,()=>{}]}:name.includes('offlineSurveyStore')?storage:{db:client},{onLine:online});
 const hook=exports.useSurveySave('owner',async()=>{saved++;if(callbackName==='saved')throw Error('UI refresh failed')},async()=>{queued++;if(callbackName==='queued')throw Error('UI close failed')});
 await hook.send({p_project:'project',p_id:null});await hook.send({p_project:'project',p_id:null});
 assert.equal(calls,online?1:0);assert.equal(saved,online?1:0);assert.equal(queued,online?0:1);
}
await scenario(true,'saved');console.log('PASS acknowledged save callback failure cannot create a second request');
await scenario(false,'queued');console.log('PASS durable offline callback failure cannot enqueue a second request');
