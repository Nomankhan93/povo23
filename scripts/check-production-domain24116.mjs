import {existsSync,readFileSync} from 'node:fs';

const vars={...process.env};
for(const file of ['.env','.env.local','.env.production','.env.production.local']){
  if(!existsSync(file))continue;
  for(const line of readFileSync(file,'utf8').split(/\r?\n/)){
    const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if(m&&!m[1].startsWith('#'))vars[m[1]]=m[2].trim().replace(/^['"]|['"]$/g,'');
  }
}

function requireHttpsOrigin(name,{allowPath=false}={}){
  const raw=String(vars[name]||'').trim();
  if(!raw)throw Error(`${name} is required for the production-domain launch gate.`);
  let url;
  try{url=new URL(raw)}catch{throw Error(`${name} must be a valid absolute URL.`)}
  if(url.protocol!=='https:')throw Error(`${name} must use https:// in production.`);
  if(url.username||url.password||url.search||url.hash)throw Error(`${name} must not contain credentials, query or fragment.`);
  if(!allowPath&&url.pathname&&url.pathname!=='/')throw Error(`${name} must be an origin only (no path).`);
  if(['localhost','127.0.0.1'].includes(url.hostname))throw Error(`${name} must not point at localhost for production.`);
  return url;
}

const app=requireHttpsOrigin('VITE_PUBLIC_APP_ORIGIN');
const supabase=requireHttpsOrigin('VITE_SUPABASE_URL',{allowPath:true});
const key=String(vars.VITE_SUPABASE_ANON_KEY||'').trim();
if(!key||key.startsWith('replace-'))throw Error('VITE_SUPABASE_ANON_KEY must contain the hosted public/anon key.');
if(key.startsWith('sb_secret_'))throw Error('VITE_SUPABASE_ANON_KEY must never contain a Supabase secret key.');

console.log(`PASS canonical app origin: ${app.origin}`);
console.log(`PASS hosted Supabase HTTPS origin: ${supabase.origin}`);
console.log('PASS production frontend key is present and is not an sb_secret_ credential');
console.log('Production domain environment gate passed.');
