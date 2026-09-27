-- FieldLance 2.40.1 — forward-only field evidence stabilization.
-- Existing revision history, table grants, RLS and attendance/finance models are preserved.

create or replace function app_private.valid_boundary_geojson(g jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare geom jsonb;poly jsonb;ring jsonb;point jsonb;
begin
  if g is null or jsonb_typeof(g) is distinct from 'object' then return false;end if;
  geom:=case when g->>'type'='Feature' then g->'geometry' else g end;
  if geom is null or jsonb_typeof(geom) is distinct from 'object' or coalesce(geom->>'type','') not in ('Polygon','MultiPolygon') or jsonb_typeof(geom->'coordinates') is distinct from 'array' then return false;end if;
  if octet_length(geom::text)>2000000 then return false;end if;
  if geom->>'type'='Polygon' then
    if jsonb_array_length(geom->'coordinates')<1 then return false;end if;
    for ring in select value from jsonb_array_elements(geom->'coordinates') loop
      if jsonb_typeof(ring) is distinct from 'array' or jsonb_array_length(ring)<4 then return false;end if;
      for point in select value from jsonb_array_elements(ring) loop
        if jsonb_typeof(point) is distinct from 'array' or jsonb_array_length(point)<2
          or jsonb_typeof(point->0) is distinct from 'number' or jsonb_typeof(point->1) is distinct from 'number'
          or abs((point->>0)::numeric)>180 or abs((point->>1)::numeric)>90 then return false;end if;
      end loop;
      if ring->0 <> ring->(jsonb_array_length(ring)-1) then return false;end if;
    end loop;
  else
    if jsonb_array_length(geom->'coordinates')<1 then return false;end if;
    for poly in select value from jsonb_array_elements(geom->'coordinates') loop
      if jsonb_typeof(poly) is distinct from 'array' or jsonb_array_length(poly)<1 then return false;end if;
      for ring in select value from jsonb_array_elements(poly) loop
        if jsonb_typeof(ring) is distinct from 'array' or jsonb_array_length(ring)<4 then return false;end if;
        for point in select value from jsonb_array_elements(ring) loop
          if jsonb_typeof(point) is distinct from 'array' or jsonb_array_length(point)<2
            or jsonb_typeof(point->0) is distinct from 'number' or jsonb_typeof(point->1) is distinct from 'number'
            or abs((point->>0)::numeric)>180 or abs((point->>1)::numeric)>90 then return false;end if;
        end loop;
        if ring->0 <> ring->(jsonb_array_length(ring)-1) then return false;end if;
      end loop;
    end loop;
  end if;
  return true;
end;$$;

create or replace function app_private.geography_boundary_contains(p_geography uuid,p_lat numeric,p_lon numeric)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare geom jsonb;
begin
  if p_geography is null or p_lat is null or p_lon is null then return null;end if;
  select geometry into geom from public.geography_boundaries where geography_id=p_geography;
  if not found or not app_private.valid_boundary_geojson(geom) then return null;end if;
  return app_private.geometry_contains_point(geom,p_lat,p_lon);
end;$$;

-- New clients submit the follow-up version. One initial capture is allowed; recapture is
-- deliberately not an implicit overwrite. Revisions retain the complete location snapshot.
create function public.record_beneficiary_case_followup_location_versioned(
  p_id uuid,p_latitude numeric,p_longitude numeric,p_accuracy_m numeric,p_permission_state text,p_note text,p_captured_at timestamptz,p_request_id uuid,p_version integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.beneficiary_case_followups;note_value text:=nullif(trim(coalesce(p_note,'')),'');
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  if p_request_id is null then raise exception 'Location request id required';end if;
  select * into f from public.beneficiary_case_followups where id=p_id for update;
  if not found or not app_private.can_operate_beneficiary_case(f.case_id) then raise exception 'Assigned beneficiary case access required';end if;
  if f.location_request_id=p_request_id then
    if f.location_recorded_by is distinct from auth.uid()
      or f.location_latitude is distinct from p_latitude or f.location_longitude is distinct from p_longitude
      or f.location_accuracy_m is distinct from p_accuracy_m or f.location_permission_state is distinct from p_permission_state
      or f.location_note is distinct from note_value or f.location_captured_at is distinct from p_captured_at
    then raise exception 'Location request id reused with different actor or evidence';end if;
    return jsonb_build_object('id',f.id,'version',f.version,'captured_at',f.location_captured_at,'received_at',f.location_received_at,'permission_state',f.location_permission_state,'accuracy_m',f.location_accuracy_m);
  end if;
  if f.location_permission_state is not null or f.location_request_id is not null then raise exception 'Location evidence already recorded; reload the follow-up';end if;
  if p_version is null or f.version is distinct from p_version then raise exception 'Follow-up changed; reload before recording location';end if;
  if f.followup_type not in ('field_visit','office_visit') then raise exception 'Location evidence is only valid for visit follow-ups';end if;
  if f.status<>'scheduled' then raise exception 'Capture visit location before completing the follow-up';end if;
  if coalesce(p_permission_state,'') not in ('granted','denied','unavailable') then raise exception 'Valid location permission state required';end if;
  if length(coalesce(note_value,''))>500 then raise exception 'Location note is too long';end if;
  if p_captured_at is not null and (not isfinite(p_captured_at) or p_captured_at>now()+interval '5 minutes') then raise exception 'Valid location capture time required';end if;
  if p_permission_state='granted' then
    if p_latitude is null or p_longitude is null or p_accuracy_m is null or p_captured_at is null
      or abs(p_latitude)>90 or abs(p_longitude)>180 or p_accuracy_m not between 0 and 100000
    then raise exception 'Valid visit coordinates, accuracy and captured time required';end if;
  else
    if p_latitude is not null or p_longitude is not null or p_accuracy_m is not null or length(coalesce(note_value,''))<5 then raise exception 'Location unavailable reason required without coordinates';end if;
  end if;
  if exists(select 1 from public.beneficiary_case_followups where location_request_id=p_request_id) then raise exception 'Location request id already used';end if;
  update public.beneficiary_case_followups set
    location_latitude=p_latitude,location_longitude=p_longitude,location_accuracy_m=p_accuracy_m,
    location_permission_state=p_permission_state,location_note=note_value,location_captured_at=p_captured_at,
    location_received_at=now(),location_request_id=p_request_id,location_recorded_by=auth.uid(),
    updated_by=auth.uid(),updated_at=now(),version=version+1,last_reason='Explicit visit location evidence recorded'
  where id=p_id returning * into f;
  insert into public.audit_events(actor_id,organization_id,action,detail)
    values(auth.uid(),f.organization_id,'case_followup_location_recorded',jsonb_build_object('followup_id',f.id,'case_id',f.case_id,'version',f.version,'permission_state',p_permission_state,'has_coordinates',p_latitude is not null,'accuracy_m',p_accuracy_m));
  return jsonb_build_object('id',f.id,'version',f.version,'captured_at',f.location_captured_at,'received_at',f.location_received_at,'permission_state',f.location_permission_state,'accuracy_m',f.location_accuracy_m);
end;$$;

-- Compatibility endpoint: existing clients retain their call shape, but use the same
-- authorization, immutable-capture, retry and revision rules as version-aware clients.
create or replace function public.record_beneficiary_case_followup_location(
  p_id uuid,p_latitude numeric,p_longitude numeric,p_accuracy_m numeric,p_permission_state text,p_note text,p_captured_at timestamptz,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_version integer;
begin
  if not app_private.is_active() then raise exception 'Active account required';end if;
  select version into current_version from public.beneficiary_case_followups where id=p_id;
  return public.record_beneficiary_case_followup_location_versioned(p_id,p_latitude,p_longitude,p_accuracy_m,p_permission_state,p_note,p_captured_at,p_request_id,current_version);
end;$$;
revoke all on function public.record_beneficiary_case_followup_location_versioned(uuid,numeric,numeric,numeric,text,text,timestamptz,uuid,integer) from public,anon;
grant execute on function public.record_beneficiary_case_followup_location_versioned(uuid,numeric,numeric,numeric,text,text,timestamptz,uuid,integer) to authenticated;

create or replace function public.my_delegated_case_detail(p_case uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.beneficiary_cases; result jsonb;
begin
  select * into c from public.beneficiary_cases where id=p_case;
  if not found or not app_private.case_delegate_active(p_case,auth.uid()) then raise exception 'Assigned beneficiary case access required';end if;

  select jsonb_build_object(
    'case',jsonb_build_object('id',c.id,'case_no',c.case_no,'title',c.title,'summary',c.summary,'priority',c.priority,'status',c.status,'follow_up_on',c.follow_up_on,'geography_id',c.geography_id,'version',c.version),
    'person',(select jsonb_build_object('id',p.id,'registry_no',p.registry_no,'full_name',p.full_name) from public.registry_persons p where p.id=c.person_id),
    'project',(select jsonb_build_object('id',p.id,'title',p.title) from public.survey_projects p where p.id=c.project_id),
    'organization',(select jsonb_build_object('id',o.id,'name',o.name) from public.organizations o where o.id=c.organization_id),
    'geography',(select jsonb_build_object('id',g.id,'name',g.name,'kind',g.kind) from public.geographies g where g.id=c.geography_id),
    'assignment',(select jsonb_build_object('id',a.id,'owner_role',a.owner_role,'assigned_at',a.assigned_at) from public.beneficiary_case_assignments a where a.case_id=c.id and a.user_id=auth.uid() and a.status='active' order by a.assigned_at desc limit 1),
    'needs',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'category',n.category,'description',n.description,'priority',n.priority,'status',n.status,'follow_up_on',n.follow_up_on) order by case n.priority when 'high' then 0 when 'medium' then 1 else 2 end,n.created_at,n.id) from public.beneficiary_needs n join public.beneficiary_case_needs l on l.need_id=n.id where l.case_id=c.id and l.active),'[]'::jsonb),
    'followups',coalesce((select jsonb_agg(jsonb_build_object(
      'id',f.id,'parent_followup_id',f.parent_followup_id,'need_id',f.need_id,'followup_type',f.followup_type,'due_on',f.due_on,'status',f.status,
      'outcome_status',f.outcome_status,'observations',f.observations,'beneficiary_feedback',f.beneficiary_feedback,'next_action',f.next_action,'next_follow_up_on',f.next_follow_up_on,
      'last_reason',f.last_reason,'version',f.version,'created_at',f.created_at,'completed_at',f.completed_at,'cancellation_reason',f.cancellation_reason,
      'location_latitude',f.location_latitude,'location_longitude',f.location_longitude,'location_accuracy_m',f.location_accuracy_m,
      'location_permission_state',f.location_permission_state,'location_note',f.location_note,'location_captured_at',f.location_captured_at,
      'location_received_at',f.location_received_at,'location_recorded_by',f.location_recorded_by
    ) order by case when f.status='scheduled' then 0 else 1 end,f.due_on,f.id) from public.beneficiary_case_followups f where f.case_id=c.id),'[]'::jsonb)
  ) into result;
  return result;
end;$$;
