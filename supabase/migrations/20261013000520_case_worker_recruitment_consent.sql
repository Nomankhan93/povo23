-- Field Worker case delegation is another field-operation path backed by survey assignments.
-- Preserve Area Focal authority and historical ownership records; recheck effective worker eligibility.
create or replace function app_private.case_owner_eligible(p_case uuid,p_user uuid,p_role text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1
    from public.beneficiary_cases c
    join public.survey_projects p on p.id=c.project_id
    join public.organizations o on o.id=c.organization_id
    join public.accounts a on a.id=p_user
    where c.id=p_case
      and c.status<>'closed'
      and p.status='active'
      and o.status='active'
      and a.status='active'
      and (
        (
          p_role='field_worker'
          and app_private.has_accepted_collection_assignment(c.project_id,p_user)
          and exists(
            select 1 from public.survey_assignments sa
            where sa.project_id=c.project_id
              and sa.user_id=p_user
              and sa.active
              and app_private.geo_contains(sa.collection_geography_id,c.geography_id)
          )
        )
        or
        (
          p_role='area_focal_person'
          and exists(
            select 1
            from public.project_staff_assignments s
            join public.organization_memberships m
              on m.organization_id=c.organization_id and m.user_id=s.user_id
            where s.project_id=c.project_id
              and s.user_id=p_user
              and s.role='area_focal_person'
              and s.status='active'
              and s.starts_at<=(now() at time zone 'UTC')::date
              and (s.ends_at is null or s.ends_at>=(now() at time zone 'UTC')::date)
              and m.status='active'
              and m.role in ('ngo_admin','member')
              and exists(
                select 1 from public.project_staff_areas x
                where x.assignment_id=s.id
                  and app_private.geo_contains(x.geography_id,c.geography_id)
              )
          )
        )
      )
  );
$$;

create or replace function public.beneficiary_case_assignment_candidates(p_case uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.beneficiary_cases; result jsonb;
begin
  select * into c from public.beneficiary_cases where id=p_case;
  if not found or not app_private.can_manage_project(c.project_id) then raise exception 'Beneficiary case management permission required';end if;

  with candidates as (
    select distinct a.id as user_id,a.full_name as name,'field_worker'::text owner_role,'Active Field Worker assignment'::text scope_label
    from public.survey_assignments sa
    join public.accounts a on a.id=sa.user_id and a.status='active'
    where sa.project_id=c.project_id and sa.active
      and app_private.has_accepted_collection_assignment(c.project_id,sa.user_id)
      and app_private.geo_contains(sa.collection_geography_id,c.geography_id)
    union all
    select distinct a.id,a.full_name,'area_focal_person'::text,'Area Focal for this case geography'::text
    from public.project_staff_assignments s
    join public.accounts a on a.id=s.user_id and a.status='active'
    join public.organization_memberships m on m.organization_id=c.organization_id and m.user_id=s.user_id and m.status='active' and m.role in ('ngo_admin','member')
    where s.project_id=c.project_id and s.role='area_focal_person' and s.status='active'
      and s.starts_at<=(now() at time zone 'UTC')::date
      and (s.ends_at is null or s.ends_at>=(now() at time zone 'UTC')::date)
      and exists(select 1 from public.project_staff_areas x where x.assignment_id=s.id and app_private.geo_contains(x.geography_id,c.geography_id))
  )
  select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'name',name,'owner_role',owner_role,'scope_label',scope_label) order by owner_role,name,user_id),'[]'::jsonb)
  into result from candidates;
  return result;
end;$$;

