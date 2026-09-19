import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
const handlers={},deleted=[],cached=[];
const cache={addAll:async paths=>cached.push(...paths),match:async path=>({cached:path})};
const self={location:{origin:'https://poem.example.test'},addEventListener:(name,fn)=>handlers[name]=fn,clients:{claim:async()=>{}}};
vm.runInNewContext(readFileSync('dist/field-sw.js','utf8'),{self,URL,Promise,caches:{open:async()=>cache,keys:async()=>['unrelated-app','fieldlance-field-shell-old'],delete:async key=>deleted.push(key)},fetch:async()=>({network:true})});
let work;handlers.install({waitUntil:p=>work=p});await work;
assert(cached.includes('/index.html'));
for(const path of cached)if(path!=='/')assert(existsSync('dist'+path),path);
assert(cached.every(p=>p==='/'||p==='/index.html'||p==='/manifest.webmanifest'||p==='/fieldlance-icon-192.png'||p==='/fieldlance-icon-512.png'||p==='/apple-touch-icon.png'||p.startsWith('/assets/')));
console.log('PASS offline shell precaches only existing static build assets');
for(const [url,method,mode] of [['https://poem.example.test/api/private','GET','cors'],['https://db.example.test/rest/v1/persons','GET','cors'],['https://poem.example.test/','POST','navigate'],['https://poem.example.test/reset?token=secret','GET','navigate']]){
 let intercepted=false;handlers.fetch({request:{url,method,mode},respondWith(){intercepted=true}});assert.equal(intercepted,false,url);
}
let response;handlers.fetch({request:{url:'https://poem.example.test/',method:'GET',mode:'navigate'},respondWith:p=>response=p});assert.equal((await response).cached,'/index.html');
console.log('PASS root offline navigation works without caching API, auth or foreign requests');
handlers.activate({waitUntil:p=>work=p});await work;assert.deepEqual(deleted,['fieldlance-field-shell-old']);
console.log('PASS worker activation leaves unrelated app caches intact');
