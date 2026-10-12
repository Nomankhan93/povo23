-- FieldLance 2.43.0 — Data Integrity & Reporting Consistency
-- Repairs three cross-layer consistency gaps without widening authority:
-- 1) correction_required survey responses remain actionable in Task Center;
-- 2) operational case due dates follow scheduled case follow-up records first;
-- 3) direct-assignment work history does not call collection_closed work completed
--    before the project reaches operational completion.

create or replace function app_private.sync_survey_review_task() returns trigger
language plpgsql security definer set search_path='' as $$
declare org uuid;
begin
  select organization_id into org from public.survey_projects where id=new.project_id;
  perform app_private.upsert_derived_operational_task(
    'survey_response_review',
    'Review submitted survey response',
    'Review the submitted field response in Verification. Task completion does not approve or reject the response.',
    'survey_response',new.id::text,'Verification',org,new.project_id,null,'survey_manager','high',new.updated_at+interval '24 hours',
    new.status in ('submitted','correction_required'),
    jsonb_build_object('response_status',new.status,'collector_id',new.collector_id)
  );
  return new;
end;$$;

revoke all on function app_private.sync_survey_review_task() from public,anon,authenticated;

-- Repair currently actionable survey-review tasks that may have been cancelled by
-- the historical correction_requested/correction_required vocabulary mismatch.
do $$
declare r record;
begin
  for r in
    select sr.id,sr.project_id,sr.collector_id,sr.status,sr.updated_at,p.organization_id
    from public.survey_responses sr
    join public.survey_projects p on p.id=sr.project_id
    where sr.status in ('submitted','correction_required')
  loop
    perform app_private.upsert_derived_operational_task(
      'survey_response_review',
      'Review submitted survey response',
      'Review the submitted field response in Verification. Task completion does not approve or reject the response.',
      'survey_response',r.id::text,'Verification',r.organization_id,r.project_id,null,'survey_manager','high',r.updated_at+interval '24 hours',
      true,
      jsonb_build_object('response_status',r.status,'collector_id',r.collector_id)
    );
  end loop;
end;$$;

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
  coalesce((select min(f.due_on) from public.beneficiary_case_followups f where f.case_id=a.id and f.status='scheduled'),a.follow_up_on),
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

create or replace function public.work_experience_history(p_user uuid default null,p_page integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
 v_target_user_id uuid:=coalesce(p_user,auth.uid());
 owner_view boolean;
 manager_view boolean;
 result jsonb;
begin
 if not app_private.is_active() then raise exception 'Active account required'; end if;
 if v_target_user_id is null or p_page is null or p_page<0 or p_page>100000 then raise exception 'Valid volunteer and page required'; end if;
 owner_view:=v_target_user_id=auth.uid();
 manager_view:=app_private.can_manage_volunteers();
 if not owner_view and not manager_view and not app_private.can_read_profile(v_target_user_id) then
  raise exception 'Profile access required';
 end if;
 if not exists(select 1 from public.volunteer_profiles where user_id=v_target_user_id and status<>'suspended') then
  raise exception 'Volunteer profile unavailable';
 end if;

 with response_stats as materialized (
  select r.project_id,r.collector_id,
   count(*) filter(where r.status<>'draft')::int submitted_surveys,
   count(*) filter(where r.status='approved')::int approved_surveys,
   count(*) filter(where r.status='rejected')::int rejected_surveys,
   count(*) filter(where r.status='correction_required')::int correction_required_surveys,
   count(*) filter(where r.status='submitted')::int pending_review_surveys,
   count(*) filter(where r.status in ('approved','rejected','correction_required'))::int reviewed_surveys,
   min(r.created_at)::date first_activity_on,
   max(r.updated_at)::date last_activity_on,
   max(r.reviewed_at) filter(where r.status='approved') last_approved_at
  from public.survey_responses r
  where r.collector_id=v_target_user_id
  group by r.project_id,r.collector_id
 ), assignment_stats as materialized (
  select w.survey_project_id,w.user_id,
   bool_or(w.status='active') active_assignment,
   bool_or(w.status='completed') completed_assignment,
   bool_or(w.status='cancelled') cancelled_assignment,
   min(w.start_date) assignment_start,
   max(w.end_date) assignment_end,
   max(w.completed_at) filter(where w.status='completed') completed_at,
   (array_agg(nullif(w.opportunity_title,'') order by w.created_at desc)
      filter(where nullif(w.opportunity_title,'') is not null))[1] role_title,
   count(*)::int assignment_count
  from public.work_assignments w
  where w.user_id=v_target_user_id
    and w.responded_at is not null
    and w.status in ('active','completed','cancelled')
  group by w.survey_project_id,w.user_id
 ), area_stats as materialized (
  select x.project_id,x.collector_id,jsonb_agg(x.name order by x.name) field_areas
  from (
   select distinct r.project_id,r.collector_id,g.name
   from public.survey_responses r
   join public.registry_persons rp on rp.id=r.person_id
   join public.registry_households h on h.id=rp.household_id
   join public.geographies g on g.id=h.geography_id
   where r.collector_id=v_target_user_id and r.status<>'draft'
  ) x
  group by x.project_id,x.collector_id
 ), base as materialized (
  select p.id survey_project_id,p.organization_id,org.name organization_name,p.title project_title,p.purpose project_purpose,
   p.status project_status,p.project_closure_state,p.start_date project_start,p.end_date project_end,
   t.id template_id,t.name template_name,
   g.id project_geography_id,g.name project_area,
   coalesce(ar.field_areas,'[]'::jsonb) field_areas,
   coalesce(rs.submitted_surveys,0) submitted_surveys,
   coalesce(rs.approved_surveys,0) approved_surveys,
   coalesce(rs.rejected_surveys,0) rejected_surveys,
   coalesce(rs.correction_required_surveys,0) correction_required_surveys,
   coalesce(rs.pending_review_surveys,0) pending_review_surveys,
   coalesce(rs.reviewed_surveys,0) reviewed_surveys,
   rs.first_activity_on,rs.last_activity_on,rs.last_approved_at,
   coalesce(ws.active_assignment,false) active_assignment,
   coalesce(ws.completed_assignment,false) completed_assignment,
   coalesce(ws.cancelled_assignment,false) cancelled_assignment,
   ws.assignment_start,ws.assignment_end,ws.completed_at,
   coalesce(ws.role_title,'Field Surveyor') role_title,
   coalesce(ws.assignment_count,0) assignment_count,
   coalesce(sa.active,false) direct_assignment_active,
   (ws.survey_project_id is not null) workforce_assignment
  from public.survey_projects p
  join public.organizations org on org.id=p.organization_id
  join public.survey_templates t on t.id=p.template_id
  join public.geographies g on g.id=p.geography_id
  left join public.survey_assignments sa on sa.project_id=p.id and sa.user_id=v_target_user_id
  left join response_stats rs on rs.project_id=p.id and rs.collector_id=v_target_user_id
  left join assignment_stats ws on ws.survey_project_id=p.id and ws.user_id=v_target_user_id
  left join area_stats ar on ar.project_id=p.id and ar.collector_id=v_target_user_id
  where coalesce(sa.active,false) or rs.project_id is not null or ws.survey_project_id is not null
 ), enriched as materialized (
  select b.*,
   case
    when b.completed_assignment then 'completed'
    when b.project_closure_state in ('operational_completed','financially_reconciled','fully_closed') and b.submitted_surveys>0 then 'completed'
    when b.active_assignment or (b.direct_assignment_active and b.project_status='active') then 'in_progress'
    when b.cancelled_assignment then 'cancelled'
    else 'recorded'
   end workflow_status,
   (b.completed_assignment or b.approved_surveys>0) verified,
   coalesce(b.assignment_start,b.first_activity_on,b.project_start) experience_start,
   case
    when b.completed_assignment then coalesce((b.completed_at at time zone 'UTC')::date,b.last_activity_on,b.assignment_end,b.project_end)
    when b.project_closure_state in ('operational_completed','financially_reconciled','fully_closed') and b.submitted_surveys>0 then coalesce(b.last_activity_on,b.project_end)
    when b.cancelled_assignment and b.submitted_surveys>0 then b.last_activity_on
    else null
   end experience_end,
   case when b.workforce_assignment then 'workforce_assignment' else 'direct_assignment' end source_kind,
   case when b.completed_assignment then 'completed_assignment'
        when b.approved_surveys>0 then 'approved_surveys'
        else 'platform_assignment' end verification_basis
  from base b
 ), visible as materialized (
  select * from enriched
  where owner_view or manager_view or verified
 ), batch as (
  select * from visible
  order by coalesce(last_activity_on,experience_start,project_start) desc,project_title,survey_project_id
  limit 50 offset p_page*50
 )
 select jsonb_build_object(
   'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'id',b.survey_project_id,
      'organization_name',b.organization_name,
      'project_title',b.project_title,
      'field_label',b.template_name,
      'project_area',b.project_area,
      'field_areas',b.field_areas,
      'role_title',b.role_title,
      'workflow_status',b.workflow_status,
      'verified',b.verified,
      'verification_basis',b.verification_basis,
      'source_kind',b.source_kind,
      'start_date',b.experience_start,
      'end_date',b.experience_end,
      'last_activity_on',b.last_activity_on,
      'last_approved_at',b.last_approved_at,
      'submitted_surveys',b.submitted_surveys,
      'approved_surveys',b.approved_surveys,
      'rejected_surveys',b.rejected_surveys,
      'correction_required_surveys',b.correction_required_surveys,
      'pending_review_surveys',b.pending_review_surveys,
      'reviewed_surveys',b.reviewed_surveys,
      'assignment_count',b.assignment_count
    ) order by coalesce(b.last_activity_on,b.experience_start,b.project_start) desc,b.project_title,b.survey_project_id) from batch b),'[]'::jsonb),
   'total',(select count(*) from visible),
   'page',p_page,
   'page_size',50
 ) into result;
 return result;
end;
$$;

revoke all on function public.work_experience_history(uuid,integer) from public,anon,authenticated;
grant execute on function public.work_experience_history(uuid,integer) to authenticated;
