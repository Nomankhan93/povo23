-- POEM 2.16.1 follow-up
-- Restore volunteer opportunity-discovery semantics preserved since 2.12.5
-- while retaining 2.16.1 structured compensation snapshots.

create or replace function public.available_work_opportunities(
  p_page integer default 0,
  p_organization uuid default null,
  p_area uuid default null,
  p_payment text default null,
  p_skill text default '',
  p_work_date date default null,
  p_deadline date default null
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  result jsonb;
  details jsonb := '{}'::jsonb;
  profile_status text := 'missing';
begin
  if not app_private.is_active() then
    raise exception 'Active account required';
  end if;

  if p_page is null or p_page < 0 or p_page > 100000 then
    raise exception 'Invalid page';
  end if;

  if p_payment is not null and p_payment not in ('paid','unpaid') then
    raise exception 'Invalid payment filter';
  end if;

  if p_skill is null or length(p_skill) > 100 then
    raise exception 'Invalid skill filter';
  end if;

  select
    coalesce(v.details, '{}'::jsonb),
    v.status
  into
    details,
    profile_status
  from public.volunteer_profiles v
  where v.user_id = auth.uid();

  if not found then
    details := '{}'::jsonb;
    profile_status := 'missing';
  end if;

  with matched as materialized (
    select
      o.id,
      o.organization_id,
      o.title,
      o.description,
      o.geography_id,
      o.start_date,
      o.end_date,
      o.reply_by,
      o.payment_type,
      o.payment_note,
      o.status,
      o.survey_project_id,
      o.required_volunteers,
      o.required_skill,
      o.required_language,
      o.visibility,
      o.publication_state,
      o.applications_open,
      o.eligibility_note,
      o.created_at,

      -- POEM 2.16.1 structured compensation snapshot
      o.work_mode,
      o.compensation_type,
      o.currency,
      o.rate,
      o.compensation_note,
      o.compensation_snapshot_version,

      org.name as organization_name,
      p.title as project_title,
      a.status as application_status,
      i.status as invitation_status,

      (
        o.required_skill = ''
        or strpos(
          lower(coalesce(details->>'skills','')),
          lower(o.required_skill)
        ) > 0
      ) as skill_match,

      (
        o.required_language = ''
        or strpos(
          lower(coalesce(details->>'languages','')),
          lower(o.required_language)
        ) > 0
      ) as language_match,

      app_private.profile_in_area(
        auth.uid(),
        o.geography_id
      ) as area_match

    from public.work_opportunities o

    join public.organizations org
      on org.id = o.organization_id
     and org.status = 'active'

    join public.survey_projects p
      on p.id = o.survey_project_id
     and p.status = 'active'

    left join public.work_applications a
      on a.opportunity_id = o.id
     and a.user_id = auth.uid()
     and a.status in ('pending','shortlisted','selected')

    left join public.work_invitations i
      on i.opportunity_id = o.id
     and i.user_id = auth.uid()
     and i.status in ('pending','accepted')

    where app_private.work_opportunity_visible(
      o.id,
      auth.uid()
    )

      and (
        p_organization is null
        or o.organization_id = p_organization
      )

      and (
        p_payment is null
        or o.payment_type = p_payment
      )

      and (
        p_work_date is null
        or p_work_date between o.start_date and o.end_date
      )

      and (
        p_deadline is null
        or (o.reply_by at time zone 'UTC')::date <= p_deadline
      )

      and (
        trim(p_skill) = ''
        or strpos(
          lower(o.required_skill),
          lower(trim(p_skill))
        ) > 0
        or strpos(
          lower(o.description),
          lower(trim(p_skill))
        ) > 0
      )

      and (
        p_area is null
        or exists (
          with recursive areas as (
            select id
            from public.geographies
            where id = p_area

            union all

            select g.id
            from public.geographies g
            join areas x
              on g.parent_id = x.id
          )
          select 1
          from areas
          where id = o.geography_id
        )
      )
  ),

  enriched as (
    select
      m.*,

      (
        profile_status = 'verified'
        and m.application_status is null
        and m.invitation_status is null
        and m.skill_match
        and m.language_match
      ) as can_apply,

      case
        when profile_status <> 'verified'
          then 'Publish an active volunteer profile before applying'

        when m.application_status is not null
          then 'Application already submitted'

        when m.invitation_status is not null
          then 'Respond to the existing invitation'

        when not m.skill_match
          then 'Required skill is not listed on your profile'

        when not m.language_match
          then 'Required language is not listed on your profile'

        when m.visibility = 'area'
             and not m.area_match
          then 'Work area is outside your current profile location; you may still apply if you can work there'

        else ''
      end as eligibility_reason

    from matched m
  ),

  batch as (
    select *
    from enriched
    order by start_date, created_at, id
    limit 50
    offset p_page * 50
  )

  select jsonb_build_object(
    'rows',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(b)
            order by start_date, created_at, id
          )
          from batch b
        ),
        '[]'::jsonb
      ),
    'total',
      (select count(*) from enriched),
    'page',
      p_page,
    'page_size',
      50
  )
  into result;

  return result;
end;
$$;
