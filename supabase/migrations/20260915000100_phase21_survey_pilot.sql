-- Online survey pilot. Registry facts remain project-scoped pending cross-NGO governance.
alter table public.accounts drop constraint accounts_platform_role_check;
alter table public.accounts add constraint accounts_platform_role_check check(platform_role in ('volunteer','admin','super_admin','volunteer_manager','ngo_manager','auditor','survey_manager'));
create function app_private.can_manage_surveys() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.accounts where id=auth.uid() and status='active' and platform_role in ('super_admin','admin','survey_manager'));$$;
create table public.survey_templates(id uuid primary key default gen_random_uuid(),name text not null,version integer not null,questions jsonb not null,created_by uuid not null references public.accounts(id),created_at timestamptz not null default now(),unique(name,version));
create table public.survey_projects(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),title text not null,template_id uuid not null references public.survey_templates(id),geography_id uuid not null references public.geographies(id),target integer not null check(target>0),start_date date not null,end_date date not null,purpose text not null,consent_version text not null,consent_notice text not null,status text not null default 'active' check(status in ('active','closed')),created_by uuid not null references public.accounts(id),created_at timestamptz not null default now());
create table public.survey_assignments(project_id uuid not null references public.survey_projects(id),user_id uuid not null references public.accounts(id),active boolean not null default true,primary key(project_id,user_id));
create table public.registry_households(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.survey_projects(id),label text not null,geography_id uuid not null references public.geographies(id),created_by uuid not null references public.accounts(id),created_at timestamptz not null default now());
create table public.registry_persons(id uuid primary key default gen_random_uuid(),registry_no bigint generated always as identity unique,project_id uuid not null references public.survey_projects(id),household_id uuid not null references public.registry_households(id),full_name text not null,birth_date date,identity_status text not null default 'provisional' check(identity_status='provisional'),created_by uuid not null references public.accounts(id),created_at timestamptz not null default now());
create table public.survey_responses(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.survey_projects(id),person_id uuid not null references public.registry_persons(id),collector_id uuid not null references public.accounts(id),answers jsonb not null,consent jsonb not null,status text not null default 'draft' check(status in ('draft','submitted','correction_required','approved','rejected')),version integer not null default 1,review_note text not null default '',reviewed_by uuid references public.accounts(id),reviewed_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index survey_responses_project on public.survey_responses(project_id,created_at desc);
create index registry_people_project on public.registry_persons(project_id,full_name);
create index registry_household_project on public.registry_households(project_id);
create index survey_assignment_user on public.survey_assignments(user_id);
create function app_private.can_read_project(pid uuid) returns boolean language sql stable security definer set search_path='' as $$select app_private.is_active() and exists(select 1 from public.survey_projects p where p.id=pid and (app_private.can_manage_surveys() or app_private.ngo_admin(p.organization_id) or (exists(select 1 from public.organizations o where o.id=p.organization_id and o.status='active') and exists(select 1 from public.survey_assignments a where a.project_id=pid and a.user_id=auth.uid() and a.active))));$$;
create function app_private.can_collect(pid uuid) returns boolean language sql stable security definer set search_path='' as $$select app_private.is_active() and exists(select 1 from public.survey_assignments a join public.survey_projects p on p.id=a.project_id join public.organizations o on o.id=p.organization_id join public.volunteer_profiles v on v.user_id=a.user_id where p.id=pid and a.user_id=auth.uid() and a.active and p.status='active' and o.status='active' and v.status<>'suspended' and (now() at time zone 'UTC')::date between p.start_date and p.end_date);$$;
create function app_private.can_review_survey(pid uuid) returns boolean language sql stable security definer set search_path='' as $$select app_private.is_active() and exists(select 1 from public.survey_projects p where p.id=pid and (app_private.can_manage_surveys() or app_private.ngo_admin(p.organization_id)));$$;
-- Registry directory is restricted to reviewers. Collectors see only records linked to their responses.
create function app_private.can_read_person(person uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.registry_persons p where p.id=person and app_private.can_read_project(p.project_id) and (app_private.can_review_survey(p.project_id) or exists(select 1 from public.survey_responses r where r.person_id=p.id and r.collector_id=auth.uid())));$$;
alter table public.survey_templates enable row level security;
alter table public.survey_projects enable row level security;
alter table public.survey_assignments enable row level security;
alter table public.registry_households enable row level security;
alter table public.registry_persons enable row level security;
alter table public.survey_responses enable row level security;
create policy template_read on public.survey_templates for select to authenticated using(app_private.can_manage_surveys() or exists(select 1 from public.survey_projects p where p.template_id=public.survey_templates.id and app_private.can_read_project(p.id)));
create policy project_read on public.survey_projects for select to authenticated using(app_private.can_read_project(id));
create policy assignment_read on public.survey_assignments for select to authenticated using(app_private.can_read_project(project_id) and (user_id=auth.uid() or app_private.can_review_survey(project_id)));
create policy person_read on public.registry_persons for select to authenticated using(app_private.can_read_person(id));
create policy household_read on public.registry_households for select to authenticated using(app_private.can_read_project(project_id) and (app_private.can_review_survey(project_id) or exists(select 1 from public.registry_persons p where p.household_id=public.registry_households.id and app_private.can_read_person(p.id))));
create policy response_read on public.survey_responses for select to authenticated using(app_private.can_read_project(project_id) and (collector_id=auth.uid() or app_private.can_review_survey(project_id)));
create function public.publish_survey_template(p_name text,p_questions jsonb) returns uuid language plpgsql security definer set search_path='' as $$
 declare q jsonb;ver integer;result uuid;
 begin
 if not app_private.can_manage_surveys() then raise exception 'Survey management permission required';end if;
 if p_name is null or length(trim(p_name)) not between 3 and 150 or p_questions is null or jsonb_typeof(p_questions)<>'array' then raise exception 'Template name and question list required';end if;
 if jsonb_array_length(p_questions) not between 1 and 50 or octet_length(p_questions::text)>50000 then raise exception 'Use 1–50 questions';end if;
 for q in select value from jsonb_array_elements(p_questions) loop
 if jsonb_typeof(q)<>'object' or jsonb_typeof(q->'label') is distinct from 'string' or jsonb_typeof(q->'id') is distinct from 'string' or jsonb_typeof(q->'type') is distinct from 'string' or coalesce(q->>'id','')!~'^[a-z][a-z0-9_]{0,39}$' or length(trim(coalesce(q->>'label',''))) not between 1 and 300 or coalesce(q->>'type','') not in ('text','number','date','choice','yesno') or jsonb_typeof(q->'required') is distinct from 'boolean' then raise exception 'Invalid question';end if;
 if q->>'type'='choice' then
 if jsonb_typeof(q->'options') is distinct from 'array' then raise exception 'Choice options required';end if;
 if jsonb_array_length(q->'options') not between 2 and 30 or exists(select 1 from jsonb_array_elements(q->'options') o where jsonb_typeof(o)<>'string' or length(trim(o#>>'{}')) not between 1 and 100) or (select count(distinct o) from jsonb_array_elements(q->'options') o)<>jsonb_array_length(q->'options') then raise exception 'Use 2–30 unique choice options';end if;
 end if;
 end loop;
 if (select count(distinct item.value->>'id') from jsonb_array_elements(p_questions) item)<>jsonb_array_length(p_questions) then raise exception 'Question IDs must be unique';end if;
 perform pg_advisory_xact_lock(hashtext('template:'||lower(trim(p_name))));
 select coalesce(max(version),0)+1 into ver from public.survey_templates where name=trim(p_name);
 insert into public.survey_templates(name,version,questions,created_by) values(trim(p_name),ver,p_questions,auth.uid()) returning id into result;
 insert into public.audit_events(actor_id,action,detail) values(auth.uid(),'survey_template_published',jsonb_build_object('id',result,'name',p_name,'version',ver));return result;
 end;$$;
create function public.create_survey_project(p_org uuid,p_title text,p_template uuid,p_geography uuid,p_target integer,p_start date,p_end date,p_purpose text,p_consent_version text,p_consent_notice text) returns uuid language plpgsql security definer set search_path='' as $$
 declare result uuid;
 begin
 if not app_private.can_manage_surveys() then raise exception 'Survey management permission required';end if;
 if not exists(select 1 from public.organizations where id=p_org and status='active') or not exists(select 1 from public.survey_templates where id=p_template) or not app_private.geo_active(p_geography) then raise exception 'Active NGO, geography and published template required';end if;
 if p_title is null or length(trim(p_title)) not between 3 and 150 or p_target is null or p_target not between 1 and 1000000 or p_start is null or p_end is null or p_end<p_start or p_purpose is null or length(trim(p_purpose)) not between 10 and 2000 or p_consent_version is null or length(trim(p_consent_version)) not between 1 and 100 or p_consent_notice is null or length(trim(p_consent_notice)) not between 20 and 5000 then raise exception 'Valid project dates, target, purpose and consent wording required';end if;
 insert into public.survey_projects(organization_id,title,template_id,geography_id,target,start_date,end_date,purpose,consent_version,consent_notice,created_by) values(p_org,trim(p_title),p_template,p_geography,p_target,p_start,p_end,trim(p_purpose),trim(p_consent_version),trim(p_consent_notice),auth.uid()) returning id into result;
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),p_org,'survey_project_created',jsonb_build_object('id',result));return result;
 end;$$;
create function public.set_survey_assignment(p_project uuid,p_user uuid,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
 declare org uuid;
 begin
 if not app_private.can_review_survey(p_project) then raise exception 'Project management permission required';end if;
 select organization_id into org from public.survey_projects where id=p_project and status='active' for update;
 if not found or p_active is null then raise exception 'Active project required';end if;
 if p_active and not exists(select 1 from public.accounts a join public.volunteer_profiles v on v.user_id=a.id where a.id=p_user and a.status='active' and v.status='verified' and exists(select 1 from public.profile_shares s where s.user_id=a.id and s.organization_id=org)) then raise exception 'Assign an active verified volunteer sharing with the project NGO';end if;
 insert into public.survey_assignments(project_id,user_id,active) values(p_project,p_user,p_active) on conflict(project_id,user_id) do update set active=excluded.active;
 insert into public.notifications(user_id,title,body) values(p_user,'Survey assignment updated','Open Survey projects to see your assigned field work.');
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail) values(auth.uid(),p_user,org,'survey_assignment_changed',jsonb_build_object('project',p_project,'active',p_active));
 end;$$;
create function public.save_survey_response(p_id uuid,p_project uuid,p_person uuid,p_household uuid,p_name text,p_birth date,p_household_label text,p_answers jsonb,p_consent jsonb,p_submit boolean,p_version integer) returns uuid language plpgsql security definer set search_path='' as $$
 declare proj public.survey_projects;old public.survey_responses;questions jsonb;q jsonb;value jsonb;pid uuid;hid uuid;result uuid;born date;cons jsonb;
 begin
 select * into proj from public.survey_projects where id=p_project for update;
 if not app_private.can_collect(p_project) then raise exception 'Active assignment within project dates required';end if;
 if p_submit is null or p_answers is null or jsonb_typeof(p_answers)<>'object' or octet_length(p_answers::text)>100000 or p_consent is null or jsonb_typeof(p_consent)<>'object' or octet_length(p_consent::text)>5000 then raise exception 'Invalid answers or consent';end if;
 select t.questions into questions from public.survey_templates t where t.id=proj.template_id;
 if exists(select 1 from jsonb_object_keys(p_answers) k where not exists(select 1 from jsonb_array_elements(questions) item where item.value->>'id'=k)) then raise exception 'Unknown question';end if;
 for q in select * from jsonb_array_elements(questions) loop
 value:=p_answers->(q->>'id');
 if value is null or value='null'::jsonb or value='""'::jsonb then
 if p_submit and (q->>'required')::boolean then raise exception 'Required answer missing: %',q->>'label';end if;
 continue;end if;
 if q->>'type' in ('text','date','choice') and (jsonb_typeof(value)<>'string' or length(value#>>'{}')>4000) then raise exception 'Text value required';end if;
 if q->>'type'='number' and jsonb_typeof(value)<>'number' then raise exception 'Numeric value required';end if;
 if q->>'type'='yesno' and jsonb_typeof(value)<>'boolean' then raise exception 'Yes/no value required';end if;
 if q->>'type'='choice' and not (q->'options' @> jsonb_build_array(value)) then raise exception 'Invalid choice';end if;
 if q->>'type'='date' then
 if (value#>>'{}')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Date must use YYYY-MM-DD';end if;
 perform (value#>>'{}')::date;
 end if;
 end loop;
 if p_id is not null then
 select * into old from public.survey_responses where id=p_id and project_id=p_project and collector_id=auth.uid() for update;
 if not found or old.version is distinct from p_version or old.status not in ('draft','correction_required') then raise exception 'Response changed or locked. Reload.';end if;
 pid:=old.person_id;select birth_date into born from public.registry_persons where id=pid;
 else
 if p_version is distinct from 0 then raise exception 'New response requires version zero';end if;
 if p_person is not null then
 select id,household_id,birth_date into pid,hid,born from public.registry_persons where id=p_person and project_id=p_project and app_private.can_read_person(id);
 if not found then raise exception 'Person unavailable in this project';end if;
 else
 if p_name is null or length(trim(p_name)) not between 2 and 200 or (p_birth is not null and p_birth>(now() at time zone 'UTC')::date) then raise exception 'Person name and valid birth date required';end if;
 born:=p_birth;
 end if;
 end if;
 if p_consent->'agreed' is distinct from 'true'::jsonb or coalesce(p_consent->>'method','') not in ('verbal','written') then raise exception 'Record informed consent before saving personal information';end if;
 if (born is null or born>((now() at time zone 'UTC')::date-interval '18 years')::date) and (length(trim(coalesce(p_consent->>'representative','')))<2 or length(trim(coalesce(p_consent->>'relationship','')))<2) then raise exception 'Guardian/representative and relationship required for minors or unknown age';end if;
 cons:=jsonb_build_object('agreed',true,'method',p_consent->>'method','representative',left(coalesce(p_consent->>'representative',''),200),'relationship',left(coalesce(p_consent->>'relationship',''),100),'consent_version',proj.consent_version,'notice',proj.consent_notice,'purpose',proj.purpose,'organization_id',proj.organization_id,'collector_id',auth.uid(),'recorded_at',now());
 if p_id is null and pid is null then
 if p_household is not null then
 select id into hid from public.registry_households h where h.id=p_household and h.project_id=p_project and (app_private.can_review_survey(p_project) or exists(select 1 from public.registry_persons per where per.household_id=h.id and app_private.can_read_person(per.id)));
 if not found then raise exception 'Household unavailable in this project';end if;
 else
 if p_household_label is null or length(trim(p_household_label)) not between 2 and 200 then raise exception 'Household label required';end if;
 insert into public.registry_households(project_id,label,geography_id,created_by) values(p_project,trim(p_household_label),proj.geography_id,auth.uid()) returning id into hid;
 end if;
 insert into public.registry_persons(project_id,household_id,full_name,birth_date,created_by) values(p_project,hid,trim(p_name),born,auth.uid()) returning id into pid;
 end if;
 if p_id is null then
 insert into public.survey_responses(project_id,person_id,collector_id,answers,consent,status) values(p_project,pid,auth.uid(),p_answers,cons,case when p_submit then 'submitted' else 'draft' end) returning id into result;
 else
 result:=p_id;update public.survey_responses set answers=p_answers,consent=cons,status=case when p_submit then 'submitted' else 'draft' end,version=version+1,updated_at=now(),review_note='',reviewed_by=null,reviewed_at=null where id=p_id;
 end if;
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),proj.organization_id,'survey_response_saved',jsonb_build_object('id',result,'project',p_project,'submitted',p_submit,'previous_version',p_version));return result;
 end;$$;
create function public.review_survey_response(p_id uuid,p_status text,p_note text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
 declare r public.survey_responses;org uuid;
 begin
 select * into r from public.survey_responses where id=p_id for update;
 if not found or not app_private.can_review_survey(r.project_id) then raise exception 'Project review permission required';end if;
 if r.collector_id=auth.uid() then raise exception 'Cannot review your own survey';end if;
 if r.status<>'submitted' or r.version is distinct from p_version then raise exception 'Only current submitted responses can be reviewed';end if;
 if p_status is null or p_status not in ('approved','correction_required','rejected') or p_note is null or length(trim(p_note)) not between 3 and 2000 then raise exception 'Review decision and note required';end if;
 update public.survey_responses set status=p_status,review_note=trim(p_note),reviewed_by=auth.uid(),reviewed_at=now(),version=version+1,updated_at=now() where id=p_id;
 select organization_id into org from public.survey_projects where id=r.project_id;
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),org,'survey_response_reviewed',jsonb_build_object('id',p_id,'status',p_status,'previous_version',p_version));
 insert into public.notifications(user_id,title,body) values(r.collector_id,'Survey review','A response was reviewed. Open its survey project for feedback.');
 end;$$;
create function public.close_survey_project(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
 begin
 if not app_private.can_manage_surveys() then raise exception 'Survey management permission required';end if;
 update public.survey_projects set status='closed' where id=p_id and status='active';
 if not found then raise exception 'Active project not found';end if;
 insert into public.audit_events(actor_id,action,detail) values(auth.uid(),'survey_project_closed',jsonb_build_object('id',p_id));
 end;$$;
revoke all on public.survey_templates,public.survey_projects,public.survey_assignments,public.registry_households,public.registry_persons,public.survey_responses from anon,authenticated;
grant select on public.survey_templates,public.survey_projects,public.survey_assignments,public.registry_households,public.registry_persons,public.survey_responses to authenticated;
grant all on public.survey_templates,public.survey_projects,public.survey_assignments,public.registry_households,public.registry_persons,public.survey_responses to service_role;
grant all on sequence public.registry_persons_registry_no_seq to service_role;
revoke all on function app_private.can_manage_surveys(),app_private.can_read_project(uuid),app_private.can_collect(uuid),app_private.can_review_survey(uuid),app_private.can_read_person(uuid) from public,anon,authenticated;
grant execute on function app_private.can_manage_surveys(),app_private.can_read_project(uuid),app_private.can_collect(uuid),app_private.can_review_survey(uuid),app_private.can_read_person(uuid) to authenticated;
revoke all on function public.publish_survey_template(text,jsonb),public.create_survey_project(uuid,text,uuid,uuid,integer,date,date,text,text,text),public.set_survey_assignment(uuid,uuid,boolean),public.save_survey_response(uuid,uuid,uuid,uuid,text,date,text,jsonb,jsonb,boolean,integer),public.review_survey_response(uuid,text,text,integer),public.close_survey_project(uuid) from public,anon,authenticated;
grant execute on function public.publish_survey_template(text,jsonb),public.create_survey_project(uuid,text,uuid,uuid,integer,date,date,text,text,text),public.set_survey_assignment(uuid,uuid,boolean),public.save_survey_response(uuid,uuid,uuid,uuid,text,date,text,jsonb,jsonb,boolean,integer),public.review_survey_response(uuid,text,text,integer),public.close_survey_project(uuid) to authenticated;

create or replace function public.set_account_access(p_user uuid,p_role text,p_status text) returns void language plpgsql security definer set search_path='' as $$
 begin
 perform pg_advisory_xact_lock(hashtext('poem-account-access'));
 if not app_private.is_super() then raise exception 'Super admin access required'; end if;
 if p_user=auth.uid() then raise exception 'Cannot change your own platform access'; end if;
 if p_role not in ('volunteer','admin','super_admin','volunteer_manager','ngo_manager','auditor','survey_manager') or p_status not in ('active','suspended') then raise exception 'Invalid account access'; end if;
 update public.accounts set platform_role=p_role,status=p_status where id=p_user;
 if not found then raise exception 'Account not found'; end if;
 insert into public.audit_events(actor_id,subject_id,action,detail) values(auth.uid(),p_user,'account_access_changed',jsonb_build_object('role',p_role,'status',p_status));
 end; $$;

create table public.survey_response_revisions(response_id uuid not null references public.survey_responses(id),version integer not null,snapshot jsonb not null,actor_id uuid not null references public.accounts(id),recorded_at timestamptz not null default now(),primary key(response_id,version));
alter table public.survey_response_revisions enable row level security;
create policy revision_read on public.survey_response_revisions for select to authenticated using(exists(select 1 from public.survey_responses r where r.id=response_id));
create function app_private.capture_survey_revision() returns trigger language plpgsql security definer set search_path='' as $$begin insert into public.survey_response_revisions(response_id,version,snapshot,actor_id) values(new.id,new.version,to_jsonb(new),auth.uid());return new;end;$$;
create trigger survey_revision after insert or update on public.survey_responses for each row execute function app_private.capture_survey_revision();
revoke all on function app_private.capture_survey_revision() from public,anon,authenticated;
revoke all on public.survey_response_revisions from anon,authenticated;
grant select on public.survey_response_revisions to authenticated;
grant all on public.survey_response_revisions to service_role;
create function public.survey_assignment_candidates(p_project uuid,p_query text) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare org uuid;result jsonb;
 begin
 if not app_private.can_review_survey(p_project) then raise exception 'Project management permission required';end if;
 if p_query is null or length(p_query)>100 then raise exception 'Query too long';end if;
 select organization_id into org from public.survey_projects where id=p_project;
 select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) into result from (select v.user_id,jsonb_build_object('full_name',v.details->>'full_name') as details from public.volunteer_profiles v join public.accounts a on a.id=v.user_id join public.profile_shares s on s.user_id=v.user_id and s.organization_id=org where a.status='active' and v.status='verified' and strpos(lower(coalesce(v.details->>'full_name','')),lower(p_query))>0 order by lower(coalesce(v.details->>'full_name','')),v.user_id limit 50) c;
 return result;
 end;$$;
revoke all on function public.survey_assignment_candidates(uuid,text) from public,anon,authenticated;
grant execute on function public.survey_assignment_candidates(uuid,text) to authenticated;
