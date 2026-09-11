import {readFileSync,existsSync} from 'node:fs';
const vars={...process.env};
for(const file of ['.env','.env.local','.env.development','.env.development.local','.env.production','.env.production.local'])if(existsSync(file))for(const line of readFileSync(file,'utf8').split(/\r?\n/)){const m=line.match(/^\s*(VITE_[A-Z0-9_]+)\s*=\s*(.*)\s*$/);if(m)vars[m[1]]=m[2].trim().replace(/^['"]|['"]$/g,'')}
for(const [name,value] of Object.entries(vars))if(name.startsWith('VITE_')){
 if(/SECRET|SERVICE_ROLE|PASSWORD|PRIVATE_KEY/.test(name))throw Error(`Server secret variable ${name} must not be exposed to Vite.`);
 if(typeof value==='string'&&value.startsWith('sb_secret_'))throw Error(`${name} contains a server secret.`);
 if(typeof value==='string'&&value.split('.').length===3){try{const payload=JSON.parse(Buffer.from(value.split('.')[1],'base64url'));if(payload.role==='service_role')throw Error(`${name} contains a service-role JWT.`)}catch(e){if(e.message.includes('service-role'))throw e}}
}
console.log('Frontend environment secret check passed.');
