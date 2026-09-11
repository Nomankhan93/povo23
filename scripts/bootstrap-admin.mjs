import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const args=process.argv.slice(2),index=args.indexOf('--email'),email=index>=0?args[index+1]:null;
if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254){console.error('Usage: npm run admin:bootstrap -- --email your-confirmed-account@example.com');process.exit(1)}
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([a-zA-Z0-9_-]+)"/m)?.[1];
if(project!=='poem-phase11'){console.error('This helper is restricted to the poem-phase11 LOCAL database.');process.exit(1)}
const sql=`BEGIN;
SELECT pg_advisory_xact_lock(hashtext('poem-first-super-admin'));
SELECT set_config('poem.bootstrap_email', :'bootstrap_email', true);
DO $bootstrap$
DECLARE target uuid;
BEGIN
 IF EXISTS(SELECT 1 FROM public.accounts WHERE platform_role='super_admin' AND status='active') THEN RAISE EXCEPTION 'An active Super Admin already exists. Use Accounts to manage access.'; END IF;
 SELECT a.id INTO target FROM public.accounts a JOIN auth.users u ON u.id=a.id WHERE lower(a.email)=lower(current_setting('poem.bootstrap_email')) AND u.email_confirmed_at IS NOT NULL;
 IF target IS NULL THEN RAISE EXCEPTION 'No confirmed account found. Sign up and confirm the email first.'; END IF;
 UPDATE public.accounts SET platform_role='super_admin',status='active' WHERE id=target;
 INSERT INTO public.audit_events(actor_id,subject_id,action,detail) VALUES(target,target,'first_admin_bootstrapped',jsonb_build_object('source','local CLI'));
END $bootstrap$;
COMMIT;`;
try{execFileSync('docker',['exec','-i','supabase_db_'+project,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-v','bootstrap_email='+email],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe']});console.log('First Super Admin created. Sign out and sign in again to open POEM administration.');}catch(e){console.error(e.stderr?.toString()||e.message);process.exit(1)}
