create or replace function app_private.recruitment_profile_snapshot(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
 select jsonb_strip_nulls(
   jsonb_build_object(
     'full_name',
       coalesce(
         nullif(trim(a.full_name),''),
         nullif(trim(v.details->>'full_name'),''),
         ''
       ),
     'phone',v.details->>'phone',
     'area',v.details->>'area',
     'education',v.details->>'education',
     'skills',v.details->>'skills',
     'languages',v.details->>'languages',
     'experience',v.details->>'experience',
     'availability',v.details->>'availability',
     'preference',v.details->>'preference',
     'transport',v.details->>'transport',
     'smartphone',v.details->>'smartphone',
     'preferred_areas',v.details->>'preferred_areas',
     'bio',v.details->>'bio',
     'geography_id',v.geography_id,
     'profile_publication_status',
       case when v.status='verified' then 'active' else v.status end,
     'profile_version',v.version
   )
 )
 from public.volunteer_profiles v
 join public.accounts a on a.id=v.user_id
 where v.user_id=p_user;
$$;

revoke all on function app_private.recruitment_profile_snapshot(uuid)
from public, anon, authenticated;
