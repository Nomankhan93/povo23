-- FieldLance 2.41.1 — Map Completeness & Evidence Review
-- Adds a paged, server-filtered map contract while preserving the 2.40 RPC for older clients.

create function public.field_operations_map_page(
  p_project uuid default null,
  p_from date default null,
  p_to date default null,
  p_worker uuid default null,
  p_geography uuid default null,
  p_status text default null,
  p_quality text default null,
  p_layers text[] default null,
  p_review_only boolean default false,
  p_cursor_at timestamptz default null,
  p_cursor_id text default null,
  p_page_size integer default 150
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  viewer uuid:=auth.uid();
  from_date date:=coalesce(p_from,current_date-30);
  to_date date:=coalesce(p_to,current_date);
  page_size integer:=least(greatest(coalesce(p_page_size,150),1),500);
  role_name text:='personal';
  result jsonb;
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  if from_date>to_date or to_date-from_date>366 then raise exception 'Map date range must be between 1 and 367 days';end if;
  if (p_cursor_at is null) <> (p_cursor_id is null) then raise exception 'Map cursor time and id must be supplied together';end if;
  if p_quality is not null and p_quality not in ('within_assigned_area','outside_assigned_area','poor_accuracy','location_unavailable','unable_to_determine') then
    raise exception 'Unsupported map quality filter';
  end if;
  if p_layers is not null and exists(
    select 1 from unnest(p_layers) x where x not in ('survey','attendance_check_in','attendance_check_out','case_follow_up')
  ) then raise exception 'Unsupported map layer filter';end if;

  if p_project is not null then
    if app_private.can_manage_project(p_project) then role_name:='manager';
    elsif app_private.project_staff_active(p_project,'area_focal_person') then role_name:='area_focal_person';
    elsif exists(select 1 from public.work_assignments w where w.survey_project_id=p_project and w.user_id=viewer and w.status='active')
       or exists(select 1 from public.survey_assignments s where s.project_id=p_project and s.user_id=viewer and s.active) then role_name:='field_worker';
    else raise exception 'Project field map access required';end if;
  end if;
  if p_project is null and p_worker is not null and p_worker<>viewer then raise exception 'Personal field map can only show your own evidence';end if;
  if p_project is not null and role_name='field_worker' and p_worker is not null and p_worker<>viewer then raise exception 'Field Worker project map can only show your own evidence';end if;

  with survey_base as (
    select ('survey:'||r.id::text||':'||(q->>'id')) evidence_id,'survey'::text layer,r.id source_id,'response'::text source_kind,r.id source_context_id,
      p.id project_id,p.title project_title,p.organization_id,r.collector_id worker_id,a.full_name worker_name,r.collection_geography_id geography_id,g.name geography_name,r.status source_status,
      q->>'label' source_label,
      case when jsonb_typeof(r.answers->(q->>'id'))='object' and jsonb_typeof((r.answers->(q->>'id'))->'latitude')='number' then ((r.answers->(q->>'id'))->>'latitude')::numeric end latitude,
      case when jsonb_typeof(r.answers->(q->>'id'))='object' and jsonb_typeof((r.answers->(q->>'id'))->'longitude')='number' then ((r.answers->(q->>'id'))->>'longitude')::numeric end longitude,
      case when jsonb_typeof(r.answers->(q->>'id'))='object' and jsonb_typeof((r.answers->(q->>'id'))->'accuracy')='number' then ((r.answers->(q->>'id'))->>'accuracy')::numeric end accuracy_m,
      coalesce(app_private.try_timestamptz((r.answers->(q->>'id'))->>'captured_at'),r.updated_at) captured_at,
      r.updated_at received_at,
      case when jsonb_typeof(r.answers->(q->>'id'))='object' then nullif((r.answers->(q->>'id'))->>'unavailable_reason','') end note
    from public.survey_responses r join public.survey_projects p on p.id=r.project_id join public.survey_templates t on t.id=p.template_id
    cross join lateral jsonb_array_elements(t.questions) q
    join public.accounts a on a.id=r.collector_id left join public.geographies g on g.id=r.collection_geography_id
    where q->>'type'='gps'
      and (p_project is null or p.id=p_project)
      and coalesce(app_private.try_timestamptz((r.answers->(q->>'id'))->>'captured_at'),r.updated_at)::date between from_date and to_date
      and ((p_project is null and r.collector_id=viewer) or (p_project is not null and app_private.map_evidence_allowed(p.id,r.collection_geography_id,r.collector_id)))
  ), attendance_base as (
    select ('attendance:'||l.id::text) evidence_id,case l.event_type when 'check_in' then 'attendance_check_in' else 'attendance_check_out' end layer,l.id source_id,
      'attendance'::text source_kind,w.id source_context_id,w.survey_project_id project_id,p.title project_title,p.organization_id,w.user_id worker_id,a.full_name worker_name,
      w.collection_geography_id geography_id,g.name geography_name,s.status source_status,
      case l.event_type when 'check_in' then 'Attendance check-in' else 'Attendance check-out' end source_label,l.latitude,l.longitude,l.accuracy_m,l.captured_at,l.received_at,l.note
    from public.assignment_session_locations l join public.assignment_work_sessions s on s.id=l.session_id join public.work_assignments w on w.id=s.assignment_id
    join public.survey_projects p on p.id=w.survey_project_id join public.accounts a on a.id=w.user_id left join public.geographies g on g.id=w.collection_geography_id
    where (p_project is null or p.id=p_project) and l.captured_at::date between from_date and to_date
      and ((p_project is null and w.user_id=viewer) or (p_project is not null and app_private.map_evidence_allowed(p.id,w.collection_geography_id,w.user_id)))
  ), followup_base as (
    select ('followup:'||f.id::text) evidence_id,'case_follow_up'::text layer,f.id source_id,'case'::text source_kind,c.id source_context_id,
      f.project_id,p.title project_title,f.organization_id,coalesce(f.location_recorded_by,f.completed_by,f.updated_by) worker_id,a.full_name worker_name,
      c.geography_id geography_id,g.name geography_name,f.status source_status,
      'CASE-'||c.case_no::text||' · '||replace(f.followup_type,'_',' ') source_label,f.location_latitude latitude,f.location_longitude longitude,f.location_accuracy_m accuracy_m,
      coalesce(f.location_captured_at,f.completed_at,f.updated_at) captured_at,coalesce(f.location_received_at,f.updated_at) received_at,f.location_note note
    from public.beneficiary_case_followups f join public.beneficiary_cases c on c.id=f.case_id join public.survey_projects p on p.id=f.project_id
    join public.accounts a on a.id=coalesce(f.location_recorded_by,f.completed_by,f.updated_by) left join public.geographies g on g.id=c.geography_id
    where f.followup_type in ('field_visit','office_visit') and (f.location_permission_state is not null or f.status='completed')
      and (p_project is null or f.project_id=p_project) and coalesce(f.location_captured_at,f.completed_at,f.updated_at)::date between from_date and to_date
      and (
        (p_project is null and coalesce(f.location_recorded_by,f.completed_by,f.updated_by)=viewer)
        or (p_project is not null and (
          app_private.can_manage_project(f.project_id)
          or (app_private.project_staff_active(f.project_id,'area_focal_person') and app_private.can_review_project_area(f.project_id,c.geography_id))
          or (coalesce(f.location_recorded_by,f.completed_by,f.updated_by)=viewer and (f.location_recorded_by=viewer or app_private.case_delegate_active(c.id,viewer)))
        ))
      )
  ), base as (
    select * from survey_base union all select * from attendance_base union all select * from followup_base
  ), classified as (
    select b.*,
      app_private.location_quality(b.geography_id,b.latitude,b.longitude,b.accuracy_m,
        coalesce((select ap.max_accuracy_m from public.project_attendance_policies ap where ap.project_id=b.project_id),100)) quality,
      case
        when b.layer='survey' then array_remove(array[
          case when b.latitude is not null and not exists(
            select 1 from public.assignment_work_sessions s join public.work_assignments w on w.id=s.assignment_id
            where w.survey_project_id=b.project_id and w.user_id=b.worker_id and s.status in ('open','submitted','correction_required','approved')
              and b.captured_at between s.effective_check_in_at and coalesce(s.effective_check_out_at,now())
          ) then 'survey_outside_attendance_window' end
        ],null)::text[]
        when b.layer in ('attendance_check_in','attendance_check_out') and not exists(
          select 1 from survey_base sr where sr.project_id=b.project_id and sr.worker_id=b.worker_id and sr.captured_at::date=b.captured_at::date and sr.latitude is not null
        ) then array['attendance_without_field_activity']::text[]
        else '{}'::text[] end warning_codes
    from base b
  ), filtered as (
    select c.*,
      (c.quality<>'within_assigned_area' or cardinality(c.warning_codes)>0) review_required,
      case
        when c.source_kind='response' then app_private.can_read_project(c.project_id) and (c.worker_id=viewer or app_private.can_review_project_area(c.project_id,c.geography_id))
        when c.source_kind='attendance' then c.worker_id=viewer or app_private.can_manage_attendance_project(c.project_id)
        when c.source_kind='case' then app_private.can_manage_project(c.project_id) or app_private.case_delegate_active(c.source_context_id,viewer)
        else false
      end source_openable
    from classified c
    where (p_worker is null or c.worker_id=p_worker)
      and (p_geography is null or app_private.geo_contains(p_geography,c.geography_id))
      and (p_status is null or c.source_status=p_status)
      and (p_quality is null or c.quality=p_quality)
      and (p_layers is null or c.layer=any(p_layers))
      and (not coalesce(p_review_only,false) or c.quality<>'within_assigned_area' or cardinality(c.warning_codes)>0)
  ), cursor_rows as (
    select * from filtered f
    where p_cursor_at is null or (f.captured_at,f.evidence_id) < (p_cursor_at,p_cursor_id)
    order by captured_at desc,evidence_id desc
    limit page_size+1
  ), page_rows as (
    select * from cursor_rows order by captured_at desc,evidence_id desc limit page_size
  ), page_tail as (
    select captured_at,evidence_id from page_rows order by captured_at asc,evidence_id asc limit 1
  ), boundary_ids as (
    select distinct geography_id from page_rows where geography_id is not null
    union select p.geography_id from public.survey_projects p where p.id=p_project
  ), visible_boundaries as (
    select b.geography_id,g.name,g.kind,b.geometry,b.source_note,b.source_version,b.updated_at
    from public.geography_boundaries b join public.geographies g on g.id=b.geography_id join boundary_ids x on x.geography_id=b.geography_id
    where app_private.valid_boundary_geojson(b.geometry)
  )
  select jsonb_build_object(
    'scope',jsonb_build_object('project_id',p_project,'role',role_name,'from',from_date,'to',to_date,'personal',p_project is null),
    'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'id',evidence_id,'layer',layer,'source_id',source_id,'source_kind',source_kind,'source_context_id',source_context_id,'source_openable',source_openable,'source_label',source_label,
      'project_id',project_id,'project_title',project_title,'organization_id',organization_id,'worker_id',worker_id,'worker_name',worker_name,
      'geography_id',geography_id,'geography_name',geography_name,'status',source_status,'latitude',latitude,'longitude',longitude,'accuracy_m',accuracy_m,
      'captured_at',captured_at,'received_at',received_at,'note',note,'quality',quality,'warning_codes',to_jsonb(warning_codes),'review_required',review_required
    ) order by captured_at desc,evidence_id desc) from page_rows),'[]'::jsonb),
    'boundaries',coalesce((select jsonb_agg(jsonb_build_object('geography_id',geography_id,'name',name,'kind',kind,'geometry',geometry,'source_note',source_note,'source_version',source_version,'updated_at',updated_at) order by kind,name) from visible_boundaries),'[]'::jsonb),
    'summary',jsonb_build_object(
      'matched_total',(select count(*) from filtered),'plottable',(select count(*) from filtered where latitude is not null and longitude is not null),
      'within_assigned_area',(select count(*) from filtered where quality='within_assigned_area'),
      'outside_assigned_area',(select count(*) from filtered where quality='outside_assigned_area'),
      'poor_accuracy',(select count(*) from filtered where quality='poor_accuracy'),
      'location_unavailable',(select count(*) from filtered where quality='location_unavailable'),
      'unable_to_determine',(select count(*) from filtered where quality='unable_to_determine'),
      'needs_review',(select count(*) from filtered where review_required),
      'returned_count',(select count(*) from page_rows)
    ),
    'pagination',jsonb_build_object(
      'page_size',page_size,'returned',(select count(*) from page_rows),'has_more',(select count(*) from cursor_rows)>page_size,
      'next_cursor',case when (select count(*) from cursor_rows)>page_size then (select jsonb_build_object('captured_at',captured_at,'id',evidence_id) from page_tail) else null end
    ),
    'facets',jsonb_build_object(
      'workers',coalesce((select jsonb_agg(jsonb_build_object('id',worker_id,'name',worker_name) order by worker_name,worker_id) from (select distinct worker_id,worker_name from classified) w),'[]'::jsonb),
      'geographies',coalesce((select jsonb_agg(jsonb_build_object('id',geography_id,'name',geography_name) order by geography_name,geography_id) from (select distinct geography_id,geography_name from classified where geography_id is not null) g),'[]'::jsonb),
      'statuses',coalesce((select jsonb_agg(source_status order by source_status) from (select distinct source_status from classified where source_status is not null) s),'[]'::jsonb)
    ),
    'generated_at',now()
  ) into result;
  return result;
end;$$;

revoke all on function public.field_operations_map_page(uuid,date,date,uuid,uuid,text,text,text[],boolean,timestamptz,text,integer) from public,anon;
grant execute on function public.field_operations_map_page(uuid,date,date,uuid,uuid,text,text,text[],boolean,timestamptz,text,integer) to authenticated;
