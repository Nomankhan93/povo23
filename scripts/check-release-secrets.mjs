import {readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
const skip=new Set(['node_modules','dist','.git','.fieldlance-patch-backups','.poem-patch-backups']);
const findings=[];
function scan(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){
  if(skip.has(entry.name)||entry.name.startsWith('.library-test-')||entry.name.startsWith('.env')&&entry.name!=='.env.example')continue;
  const file=path.join(dir,entry.name);
  if(file==='supabase/.temp'||file==='supabase/.branches')continue;
  if(entry.isDirectory()){scan(file);continue;}
  if(!/\.(?:tsx?|m?js|json|md|txt|sql|toml|ya?ml|example|sh)$/.test(file))continue;
  const content=readFileSync(file,'utf8');
  let privileged=/sb_secret_[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content);
  for(const token of content.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[]){
    try{if(JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).role==='service_role')privileged=true;}catch{}
  }
  if(privileged)findings.push(file);
}}
scan('.');
if(findings.length){console.error('Privileged credential material found (values redacted):\n'+findings.join('\n'));process.exit(1);}
console.log('PASS release sources contain no detected privileged credentials');
