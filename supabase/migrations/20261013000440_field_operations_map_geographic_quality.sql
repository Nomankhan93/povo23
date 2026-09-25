-- FieldLance 2.40.0 — Field Operations Map & Geographic Quality
-- Adds provider-independent operational map evidence and review-only geographic quality signals.
-- No continuous/background tracking is introduced. Existing survey/attendance/case evidence remains authoritative.

create table public.geography_boundaries (
  geography_id uuid primary key references public.geographies(id) on delete cascade,
  geometry jsonb not null,
  source_note text not null,
  source_version text not null default '',
  created_by uuid not null references public.accounts(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references public.accounts(id),
  updated_at timestamptz not null default now(),
  check(length(trim(source_note)) between 3 and 1000),
  check(length(source_version) <= 120)
);

create table public.geography_boundary_revisions (
  id bigint generated always as identity primary key,
  geography_id uuid not null references public.geographies(id),
  revision_kind text not null check(revision_kind in ('superseded','removed')),
  geometry jsonb not null,
  source_note text not null,
  source_version text not null default '',
  actor_id uuid not null references public.accounts(id),
  recorded_at timestamptz not null default now()
);
create index geography_boundary_revisions_area on public.geography_boundary_revisions(geography_id,recorded_at desc,id desc);

alter table public.beneficiary_case_followups
  add column location_latitude numeric,
  add column location_longitude numeric,
  add column location_accuracy_m numeric,
  add column location_permission_state text,
  add column location_note text,
  add column location_captured_at timestamptz,
  add column location_received_at timestamptz,
  add column location_request_id uuid unique,
  add column location_recorded_by uuid references public.accounts(id),
  add constraint beneficiary_case_followup_location_values check(
    (location_latitude is null or abs(location_latitude) <= 90)
    and (location_longitude is null or abs(location_longitude) <= 180)
    and (location_accuracy_m is null or location_accuracy_m between 0 and 100000)
    and (location_permission_state is null or location_permission_state in ('granted','denied','unavailable'))
    and (location_note is null or length(location_note) <= 500)
    and (
      (location_latitude is null and location_longitude is null)
      or (location_latitude is not null and location_longitude is not null and location_accuracy_m is not null and location_captured_at is not null)
    )
  );

create index beneficiary_case_followups_location_map
  on public.beneficiary_case_followups(project_id,location_captured_at,id)
  where location_captured_at is not null or location_permission_state in ('denied','unavailable');

create function app_private.valid_boundary_geojson(g jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare geom jsonb;poly jsonb;ring jsonb;point jsonb;
begin
  if g is null or jsonb_typeof(g) <> 'object' then return false;end if;
  geom:=case when g->>'type'='Feature' then g->'geometry' else g end;
  if geom is null or jsonb_typeof(geom)<>'object' or geom->>'type' not in ('Polygon','MultiPolygon') or jsonb_typeof(geom->'coordinates')<>'array' then return false;end if;
  if octet_length(geom::text)>2000000 then return false;end if;
  if geom->>'type'='Polygon' then
    if jsonb_array_length(geom->'coordinates')<1 then return false;end if;
    for ring in select value from jsonb_array_elements(geom->'coordinates') loop
      if jsonb_typeof(ring)<>'array' or jsonb_array_length(ring)<4 then return false;end if;
      for point in select value from jsonb_array_elements(ring) loop
        if jsonb_typeof(point)<>'array' or jsonb_array_length(point)<2
          or jsonb_typeof(point->0)<>'number' or jsonb_typeof(point->1)<>'number'
          or abs((point->>0)::numeric)>180 or abs((point->>1)::numeric)>90 then return false;end if;
      end loop;
      if ring->0 <> ring->(jsonb_array_length(ring)-1) then return false;end if;
    end loop;
  else
    if jsonb_array_length(geom->'coordinates')<1 then return false;end if;
    for poly in select value from jsonb_array_elements(geom->'coordinates') loop
      if jsonb_typeof(poly)<>'array' or jsonb_array_length(poly)<1 then return false;end if;
      for ring in select value from jsonb_array_elements(poly) loop
        if jsonb_typeof(ring)<>'array' or jsonb_array_length(ring)<4 then return false;end if;
        for point in select value from jsonb_array_elements(ring) loop
          if jsonb_typeof(point)<>'array' or jsonb_array_length(point)<2
            or jsonb_typeof(point->0)<>'number' or jsonb_typeof(point->1)<>'number'
            or abs((point->>0)::numeric)>180 or abs((point->>1)::numeric)>90 then return false;end if;
        end loop;
        if ring->0 <> ring->(jsonb_array_length(ring)-1) then return false;end if;
      end loop;
    end loop;
  end if;
  return true;
end;$$;

create function app_private.boundary_geometry(g jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select case when g->>'type'='Feature' then g->'geometry' else g end;
$$;

create function app_private.try_timestamptz(p_value text)
returns timestamptz language plpgsql stable set search_path='' as $$
begin
  if nullif(trim(coalesce(p_value,'')),'') is null then return null;end if;
  return p_value::timestamptz;
exception when others then return null;
end;$$;

-- Standard ray-casting against one linear ring. GeoJSON coordinates are [longitude, latitude].
create function app_private.ring_contains_point(ring jsonb,p_lat numeric,p_lon numeric)
returns boolean language plpgsql immutable set search_path='' as $$
declare n int;i int;j int;xi numeric;yi numeric;xj numeric;yj numeric;inside boolean:=false;intersects boolean;
begin
  if ring is null or jsonb_typeof(ring)<>'array' then return false;end if;
  n:=jsonb_array_length(ring);if n<4 then return false;end if;
  j:=n-1;
  for i in 0..n-1 loop
    xi:=(ring->i->>0)::numeric;yi:=(ring->i->>1)::numeric;
    xj:=(ring->j->>0)::numeric;yj:=(ring->j->>1)::numeric;
    intersects:=((yi>p_lat)<>(yj>p_lat)) and (p_lon < (xj-xi)*(p_lat-yi)/nullif(yj-yi,0)+xi);
    if intersects then inside:=not inside;end if;
    j:=i;
  end loop;
  return inside;
end;$$;

create function app_private.polygon_contains_point(poly jsonb,p_lat numeric,p_lon numeric)
returns boolean language plpgsql immutable set search_path='' as $$
declare ring jsonb;ordinal bigint;
begin
  if poly is null or jsonb_typeof(poly)<>'array' or jsonb_array_length(poly)<1 then return false;end if;
  if not app_private.ring_contains_point(poly->0,p_lat,p_lon) then return false;end if;
  for ring,ordinal in select value,ord from jsonb_array_elements(poly) with ordinality x(value,ord) where ord>1 loop
    if app_private.ring_contains_point(ring,p_lat,p_lon) then return false;end if;
  end loop;
  return true;
end;$$;

create function app_private.geometry_contains_point(geom jsonb,p_lat numeric,p_lon numeric)
returns boolean language plpgsql immutable set search_path='' as $$
declare poly jsonb;
begin
  if geom->>'type'='Polygon' then return app_private.polygon_contains_point(geom->'coordinates',p_lat,p_lon);end if;
  if geom->>'type'='MultiPolygon' then
    for poly in select value from jsonb_array_elements(geom->'coordinates') loop
      if app_private.polygon_contains_point(poly,p_lat,p_lon) then return true;end if;
    end loop;
  end if;
  return false;
end;$$;

create function app_private.geography_boundary_contains(p_geography uuid,p_lat numeric,p_lon numeric)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare geom jsonb;
begin
  if p_geography is null or p_lat is null or p_lon is null then return null;end if;
  select geometry into geom from public.geography_boundaries where geography_id=p_geography;
  if not found then return null;end if;
  return app_private.geometry_contains_point(geom,p_lat,p_lon);
end;$$;

create function app_private.location_quality(p_geography uuid,p_lat numeric,p_lon numeric,p_accuracy numeric,p_accuracy_limit numeric default 100)
returns text language plpgsql stable security definer set search_path='' as $$
declare contained boolean;
begin
  if p_lat is null or p_lon is null then return 'location_unavailable';end if;
  if p_accuracy is not null and p_accuracy>coalesce(p_accuracy_limit,100) then return 'poor_accuracy';end if;
  contained:=app_private.geography_boundary_contains(p_geography,p_lat,p_lon);
  if contained is null then return 'unable_to_determine';end if;
  if contained then return 'within_assigned_area';end if;
  return 'outside_assigned_area';
end;$$;

create function public.save_geography_boundary(p_geography uuid,p_geojson jsonb,p_source text,p_source_version text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare geom jsonb;row public.geography_boundaries;
begin
  if not app_private.is_admin() then raise exception 'FieldLance admin access required';end if;
  if not exists(select 1 from public.geographies where id=p_geography) then raise exception 'Geography not found';end if;
  if not app_private.valid_boundary_geojson(p_geojson) then raise exception 'Valid Polygon or MultiPolygon GeoJSON required';end if;
  if length(trim(coalesce(p_source,''))) not between 3 and 1000 or length(coalesce(p_source_version,''))>120 then raise exception 'Boundary source reference required';end if;
  geom:=app_private.boundary_geometry(p_geojson);
  insert into public.geography_boundary_revisions(geography_id,revision_kind,geometry,source_note,source_version,actor_id)
    select geography_id,'superseded',geometry,source_note,source_version,auth.uid() from public.geography_boundaries where geography_id=p_geography;
  insert into public.geography_boundaries(geography_id,geometry,source_note,source_version,created_by,updated_by)
  values(p_geography,geom,trim(p_source),trim(coalesce(p_source_version,'')),auth.uid(),auth.uid())
  on conflict(geography_id) do update set geometry=excluded.geometry,source_note=excluded.source_note,source_version=excluded.source_version,updated_by=auth.uid(),updated_at=now()
  returning * into row;
  insert into public.audit_events(actor_id,action,detail) values(auth.uid(),'geography_boundary_saved',jsonb_build_object('geography_id',p_geography,'source',row.source_note,'source_version',row.source_version));
  return jsonb_build_object('geography_id',row.geography_id,'source_note',row.source_note,'source_version',row.source_version,'updated_at',row.updated_at);
end;$$;

create function public.remove_geography_boundary(p_geography uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not app_private.is_admin() then raise exception 'FieldLance admin access required';end if;
  if length(trim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'Removal reason required';end if;
  insert into public.geography_boundary_revisions(geography_id,revision_kind,geometry,source_note,source_version,actor_id)
    select geography_id,'removed',geometry,source_note,source_version,auth.uid() from public.geography_boundaries where geography_id=p_geography;
  if not found then raise exception 'Boundary not found';end if;
  delete from public.geography_boundaries where geography_id=p_geography;
  insert into public.audit_events(actor_id,action,detail) values(auth.uid(),'geography_boundary_removed',jsonb_build_object('geography_id',p_geography,'reason',trim(p_reason)));
end;$$;

create function public.geography_boundary_catalog(p_geography uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not app_private.is_admin() then raise exception 'FieldLance admin access required';end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'geography_id',b.geography_id,'name',g.name,'kind',g.kind,'code',g.code,'geometry',b.geometry,
    'source_note',b.source_note,'source_version',b.source_version,'updated_at',b.updated_at
  ) order by g.kind,g.name),'[]'::jsonb) into result
  from public.geography_boundaries b join public.geographies g on g.id=b.geography_id
  where p_geography is null or b.geography_id=p_geography;
  return result;
end;$$;

create function public.record_beneficiary_case_followup_location(
  p_id uuid,p_latitude numeric,p_longitude numeric,p_accuracy_m numeric,p_permission_state text,p_note text,p_captured_at timestamptz,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.beneficiary_case_followups;existing public.beneficiary_case_followups;
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  if p_request_id is null then raise exception 'Location request id required';end if;
  select * into existing from public.beneficiary_case_followups where location_request_id=p_request_id;
  if found then
    if existing.id<>p_id then raise exception 'Location request id already used';end if;
    return jsonb_build_object('id',existing.id,'captured_at',existing.location_captured_at,'permission_state',existing.location_permission_state);
  end if;
  select * into f from public.beneficiary_case_followups where id=p_id for update;
  if not found or not app_private.can_operate_beneficiary_case(f.case_id) then raise exception 'Assigned beneficiary case access required';end if;
  if f.followup_type not in ('field_visit','office_visit') then raise exception 'Location evidence is only valid for visit follow-ups';end if;
  if f.status<>'scheduled' then raise exception 'Capture visit location before completing the follow-up';end if;
  if p_permission_state not in ('granted','denied','unavailable') then raise exception 'Valid location permission state required';end if;
  if p_permission_state='granted' then
    if p_latitude is null or p_longitude is null or p_accuracy_m is null or p_captured_at is null or abs(p_latitude)>90 or abs(p_longitude)>180 or p_accuracy_m not between 0 and 100000 then raise exception 'Valid visit coordinates, accuracy and captured time required';end if;
  else
    if p_latitude is not null or p_longitude is not null or p_accuracy_m is not null or length(trim(coalesce(p_note,'')))<5 then raise exception 'Location unavailable reason required without coordinates';end if;
  end if;
  update public.beneficiary_case_followups set
    location_latitude=p_latitude,location_longitude=p_longitude,location_accuracy_m=p_accuracy_m,
    location_permission_state=p_permission_state,location_note=nullif(trim(coalesce(p_note,'')),''),
    location_captured_at=p_captured_at,location_received_at=now(),location_request_id=p_request_id,location_recorded_by=auth.uid(),updated_by=auth.uid(),updated_at=now()
  where id=p_id returning * into f;
  insert into public.audit_events(actor_id,organization_id,action,detail)
    values(auth.uid(),f.organization_id,'case_followup_location_recorded',jsonb_build_object('followup_id',f.id,'case_id',f.case_id,'permission_state',p_permission_state,'has_coordinates',p_latitude is not null,'accuracy_m',p_accuracy_m));
  return jsonb_build_object('id',f.id,'captured_at',f.location_captured_at,'received_at',f.location_received_at,'permission_state',f.location_permission_state,'accuracy_m',f.location_accuracy_m);
end;$$;

create function app_private.map_evidence_allowed(p_project uuid,p_geography uuid,p_worker uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select app_private.is_active() and (
    app_private.can_manage_project(p_project)
    or (app_private.project_staff_active(p_project,'area_focal_person') and app_private.can_review_project_area(p_project,p_geography))
    or p_worker=auth.uid()
  );
$$;

create function public.field_operations_map(
  p_project uuid default null,p_from date default null,p_to date default null,p_worker uuid default null,p_geography uuid default null,p_limit integer default 2000
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  viewer uuid:=auth.uid();from_date date:=coalesce(p_from,current_date-30);to_date date:=coalesce(p_to,current_date);
  lim integer:=least(greatest(coalesce(p_limit,2000),1),5000);role_name text:='personal';result jsonb;
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  if from_date>to_date or to_date-from_date>366 then raise exception 'Map date range must be between 1 and 367 days';end if;
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
    select ('survey:'||r.id::text||':'||(q->>'id')) evidence_id,'survey'::text layer,r.id source_id,p.id project_id,p.title project_title,p.organization_id,
      r.collector_id worker_id,a.full_name worker_name,r.collection_geography_id geography_id,g.name geography_name,r.status source_status,
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
      and (p_worker is null or r.collector_id=p_worker)
      and (p_geography is null or app_private.geo_contains(p_geography,r.collection_geography_id))
      and ((p_project is null and r.collector_id=viewer) or (p_project is not null and app_private.map_evidence_allowed(p.id,r.collection_geography_id,r.collector_id)))
  ), attendance_base as (
    select ('attendance:'||l.id::text) evidence_id,case l.event_type when 'check_in' then 'attendance_check_in' else 'attendance_check_out' end layer,l.id source_id,
      w.survey_project_id project_id,p.title project_title,p.organization_id,w.user_id worker_id,a.full_name worker_name,w.collection_geography_id geography_id,g.name geography_name,s.status source_status,
      case l.event_type when 'check_in' then 'Attendance check-in' else 'Attendance check-out' end source_label,l.latitude,l.longitude,l.accuracy_m,l.captured_at,l.received_at,l.note
    from public.assignment_session_locations l join public.assignment_work_sessions s on s.id=l.session_id join public.work_assignments w on w.id=s.assignment_id
    join public.survey_projects p on p.id=w.survey_project_id join public.accounts a on a.id=w.user_id left join public.geographies g on g.id=w.collection_geography_id
    where (p_project is null or p.id=p_project) and l.captured_at::date between from_date and to_date
      and (p_worker is null or w.user_id=p_worker) and (p_geography is null or app_private.geo_contains(p_geography,w.collection_geography_id))
      and ((p_project is null and w.user_id=viewer) or (p_project is not null and app_private.map_evidence_allowed(p.id,w.collection_geography_id,w.user_id)))
  ), followup_base as (
    select ('followup:'||f.id::text) evidence_id,'case_follow_up'::text layer,f.id source_id,f.project_id,p.title project_title,f.organization_id,
      coalesce(f.location_recorded_by,f.completed_by,f.updated_by) worker_id,a.full_name worker_name,c.geography_id geography_id,g.name geography_name,f.status source_status,
      'CASE-'||c.case_no::text||' · '||replace(f.followup_type,'_',' ') source_label,f.location_latitude latitude,f.location_longitude longitude,f.location_accuracy_m accuracy_m,
      coalesce(f.location_captured_at,f.completed_at,f.updated_at) captured_at,coalesce(f.location_received_at,f.updated_at) received_at,f.location_note note
    from public.beneficiary_case_followups f join public.beneficiary_cases c on c.id=f.case_id join public.survey_projects p on p.id=f.project_id
    join public.accounts a on a.id=coalesce(f.location_recorded_by,f.completed_by,f.updated_by) left join public.geographies g on g.id=c.geography_id
    where f.followup_type in ('field_visit','office_visit') and (f.location_permission_state is not null or f.status='completed')
      and (p_project is null or f.project_id=p_project) and coalesce(f.location_captured_at,f.completed_at,f.updated_at)::date between from_date and to_date
      and (p_worker is null or coalesce(f.location_recorded_by,f.completed_by,f.updated_by)=p_worker) and (p_geography is null or app_private.geo_contains(p_geography,c.geography_id))
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
  ), bounded as (
    select * from classified order by captured_at desc,evidence_id limit lim
  ), boundary_ids as (
    select distinct geography_id from bounded where geography_id is not null
    union select p.geography_id from public.survey_projects p where p.id=p_project
  ), visible_boundaries as (
    select b.geography_id,g.name,g.kind,b.geometry,b.source_note,b.source_version,b.updated_at
    from public.geography_boundaries b join public.geographies g on g.id=b.geography_id join boundary_ids x on x.geography_id=b.geography_id
  )
  select jsonb_build_object(
    'scope',jsonb_build_object('project_id',p_project,'role',role_name,'from',from_date,'to',to_date,'personal',p_project is null),
    'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'id',evidence_id,'layer',layer,'source_id',source_id,'source_label',source_label,'project_id',project_id,'project_title',project_title,'organization_id',organization_id,
      'worker_id',worker_id,'worker_name',worker_name,'geography_id',geography_id,'geography_name',geography_name,'status',source_status,
      'latitude',latitude,'longitude',longitude,'accuracy_m',accuracy_m,'captured_at',captured_at,'received_at',received_at,'note',note,'quality',quality,'warning_codes',to_jsonb(warning_codes)
    ) order by captured_at desc,evidence_id) from bounded),'[]'::jsonb),
    'boundaries',coalesce((select jsonb_agg(jsonb_build_object('geography_id',geography_id,'name',name,'kind',kind,'geometry',geometry,'source_note',source_note,'source_version',source_version,'updated_at',updated_at) order by kind,name) from visible_boundaries),'[]'::jsonb),
    'summary',jsonb_build_object(
      'total',(select count(*) from bounded),'plottable',(select count(*) from bounded where latitude is not null and longitude is not null),
      'within_assigned_area',(select count(*) from bounded where quality='within_assigned_area'),
      'outside_assigned_area',(select count(*) from bounded where quality='outside_assigned_area'),
      'poor_accuracy',(select count(*) from bounded where quality='poor_accuracy'),
      'location_unavailable',(select count(*) from bounded where quality='location_unavailable'),
      'unable_to_determine',(select count(*) from bounded where quality='unable_to_determine'),
      'warnings',(select count(*) from bounded where cardinality(warning_codes)>0)
    ),
    'workers',coalesce((select jsonb_agg(jsonb_build_object('id',worker_id,'name',worker_name) order by worker_name,worker_id) from (select distinct worker_id,worker_name from bounded) w),'[]'::jsonb),
    'geographies',coalesce((select jsonb_agg(jsonb_build_object('id',geography_id,'name',geography_name) order by geography_name,geography_id) from (select distinct geography_id,geography_name from bounded where geography_id is not null) g),'[]'::jsonb),
    'generated_at',now()
  ) into result;
  return result;
end;$$;

alter table public.geography_boundaries enable row level security;
alter table public.geography_boundary_revisions enable row level security;
-- Boundary geometry/history is intentionally not directly exposed. Authorized map/admin RPCs return scoped current copies.
revoke all on public.geography_boundaries,public.geography_boundary_revisions from public,anon,authenticated;
grant all on public.geography_boundaries,public.geography_boundary_revisions to service_role;

revoke all on function app_private.valid_boundary_geojson(jsonb),app_private.boundary_geometry(jsonb),app_private.try_timestamptz(text),app_private.ring_contains_point(jsonb,numeric,numeric),app_private.polygon_contains_point(jsonb,numeric,numeric),app_private.geometry_contains_point(jsonb,numeric,numeric),app_private.geography_boundary_contains(uuid,numeric,numeric),app_private.location_quality(uuid,numeric,numeric,numeric,numeric),app_private.map_evidence_allowed(uuid,uuid,uuid) from public,anon,authenticated;

revoke all on function public.save_geography_boundary(uuid,jsonb,text,text),public.remove_geography_boundary(uuid,text),public.geography_boundary_catalog(uuid),public.record_beneficiary_case_followup_location(uuid,numeric,numeric,numeric,text,text,timestamptz,uuid),public.field_operations_map(uuid,date,date,uuid,uuid,integer) from public,anon;
grant execute on function public.save_geography_boundary(uuid,jsonb,text,text),public.remove_geography_boundary(uuid,text),public.geography_boundary_catalog(uuid),public.record_beneficiary_case_followup_location(uuid,numeric,numeric,numeric,text,text,timestamptz,uuid),public.field_operations_map(uuid,date,date,uuid,uuid,integer) to authenticated;
