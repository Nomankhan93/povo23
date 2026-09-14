-- 2.11 preserves old reservations and adds duplicate-safe device IDs.
alter table public.survey_capture_files add column request_fingerprint text;
create function public.reserve_offline_capture_file(p_id uuid,p_project uuid,p_question text,p_filename text,p_mime text,p_size integer,p_consent jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid:=p_id;q jsonb;previous public.survey_capture_files;fingerprint text;pr public.survey_projects;
begin
 if p_id is null then raise exception 'Stable attachment ID required';end if;
 perform pg_advisory_xact_lock(hashtext('offline-file:'||p_id::text));
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(p_project,p_question,p_filename,p_mime,p_size,p_consent)::text,'UTF8')),'hex');
 select * into previous from public.survey_capture_files where id=p_id;
 if found then
  if previous.collector_id is distinct from auth.uid() or previous.request_fingerprint is distinct from fingerprint then raise exception 'Attachment ID already belongs to different content or consent';end if;
  if not app_private.can_collect(previous.project_id) then raise exception 'Collection unavailable; refresh assignment and project policy';end if;
  if coalesce((p_consent->>'governance_version')::integer,0)<>(select governance_version from public.survey_projects where id=p_project) then raise exception 'Project policy changed; obtain current consent';end if;
  return p_id;
 end if;
 select * into pr from public.survey_projects where id=p_project for update;
 if not app_private.can_collect(p_project) then raise exception 'Active assignment required';end if;
 if p_consent->'agreed' is distinct from 'true'::jsonb or coalesce(p_consent->>'method','') not in ('verbal','written') or coalesce((p_consent->>'governance_version')::integer,0)<>pr.governance_version then raise exception 'Current consent and policy required before upload';end if;
 if coalesce(p_consent->>'capture_authority','') not in ('adult_subject','representative') or (p_consent->>'capture_authority'='representative' and (length(trim(coalesce(p_consent->>'representative','')))<2 or length(trim(coalesce(p_consent->>'relationship','')))<2)) then raise exception 'Record adult subject or guardian/representative authority before upload';end if;
 if p_size is null or p_size not between 1 and 5242880 or p_filename is null or length(trim(p_filename)) not between 1 and 200 or p_mime is null or p_mime not in ('image/jpeg','image/png','application/pdf') then raise exception 'Invalid file; PDF/JPG/PNG up to 5 MiB';end if;
 select x into q from public.survey_templates t cross join lateral jsonb_array_elements(t.questions) x where t.id=pr.template_id and x->>'id'=p_question;
 if q is null or q->>'type' not in ('photo','document') or (q->>'type'='photo' and p_mime='application/pdf') then raise exception 'Invalid attachment question';end if;
 insert into public.survey_capture_files(id,project_id,collector_id,question_id,object_name,filename,mime_type,size_bytes,consent) values(result,p_project,auth.uid(),p_question,result::text,p_filename,p_mime,p_size,jsonb_build_object('capture_authority',p_consent->>'capture_authority','method',p_consent->>'method','representative',left(p_consent->>'representative',200),'relationship',left(p_consent->>'relationship',100),'purpose',pr.purpose,'notice',pr.consent_notice,'consent_version',pr.consent_version,'governance_version',pr.governance_version,'recorded_at',now()));
 update public.survey_capture_files set request_fingerprint=fingerprint where id=result;
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),pr.organization_id,'survey_attachment_reserved',jsonb_build_object('id',result,'project',p_project));return result;
end;$$;

revoke all on function public.reserve_offline_capture_file(uuid,uuid,text,text,text,integer,jsonb) from public,anon;
grant execute on function public.reserve_offline_capture_file(uuid,uuid,text,text,text,integer,jsonb) to authenticated;
create function public.offline_capture_upload_complete(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare f public.survey_capture_files;
begin
 select * into f from public.survey_capture_files where id=p_id;
 if not found then return false;end if;
 if not app_private.is_active() or f.collector_id is distinct from auth.uid() or not app_private.can_read_project(f.project_id) then raise exception 'Attachment unavailable to this account';end if;
 return exists(select 1 from storage.objects o where o.bucket_id='survey-capture' and o.name=f.object_name and (o.metadata->>'size')::bigint=f.size_bytes and o.metadata->>'mimetype'=f.mime_type);
end;$$;
revoke all on function public.offline_capture_upload_complete(uuid) from public,anon;
grant execute on function public.offline_capture_upload_complete(uuid) to authenticated;
-- A downloaded bundle is an explicit collection authorization snapshot, not live permission.
create function public.download_field_project(p_project uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.survey_projects;result jsonb;
begin
 select * into p from public.survey_projects where id=p_project for update;
 if not app_private.can_collect(p_project) then raise exception 'Current collection assignment and policy required';end if;
 result:=jsonb_build_object('project',to_jsonb(p),'template',(select to_jsonb(t) from public.survey_templates t where t.id=p.template_id),'downloaded_at',now(),'valid_until',least(now()+interval '7 days',(p.end_date+1)::timestamptz),'owner_id',auth.uid(),'people',coalesce((select jsonb_agg(x) from (select per.* from public.registry_persons per where per.project_id=p.id and exists(select 1 from public.survey_responses r where r.person_id=per.id and r.collector_id=auth.uid()) order by per.id limit 200) x),'[]'::jsonb),'households',coalesce((select jsonb_agg(x) from (select h.* from public.registry_households h where h.project_id=p.id and exists(select 1 from public.registry_persons per join public.survey_responses r on r.person_id=per.id where per.household_id=h.id and r.collector_id=auth.uid()) order by h.id limit 200) x),'[]'::jsonb),'responses',coalesce((select jsonb_agg(x) from (select r.* from public.survey_responses r where r.project_id=p.id and r.collector_id=auth.uid() and r.status in ('draft','correction_required') order by r.id limit 200) x),'[]'::jsonb),'geography',(select to_jsonb(g) from public.geographies g where g.id=p.geography_id));
 insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),p.organization_id,'field_project_downloaded',jsonb_build_object('project',p_project,'policy_version',p.governance_version));
 return result;
end;$$;
revoke all on function public.download_field_project(uuid) from public,anon;
grant execute on function public.download_field_project(uuid) to authenticated;

create or replace function public.save_survey_response(p_id uuid,p_project uuid,p_person uuid,p_household uuid,p_name text,p_birth date,p_household_label text,p_answers jsonb,p_consent jsonb,p_submit boolean,p_version integer,p_request_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.survey_projects;result uuid;
begin
 if not app_private.is_active() then raise exception 'Active account required'; end if;
 -- The project lock serializes policy publication with first-time saves.
 select * into p from public.survey_projects where id=p_project for update;
 if not exists(select 1 from public.survey_save_receipts where actor_id=auth.uid() and request_id=p_request_id) then
  if p_consent ? 'template_id' and (p_consent->>'template_id') is distinct from p.template_id::text then raise exception 'Project template changed. Refresh the downloaded project and review the recovered answers';end if;
  if not app_private.can_collect(p_project) then raise exception 'Collection unavailable: check assignment, project policy and independent verification'; end if;
  if p.governance_version>0 and (p_consent->>'governance_version')::integer is distinct from p.governance_version then raise exception 'Project policy changed. Reload the project and review consent before saving'; end if;
 end if;
 result:=app_private.save_survey_response_before_governance(p_id,p_project,p_person,p_household,p_name,p_birth,p_household_label,p_answers,p_consent,p_submit,p_version,p_request_id);
 -- Do not mutate an already acknowledged response during idempotent replay.
 return result;
end;$$;
