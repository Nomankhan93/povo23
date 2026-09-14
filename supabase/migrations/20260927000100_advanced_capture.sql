-- POEM 2.10: immutable advanced questions, server validation, private online attachments.
create function app_private.validate_capture_questions(qs jsonb) returns void language plpgsql set search_path='' as $$
declare q jsonb; seen jsonb:='[]'; parent jsonb;
begin
 for q in select value from jsonb_array_elements(qs) loop
 if jsonb_typeof(q)<>'object' or jsonb_typeof(q->'label') is distinct from 'string' or coalesce(q->>'id','')!~'^[a-z][a-z0-9_]{0,39}$' or length(trim(q->>'label')) not between 1 and 300 or coalesce(q->>'type','') not in ('text','number','date','choice','yesno','multiple','phone','identity','household','gps','photo','document') or jsonb_typeof(q->'required') is distinct from 'boolean' then raise exception 'Invalid question';end if;
 if exists(select 1 from jsonb_array_elements(seen) x where x->>'id'=q->>'id') then raise exception 'Question IDs must be unique';end if;
 if q->>'type' in ('choice','multiple') then
 if jsonb_typeof(q->'options') is distinct from 'array' then raise exception 'Choice options required';end if;
 if jsonb_array_length(q->'options') not between 2 and 30 or exists(select 1 from jsonb_array_elements(q->'options') o where jsonb_typeof(o)<>'string' or length(trim(o#>>'{}')) not between 1 and 100) or (select count(distinct o) from jsonb_array_elements(q->'options') o)<>jsonb_array_length(q->'options') then raise exception 'Use 2–30 unique choice options';end if;
 end if;
 if q ? 'when' then
 if jsonb_typeof(q->'when') is distinct from 'object' then raise exception 'Invalid condition';end if;
 select x into parent from jsonb_array_elements(seen) x where x->>'id'=q->'when'->>'question';
 if parent is null or parent->>'type' not in ('choice','yesno') or not (q->'when' ? 'equals') then raise exception 'Condition must reference an earlier choice or yes/no question';end if;
 if (parent->>'type'='yesno' and jsonb_typeof(q->'when'->'equals') is distinct from 'boolean') or (parent->>'type'='choice' and not(parent->'options' @> jsonb_build_array(q->'when'->'equals'))) then raise exception 'Invalid condition value';end if;
 end if;
 if q ? 'min' or q ? 'max' then
 if q->>'type'<>'number' or (q ? 'min' and jsonb_typeof(q->'min') is distinct from 'number') or (q ? 'max' and jsonb_typeof(q->'max') is distinct from 'number') or (q->>'min')::numeric>(q->>'max')::numeric then raise exception 'Invalid numeric range';end if;
 end if;
 if q ? 'after' and (q->>'type'<>'date' or not exists(select 1 from jsonb_array_elements(seen) x where x->>'id'=q->>'after' and x->>'type'='date')) then raise exception 'Date rule must reference earlier date';end if;
 seen:=seen||jsonb_build_array(q);
 end loop;
end;$$;

create table public.survey_capture_files(
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.survey_projects(id),
 collector_id uuid not null references public.accounts(id), question_id text not null,
 object_name text not null unique, filename text not null, mime_type text not null,
 size_bytes integer not null check(size_bytes between 1 and 5242880),
 consent jsonb not null, created_at timestamptz not null default now()
);
alter table public.survey_capture_files enable row level security;
grant select on public.survey_capture_files to authenticated;
create policy capture_files_read on public.survey_capture_files for select to authenticated using(app_private.can_read_project(project_id) and (collector_id=auth.uid() or app_private.can_review_survey(project_id)));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('survey-capture','survey-capture',false,5242880,array['image/jpeg','image/png','application/pdf']);
create function app_private.can_access_capture_file(path text, writing boolean) returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.survey_capture_files f where f.object_name=path and case when writing then f.collector_id=auth.uid() and app_private.can_collect(f.project_id) else app_private.can_read_project(f.project_id) and (f.collector_id=auth.uid() or app_private.can_review_survey(f.project_id)) end);$$;
revoke all on function app_private.can_access_capture_file(text,boolean) from public,anon;
grant execute on function app_private.can_access_capture_file(text,boolean) to authenticated;
create policy capture_object_insert on storage.objects for insert to authenticated with check(bucket_id='survey-capture' and app_private.can_access_capture_file(name,true));
create policy capture_object_read on storage.objects for select to authenticated using(bucket_id='survey-capture' and app_private.can_access_capture_file(name,false));
-- No update/delete grant for immutable evidence objects. Orphan cleanup is an explicit operator task.
create function public.reserve_survey_capture_file(p_project uuid,p_question text,p_filename text,p_mime text,p_size integer,p_consent jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid:=gen_random_uuid();q jsonb;pr public.survey_projects;
begin
 select * into pr from public.survey_projects where id=p_project for update;
 if not app_private.can_collect(p_project) then raise exception 'Active assignment required';end if;
 if p_consent->'agreed' is distinct from 'true'::jsonb or coalesce(p_consent->>'method','') not in ('verbal','written') or coalesce((p_consent->>'governance_version')::integer,0)<>pr.governance_version then raise exception 'Current consent and policy required before upload';end if;
 if coalesce(p_consent->>'capture_authority','') not in ('adult_subject','representative') or (p_consent->>'capture_authority'='representative' and (length(trim(coalesce(p_consent->>'representative','')))<2 or length(trim(coalesce(p_consent->>'relationship','')))<2)) then raise exception 'Record adult subject or guardian/representative authority before upload';end if;
 if p_size is null or p_size not between 1 and 5242880 or p_filename is null or length(trim(p_filename)) not between 1 and 200 or p_mime is null or p_mime not in ('image/jpeg','image/png','application/pdf') then raise exception 'Invalid file; PDF/JPG/PNG up to 5 MiB';end if;
 select x into q from public.survey_templates t cross join lateral jsonb_array_elements(t.questions) x where t.id=pr.template_id and x->>'id'=p_question;
 if q is null or q->>'type' not in ('photo','document') or (q->>'type'='photo' and p_mime='application/pdf') then raise exception 'Invalid attachment question';end if;
 insert into public.survey_capture_files(id,project_id,collector_id,question_id,object_name,filename,mime_type,size_bytes,consent) values(result,p_project,auth.uid(),p_question,result::text,p_filename,p_mime,p_size,jsonb_build_object('capture_authority',p_consent->>'capture_authority','method',p_consent->>'method','representative',left(p_consent->>'representative',200),'relationship',left(p_consent->>'relationship',100),'purpose',pr.purpose,'notice',pr.consent_notice,'consent_version',pr.consent_version,'governance_version',pr.governance_version,'recorded_at',now()));
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),pr.organization_id,'survey_attachment_reserved',jsonb_build_object('id',result,'project',p_project));return result;
end;$$;
create function public.authorize_survey_capture_view(p_id uuid) returns text language plpgsql security definer set search_path='' as $$
declare f public.survey_capture_files;
begin
 select * into f from public.survey_capture_files where id=p_id;
 if not found or not app_private.can_access_capture_file(f.object_name,false) then raise exception 'Attachment unavailable';end if;
 insert into public.audit_events(actor_id,action,detail) values(auth.uid(),'survey_attachment_view_authorized',jsonb_build_object('id',p_id,'project',f.project_id));return f.object_name;
end;$$;
revoke all on function public.reserve_survey_capture_file(uuid,text,text,text,integer,jsonb),public.authorize_survey_capture_view(uuid) from public,anon;
grant execute on function public.reserve_survey_capture_file(uuid,text,text,text,integer,jsonb),public.authorize_survey_capture_view(uuid) to authenticated;

create function app_private.validate_capture_answers(qs jsonb, answers jsonb, submitting boolean, project uuid) returns void language plpgsql security definer set search_path='' as $$
declare q jsonb;v jsonb;m jsonb;visible jsonb:='{}';s text;d date;
begin
 if exists(select 1 from jsonb_object_keys(answers) k where not exists(select 1 from jsonb_array_elements(qs) x where x->>'id'=k)) then raise exception 'Unknown question';end if;
 for q in select value from jsonb_array_elements(qs) loop
 v:=answers->(q->>'id');
 if q ? 'when' and (visible->(q->'when'->>'question') is distinct from q->'when'->'equals') then
 if answers ? (q->>'id') then raise exception 'Hidden answer must be removed: %',q->>'label';end if;continue;end if;
 visible:=visible||jsonb_build_object(q->>'id',v);
 if v is null or v='null'::jsonb or v='""'::jsonb or v='[]'::jsonb then
 if submitting and (q->>'required')::boolean then raise exception 'Required answer missing: %',q->>'label';end if;continue;end if;
 s:=v#>>'{}';
 if q->>'type' in ('text','date','choice','phone','identity','photo','document') and (jsonb_typeof(v)<>'string' or length(s)>4000) then raise exception 'Text value required';end if;
 if q->>'type'='number' then
 if jsonb_typeof(v)<>'number' then raise exception 'Numeric value required';end if;
 if s::numeric<(q->>'min')::numeric or s::numeric>(q->>'max')::numeric then raise exception 'Numeric answer outside range: %',q->>'label';end if;end if;
 if q->>'type'='yesno' and jsonb_typeof(v)<>'boolean' then raise exception 'Yes/no value required';end if;
 if q->>'type'='choice' and not(q->'options' @> jsonb_build_array(v)) then raise exception 'Invalid choice';end if;
 if q->>'type'='multiple' then
 if jsonb_typeof(v)<>'array' then raise exception 'Multiple choices must be an array';end if;
 if not(q->'options' @> v) or (select count(distinct x) from jsonb_array_elements(v) x)<>jsonb_array_length(v) then raise exception 'Invalid multiple choices';end if;end if;
 if q->>'type'='phone' and s!~'^\+?[0-9]{7,15}$' then raise exception 'Phone requires 7–15 digits, optional leading +';end if;
 if q->>'type'='identity' and s!~'^[0-9]{13}$' then raise exception 'Identity number requires 13 digits';end if;
 if q->>'type'='date' then
 if s!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Date must use YYYY-MM-DD';end if;d:=s::date;
 if q ? 'after' and nullif(visible->>(q->>'after'),'') is not null and d<(visible->>(q->>'after'))::date then raise exception 'Date precedes referenced date';end if;end if;
 if q->>'type'='household' then
 if jsonb_typeof(v)<>'array' then raise exception 'Household members must be an array';end if;
 if jsonb_array_length(v)>30 then raise exception 'Maximum 30 household members';end if;
 for m in select value from jsonb_array_elements(v) loop
 if jsonb_typeof(m)<>'object' or exists(select 1 from jsonb_object_keys(m) k where k not in ('full_name','birth_date','relationship')) or jsonb_typeof(m->'full_name') is distinct from 'string' or length(trim(m->>'full_name')) not between 2 and 200 or jsonb_typeof(m->'relationship') is distinct from 'string' or length(trim(m->>'relationship')) not between 2 and 100 then raise exception 'Member name and relationship required';end if;
 if nullif(m->>'birth_date','') is not null then
 if (m->>'birth_date')!~'^\d{4}-\d{2}-\d{2}$' or (m->>'birth_date')::date>current_date then raise exception 'Invalid member birth date';end if;end if;
 end loop;end if;
 if q->>'type'='gps' then
 if jsonb_typeof(v)<>'object' then raise exception 'Invalid GPS';end if;
 if v ? 'unavailable_reason' then
 if length(trim(coalesce(v->>'unavailable_reason',''))) not between 5 and 300 then raise exception 'GPS unavailable reason required';end if;
 else
 if jsonb_typeof(v->'latitude') is distinct from 'number' or jsonb_typeof(v->'longitude') is distinct from 'number' or jsonb_typeof(v->'accuracy') is distinct from 'number' or abs((v->>'latitude')::numeric)>90 or abs((v->>'longitude')::numeric)>180 or (v->>'accuracy')::numeric<0 or nullif(v->>'captured_at','') is null then raise exception 'Invalid GPS coordinates/accuracy/time';end if;
 perform (v->>'captured_at')::timestamptz;
 end if;end if;
 if q->>'type' in ('photo','document') and not exists(select 1 from public.survey_capture_files f join storage.objects o on o.bucket_id='survey-capture' and o.name=f.object_name where f.id::text=s and f.project_id=project and f.collector_id=auth.uid() and f.question_id=q->>'id' and (o.metadata->>'size')::bigint=f.size_bytes and o.metadata->>'mimetype'=f.mime_type) then raise exception 'Uploaded attachment unavailable for this collector/project/question';end if;
 end loop;
end;$$;
revoke all on function app_private.validate_capture_questions(jsonb),app_private.validate_capture_answers(jsonb,jsonb,boolean,uuid) from public,anon,authenticated;

create or replace function public.publish_survey_template(p_name text,p_questions jsonb) returns uuid language plpgsql security definer set search_path='' as $$
 declare q jsonb;ver integer;result uuid;
 begin
 if not app_private.can_manage_surveys() then raise exception 'Survey management permission required';end if;
 if p_name is null or length(trim(p_name)) not between 3 and 150 or p_questions is null or jsonb_typeof(p_questions)<>'array' then raise exception 'Template name and question list required';end if;
 if jsonb_array_length(p_questions) not between 1 and 50 or octet_length(p_questions::text)>50000 then raise exception 'Use 1–50 questions';end if;
 perform app_private.validate_capture_questions(p_questions);
 perform pg_advisory_xact_lock(hashtext('template:'||lower(trim(p_name))));
 select coalesce(max(version),0)+1 into ver from public.survey_templates where name=trim(p_name);
 insert into public.survey_templates(name,version,questions,created_by) values(trim(p_name),ver,p_questions,auth.uid()) returning id into result;
 insert into public.audit_events(actor_id,action,detail) values(auth.uid(),'survey_template_published',jsonb_build_object('id',result,'name',p_name,'version',ver));return result;
 end;$$;

create or replace function app_private.save_survey_response_v21(p_id uuid,p_project uuid,p_person uuid,p_household uuid,p_name text,p_birth date,p_household_label text,p_answers jsonb,p_consent jsonb,p_submit boolean,p_version integer) returns uuid language plpgsql security definer set search_path='' as $$
 declare proj public.survey_projects;old public.survey_responses;questions jsonb;q jsonb;value jsonb;pid uuid;hid uuid;result uuid;born date;cons jsonb;
 begin
 select * into proj from public.survey_projects where id=p_project for update;
 if not app_private.can_collect(p_project) then raise exception 'Active assignment within project dates required';end if;
 if p_submit is null or p_answers is null or jsonb_typeof(p_answers)<>'object' or octet_length(p_answers::text)>100000 or p_consent is null or jsonb_typeof(p_consent)<>'object' or octet_length(p_consent::text)>5000 then raise exception 'Invalid answers or consent';end if;
 select t.questions into questions from public.survey_templates t where t.id=proj.template_id;
 perform app_private.validate_capture_answers(questions,p_answers,p_submit,p_project);
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
 if (born is null or born>((now() at time zone 'UTC')::date-interval '18 years')::date or exists(select 1 from jsonb_array_elements(questions) qq cross join lateral jsonb_array_elements(case when qq->>'type'='household' and jsonb_typeof(p_answers->(qq->>'id'))='array' then p_answers->(qq->>'id') else '[]'::jsonb end) mm where nullif(mm->>'birth_date','') is null or (mm->>'birth_date')::date>((now() at time zone 'UTC')::date-interval '18 years')::date)) and (length(trim(coalesce(p_consent->>'representative','')))<2 or length(trim(coalesce(p_consent->>'relationship','')))<2) then raise exception 'Guardian/representative and relationship required for minors or unknown age';end if;
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
