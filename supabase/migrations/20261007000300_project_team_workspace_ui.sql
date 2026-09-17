-- POEM 2.14.1 — Project Team Management & Scoped Workspace UI support
-- Candidate lookup is intentionally RPC-only so NGO Admins can choose active
-- organization members without receiving broad public.accounts read access.

create function public.project_staff_candidates(p_project uuid,p_query text default '')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not app_private.can_manage_project_team(p_project) then
    raise exception 'NGO Admin or POEM survey management permission required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',x.user_id,
    'name',x.full_name,
    'email',x.email,
    'membership_role',x.membership_role
  ) order by coalesce(x.full_name,x.email),x.user_id),'[]'::jsonb)
  into result
  from (
    select a.id as user_id,a.full_name,a.email,m.role as membership_role
    from public.survey_projects p
    join public.organization_memberships m on m.organization_id=p.organization_id
    join public.accounts a on a.id=m.user_id
    where p.id=p_project
      and m.status='active'
      and m.role in ('member','ngo_admin')
      and a.status='active'
      and not exists(
        select 1 from public.project_staff_assignments s
        where s.project_id=p_project and s.user_id=a.id and s.status='active'
      )
      and (
        coalesce(trim(p_query),'')=''
        or coalesce(a.full_name,'') ilike '%'||replace(replace(trim(p_query),'%',''),'_','')||'%'
        or coalesce(a.email,'') ilike '%'||replace(replace(trim(p_query),'%',''),'_','')||'%'
      )
    order by coalesce(a.full_name,a.email),a.id
    limit 50
  ) x;

  return result;
end;$$;

grant execute on function public.project_staff_candidates(uuid,text) to authenticated;
