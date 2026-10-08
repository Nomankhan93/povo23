import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  canUseRecoveryForm,
  clearRecoveryUser,
  recoveryRedirectError,
  recoveryUserId,
  rememberRecoveryUser,
} from '../src/features/auth/recoverySession.ts';

let passed=0;
const ok=(name,fn)=>{fn();passed++;console.log('PASS '+name)};

function memoryStorage(){
  const values=new Map();
  return {
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),
  };
}

ok('manual reset navigation does not authorize password update',()=>{
  assert.equal(canUseRecoveryForm(true,'user-1',null),false);
  assert.equal(canUseRecoveryForm(true,'user-1','user-2'),false);
  assert.equal(canUseRecoveryForm(false,'user-1','user-1'),false);
  assert.equal(canUseRecoveryForm(true,'user-1','user-1'),true);
});

ok('recovery authorization is tab-scoped and explicitly clearable',()=>{
  const storage=memoryStorage();
  assert.equal(recoveryUserId(storage),null);
  rememberRecoveryUser('user-1',storage);
  assert.equal(recoveryUserId(storage),'user-1');
  clearRecoveryUser(storage);
  assert.equal(recoveryUserId(storage),null);
});

ok('expired or rejected auth links produce useful redirect errors',()=>{
  assert.match(recoveryRedirectError('', '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'),/invalid or has expired/i);
  assert.match(recoveryRedirectError('?error_code=bad_code',''),/bad_code/);
  assert.equal(recoveryRedirectError('',''),'');
});

ok('App gates the reset form on PASSWORD_RECOVERY instead of pathname alone',()=>{
  const app=readFileSync('src/app/App.tsx','utf8');
  assert.doesNotMatch(app,/useState\(location\.pathname === "\/reset"\)/);
  assert.match(app,/event==="PASSWORD_RECOVERY"&&s&&route\.kind==="reset"/);
  assert.match(app,/rememberRecoveryUser\(s\.user\.id\)/);
  assert.match(app,/canUseRecoveryForm\(recoveryRequested,session\?\.user\.id\|\|null,recoveryUser\)/);
  assert.match(app,/session && !recoveryRequested/);
  assert.match(app,/recoveryRequested=\{recoveryRequested\}/);
});

ok('Auth refuses password mutation without an authorized recovery session',()=>{
  const auth=readFileSync('src/features/auth/Auth.tsx','utf8');
  assert.match(auth,/if \(!recovery \|\| !session\) throw Error\("Open the latest reset link from your email\."\)/);
  assert.match(auth,/resetPasswordForEmail\(email,\s*\{\s*redirectTo: location\.origin \+ "\/reset"/s);
  assert.match(auth,/recovery \? "reset" : recoveryRequested \? "forgot" : "login"/);
  assert.match(auth,/if \(recoveryRequested\) done\(\)/);
});

ok('auth initialization cannot overwrite a newer auth event with stale getSession state',()=>{
  const app=readFileSync('src/app/App.tsx','utf8');
  const subscription=app.indexOf('db.auth.onAuthStateChange');
  const getSession=app.indexOf('db.auth\n      .getSession()');
  assert(subscription>=0&&getSession>=0&&subscription<getSession);
  assert.match(app,/authEventSeen\.current=true/);
  assert.match(app,/if\(!authEventSeen\.current\)setSession\(current\.session\)/);
});

ok('local auth config enables secure password change reauthentication',()=>{
  const config=readFileSync('supabase/config.toml','utf8');
  assert.match(config,/secure_password_change\s*=\s*true/);
});

ok('2.41.12 targeted validation command remains registered',()=>{
  const pkg=JSON.parse(readFileSync('package.json','utf8'));
  assert.equal(pkg.scripts['test:auth-session-24112'],'node scripts/test-auth-session24112.mjs');
  assert.match(readFileSync('docs/PHASE-2.41.12.md','utf8'),/Auth Recovery & Session Boundary Hardening/);
});

console.log(`\n${passed} FieldLance 2.41.12 auth/session boundary scenarios passed.`);
