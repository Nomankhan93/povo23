// FieldLance 2.41.10 regression for Supabase Security Advisor RPC boundaries.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {schemaDb} from './schema-test-db.mjs';

const db=await schemaDb();
try {
  const functionState=async(signature)=>{
    const result=await db.query(`
      select p.prosecdef as security_definer,
             has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
             has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
      from pg_proc p where p.oid=to_regprocedure($1)
    `,[signature]);
    assert.equal(result.rows.length,1,`missing function ${signature}`);
    return result.rows[0];
  };

  for(const signature of [
    'public.review_template_draft(uuid,text,text,integer)',
    'public.review_project_draft(uuid,text,text,integer)',
    'public.can_collect_project(uuid)'
  ]){
    const state=await functionState(signature);
    assert.equal(state.security_definer,false,`${signature} must run as SECURITY INVOKER`);
    assert.equal(state.anon_execute,false,`${signature} must not be anonymous`);
    assert.equal(state.authenticated_execute,true,`${signature} must remain callable by signed-in clients`);
  }

  const retiredCandidates=await functionState('public.survey_assignment_candidates(uuid,text)');
  assert.equal(retiredCandidates.anon_execute,false);
  assert.equal(retiredCandidates.authenticated_execute,false);

  const certificate=await functionState('public.verify_field_worker_certificate(text)');
  assert.equal(certificate.security_definer,true,'public certificate verification intentionally retains owner context');
  assert.equal(certificate.anon_execute,true,'anonymous certificate verification is a supported public flow');
  assert.equal(certificate.authenticated_execute,true);

  const anonDefiners=await db.query(`
    select p.proname,pg_get_function_identity_arguments(p.oid) as arguments
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prosecdef
      and has_function_privilege('anon',p.oid,'EXECUTE')
    order by p.proname,arguments
  `);
  assert.deepEqual(
    anonDefiners.rows.map(row=>row.proname),
    ['verify_field_worker_certificate'],
    'No other public SECURITY DEFINER function may be anonymous'
  );

  const missingSearchPath=await db.query(`
    select p.proname,pg_get_function_identity_arguments(p.oid) as arguments
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prosecdef
      and has_function_privilege('authenticated',p.oid,'EXECUTE')
      and not exists(
        select 1 from unnest(coalesce(p.proconfig,array[]::text[])) as setting(value)
        where value like 'search_path=%'
      )
    order by p.proname,arguments
  `);
  assert.deepEqual(missingSearchPath.rows,[],'Authenticated public SECURITY DEFINER RPCs require an explicit search_path');

  // High-impact guarded RPCs intentionally keep owner context. The patch must
  // not silence Advisor warnings by weakening their existing authorization model.
  for(const name of ['act_work_payable','approve_manual_e_wallet_withdrawal','release_project_funding']){
    const result=await db.query(`
      select p.prosecdef as security_definer,
             has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=$1
    `,[name]);
    assert.equal(result.rows.length,1,`expected one ${name} function`);
    assert.equal(result.rows[0].security_definer,true,`${name} must retain SECURITY DEFINER`);
    assert.equal(result.rows[0].authenticated_execute,true,`${name} must retain its guarded signed-in RPC contract`);
  }

  const config=readFileSync('supabase/config.toml','utf8');
  const apiStart=config.indexOf('[api]');
  const apiEnd=apiStart<0 ? -1 : config.indexOf('\n[',apiStart+1);
  const apiBlock=apiStart<0 ? '' : config.slice(apiStart,apiEnd<0 ? undefined : apiEnd);
  assert.ok(apiBlock,'missing [api] config block');
  assert.doesNotMatch(apiBlock,/app_private/,'app_private must not be an exposed PostgREST schema');

  await db.exec('set role authenticated');
  const eligibility=await db.query("select public.can_collect_project('00000000-0000-4000-8000-000000000001'::uuid) eligible");
  assert.equal(eligibility.rows[0].eligible,false,'invoker collection wrapper must remain callable and fail closed');
  await assert.rejects(
    ()=>db.query("select public.review_template_draft('00000000-0000-4000-8000-000000000001'::uuid,'approve','legacy',1)"),
    /pre-approval is retired/i
  );
  await assert.rejects(
    ()=>db.query("select public.review_project_draft('00000000-0000-4000-8000-000000000001'::uuid,'approve','legacy',1)"),
    /pre-approval is retired/i
  );
  await assert.rejects(
    ()=>db.query("select public.survey_assignment_candidates('00000000-0000-4000-8000-000000000001'::uuid,'worker')"),
    /permission denied/i
  );
  await db.exec('reset role');

  console.log('PASS 2.41.10 Security Advisor surface: invoker wrappers, retired candidate RPC, anon allowlist, search_path hardening and high-risk guarded definers');
} finally {
  await db.close();
}
