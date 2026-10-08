import {readFileSync,existsSync} from 'node:fs';
const vars={...process.env};
for(const file of ['.env','.env.local','.env.development','.env.development.local','.env.production','.env.production.local'])if(existsSync(file))for(const line of readFileSync(file,'utf8').split(/\r?\n/)){const m=line.match(/^\s*(VITE_[A-Z0-9_]+)\s*=\s*(.*)\s*$/);if(m)vars[m[1]]=m[2].trim().replace(/^['"]|['"]$/g,'')}
for(const [name,value] of Object.entries(vars))if(name.startsWith('VITE_')){
 if(/SECRET|SERVICE_ROLE|PASSWORD|PRIVATE_KEY/.test(name))throw Error(`Server secret variable ${name} must not be exposed to Vite.`);
 if(typeof value==='string'&&value.startsWith('sb_secret_'))throw Error(`${name} contains a server secret.`);
 if(typeof value==='string'&&value.split('.').length===3){try{const payload=JSON.parse(Buffer.from(value.split('.')[1],'base64url'));if(payload.role==='service_role')throw Error(`${name} contains a service-role JWT.`)}catch(e){if(e.message.includes('service-role'))throw e}}
}

function validateOrigin(name,value,{httpsOnly=false}={}){
 if(!value)return;
 let parsed;try{parsed=new URL(value)}catch{throw Error(`${name} must be a valid absolute URL.`)}
 if(!['http:','https:'].includes(parsed.protocol))throw Error(`${name} must use http:// or https://.`);
 if(httpsOnly&&parsed.protocol!=='https:')throw Error(`${name} must use https://.`);
 if(parsed.username||parsed.password||parsed.search||parsed.hash)throw Error(`${name} must not contain credentials, query or fragment.`);
 if(name==='VITE_PUBLIC_APP_ORIGIN'&&parsed.pathname&&parsed.pathname!=='/')throw Error(`${name} must be an origin only (no path).`);
}
validateOrigin('VITE_PUBLIC_APP_ORIGIN',vars.VITE_PUBLIC_APP_ORIGIN,{httpsOnly:vars.VERCEL_ENV==='production'});
if(vars.VERCEL_ENV==='production')validateOrigin('VITE_SUPABASE_URL',vars.VITE_SUPABASE_URL,{httpsOnly:true});
console.log('Frontend environment secret check passed.');
