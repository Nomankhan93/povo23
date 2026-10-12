-- FieldLance 2.43.0-r1 — Data Integrity Reporting Security & Fixture Correction
-- Preserve analytics_rows as SECURITY INVOKER while allowing authorized case due-date
-- reporting to consult protected structured follow-ups without granting raw table access.

create or replace function app_private.analytics_case_due_on(p_case uuid)
returns date
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_project uuid;
  v_legacy_due date;
  v_structured_due date;
begin
  select c.project_id,c.follow_up_on
    into v_project,v_legacy_due
  from public.beneficiary_cases c
  where c.id=p_case;

  if v_project is null or not app_private.can_manage_project(v_project) then
    return null;
  end if;

  select min(f.due_on)
    into v_structured_due
  from public.beneficiary_case_followups f
  where f.case_id=p_case
    and f.status='scheduled';

  return coalesce(v_structured_due,v_legacy_due);
end;
$$;

revoke all on function app_private.analytics_case_due_on(uuid) from public,anon;
grant execute on function app_private.analytics_case_due_on(uuid) to authenticated;

create or replace function app_private.analytics_rows(p_org uuid,p_project uuid,p_geo uuid,p_from date,p_to date)
returns table(id uuid,kind text,organization_id uuid,project_id uuid,geography_id uuid,label text,state text,created_at timestamptz,subject_id uuid,due_on date,amount numeric,currency text)
language sql stable security invoker set search_path='' as $$
 select r.* from (
select p.id,'projects'::text as kind,p.organization_id,p.id as project_id,p.geography_id,p.title as label,p.status as state,p.created_at,null::uuid as subject_id,null::date as due_on,null::numeric as amount,null::text as currency from public.survey_projects p where app_private.can_read_project(p.id)
 union all
select r.id,'responses'::text,p.organization_id,p.id,r.collection_geography_id,'Survey response'::text,r.status,r.created_at,null::uuid,null::date,null::numeric,null::text from public.survey_responses r join public.survey_projects p on p.id=r.project_id where app_private.can_review_project_area(p.id,r.collection_geography_id)
 union all
select a.id,'applications'::text,p.organization_id,p.id,p.geography_id,a.volunteer_name,a.status,a.created_at,null::uuid,null::date,null::numeric,null::text from public.work_applications a join public.survey_projects p on p.id=a.survey_project_id where app_private.can_manage_project(p.id)
 union all
select a.id,'assignments'::text,p.organization_id,p.id,p.geography_id,a.volunteer_name,a.status,a.created_at,a.user_id,null::date,null::numeric,null::text from public.work_assignments a join public.survey_projects p on p.id=a.survey_project_id where app_private.can_manage_project(p.id)
 union all
select a.id,'opportunities'::text,p.organization_id,p.id,p.geography_id,a.title,case when a.publication_state='published' and a.status='open' and a.applications_open then 'open' else 'not_open' end,a.created_at,null::uuid,null::date,null::numeric,null::text from public.work_opportunities a join public.survey_projects p on p.id=a.survey_project_id where app_private.can_manage_project(p.id)
 union all
select a.id,'cases'::text,p.organization_id,p.id,a.geography_id,'Case '||a.case_no,a.status,a.created_at,null::uuid,
  app_private.analytics_case_due_on(a.id),
  null::numeric,null::text
from public.beneficiary_cases a join public.survey_projects p on p.id=a.project_id where app_private.can_manage_project(p.id)
 union all
select a.id,'assistance'::text,p.organization_id,p.id,p.geography_id,a.category||' assistance',a.status,a.created_at,null::uuid,null::date,null::numeric,null::text from public.assistance_entries a join public.survey_projects p on p.id=a.project_id where app_private.can_manage_project(p.id)
 union all
select * from app_private.analytics_finance_rows()
 union all
select a.id,'organizations'::text,a.id,null::uuid,null::uuid,a.name,a.status,a.created_at,null::uuid,null::date,null::numeric,null::text from public.organizations a where true
 union all
select a.id,'organization_applications'::text,null::uuid,null::uuid,null::uuid,'Organization application'::text,a.status,a.created_at,null::uuid,null::date,null::numeric,null::text from public.partner_ngo_applications a where true
 union all
select a.user_id,'profiles'::text,null::uuid,null::uuid,null::uuid,'Field Worker profile'::text,a.status,a.updated_at,null::uuid,null::date,null::numeric,null::text from public.volunteer_profiles a where true
 ) r where (p_org is null or r.organization_id=p_org)
 and (p_project is null or r.project_id=p_project)
 and (p_geo is null or app_private.geo_contains(p_geo,r.geography_id))
 and (p_from is null or r.created_at >= (p_from::timestamp at time zone 'UTC'))
 and (p_to is null or r.created_at < ((p_to+1)::timestamp at time zone 'UTC'));
$$;

revoke all on function app_private.analytics_rows(uuid,uuid,uuid,date,date) from public,anon;
grant execute on function app_private.analytics_rows(uuid,uuid,uuid,date,date) to authenticated;
