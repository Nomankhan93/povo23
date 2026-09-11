import {execFileSync} from 'node:child_process';
import {existsSync,writeFileSync} from 'node:fs';
if(existsSync('.env.local')&&!process.argv.includes('--force')){console.error('.env.local exists. Keep it or use npm run env:local -- --force to replace it with LOCAL values.');process.exit(1)}
try{
 const s=JSON.parse(execFileSync('npx',['supabase','status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 const url=s.API_URL||s.api_url,key=s.ANON_KEY||s.anon_key||s.PUBLISHABLE_KEY||s.publishable_key;
 if(!url||!key)throw Error('Local URL/public key missing. Start Supabase first.');
 if(!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Refusing non-local configuration.');
 if(key.startsWith('sb_secret_'))throw Error('Secret keys cannot be used in frontend configuration.');
 if(key.split('.').length===3&&JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role!=='anon')throw Error('Only anon JWT keys are allowed.');
 writeFileSync('.env.local',`VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_ANON_KEY=${key}\n`,{mode:0o600});console.log('Wrote local frontend configuration. No server secrets were written.');
}catch(e){console.error(e.message);process.exit(1)}
