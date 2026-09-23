-- FieldLance 2.38.1 — Automatic Project Marketplace Publishing
-- Every materialized/published survey project receives one canonical current marketplace listing.
-- Permanent Organization profile sharing and Organization-first worker search are not prerequisites.

alter table public.work_opportunities
  add column marketplace_origin text not null default 'manual'
    check (marketplace_origin in ('manual','project_auto')),
  add column marketplace_current boolean not null default false;

create unique index work_opportunities_project_auto_current_unique
  on public.work_opportunities(survey_project_id)
  where survey_project_id is not null
    and marketplace_origin='project_auto'
    and marketplace_current;

create index work_opportunities_marketplace_origin
  on public.work_opportunities(marketplace_origin,marketplace_current,survey_project_id,created_at desc);

-- Canonical project listings stay project-wide and open to discovery for every active Field Worker.
-- The opportunity row still snapshots compensation so accepted work keeps immutable agreed terms.
create function app_private.ensure_project_marketplace_opportunity(
  p_project uuid,
  p_rollover boolean default false
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  p public.survey_projects;
  current_row public.work_opportunities;
  result uuid;
  effective_open boolean:=false;
  legacy_payment text;
  display_note text;
  deadline timestamptz;
begin
  select * into p
  from public.survey_projects
  where id=p_project
  for update;

  if not found then
    raise exception 'Survey project not found';
  end if;

  select * into current_row
  from public.work_opportunities
  where survey_project_id=p.id
    and marketplace_origin='project_auto'
    and marketplace_current
  order by created_at desc
  limit 1
  for update;

  if p_rollover and current_row.id is not null then
    update public.work_opportunities
    set marketplace_current=false,
        applications_open=false,
        status='closed',
        version=version+1
    where id=current_row.id;
    current_row.id:=null;
  end if;

  if p.status<>'active' then
    if current_row.id is not null then
      update public.work_opportunities
      set applications_open=false,status='closed',version=version+1
      where id=current_row.id
        and (applications_open or status<>'closed');
      return current_row.id;
    end if;
    return null;
  end if;

  if not app_private.valid_compensation_terms(
    p.work_mode,p.compensation_type,p.compensation_currency,p.compensation_rate
  ) then
    raise exception 'Valid project compensation defaults required for marketplace publication';
  end if;

  effective_open:=app_private.project_recruitment_effective_open(p.id);
  legacy_payment:=case when p.work_mode='paid' then 'paid' else 'unpaid' end;
  display_note:=case
    when p.work_mode='paid' then p.compensation_currency||' '||p.compensation_rate::text||' · '||replace(p.compensation_type,'_',' ')||' — '||p.compensation_note
    else p.compensation_note
  end;
  deadline:=((p.end_date+1)::timestamp at time zone 'UTC');

  if current_row.id is null then
    insert into public.work_opportunities(
      organization_id,title,description,geography_id,start_date,end_date,reply_by,
      payment_type,payment_note,status,created_by,survey_project_id,required_volunteers,
      required_skill,required_language,visibility,publication_state,applications_open,
      eligibility_note,published_at,work_mode,compensation_type,currency,rate,
      compensation_note,compensation_snapshot_version,marketplace_origin,marketplace_current
    ) values(
      p.organization_id,p.title,p.purpose,p.geography_id,p.start_date,p.end_date,deadline,
      legacy_payment,display_note,case when effective_open then 'open' else 'closed' end,
      coalesce(auth.uid(),p.created_by),p.id,coalesce(p.required_volunteers,1),'','',
      'all','published',effective_open,
      'Published project — open to all Field Workers. Apply if you are available for the project area and dates.',
      now(),p.work_mode,p.compensation_type,p.compensation_currency,p.compensation_rate,
      p.compensation_note,p.compensation_version,'project_auto',true
    ) returning id into result;

    insert into public.audit_events(actor_id,organization_id,action,detail)
    values(
      coalesce(auth.uid(),p.created_by),p.organization_id,'project_marketplace_auto_published',
      jsonb_build_object(
        'project',p.id,'opportunity',result,'visibility','all',
        'compensation_snapshot_version',p.compensation_version
      )
    );
    return result;
  end if;

  update public.work_opportunities
  set title=p.title,
      description=p.purpose,
      geography_id=p.geography_id,
      start_date=p.start_date,
      end_date=p.end_date,
      reply_by=deadline,
      required_volunteers=coalesce(p.required_volunteers,1),
      visibility='all',
      publication_state='published',
      applications_open=effective_open,
      status=case when effective_open then 'open' else 'closed' end,
      eligibility_note='Published project — open to all Field Workers. Apply if you are available for the project area and dates.',
      published_at=coalesce(published_at,now()),
      version=version+1
  where id=current_row.id
  returning id into result;

  return result;
end;
$$;

create function app_private.auto_publish_project_marketplace()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform app_private.ensure_project_marketplace_opportunity(new.id,false);
  return new;
end;
$$;

create trigger auto_publish_project_marketplace
after insert on public.survey_projects
for each row execute function app_private.auto_publish_project_marketplace();

create function app_private.sync_project_marketplace_state()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform app_private.ensure_project_marketplace_opportunity(
    new.id,
    new.compensation_version is distinct from old.compensation_version
  );
  return new;
end;
$$;

create trigger sync_project_marketplace_state
after update of status,title,purpose,geography_id,start_date,end_date,recruitment_status,required_volunteers,target,moderation_status,compensation_version
on public.survey_projects
for each row execute function app_private.sync_project_marketplace_state();

-- Automatic listings follow project recruitment controls. Old clients cannot separately close or
-- republish them and accidentally diverge the marketplace from project state.
create or replace function public.set_work_opportunity_state(p_id uuid,p_state text,p_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare o public.work_opportunities;
begin
 select * into o from public.work_opportunities where id=p_id for update;
 if not found or o.survey_project_id is null or not app_private.can_review_survey(o.survey_project_id) then raise exception 'Project recruitment management permission required';end if;
 if o.marketplace_origin='project_auto' then raise exception 'Automatic project marketplace listing follows the project recruitment plan';end if;
 if o.version is distinct from p_version then raise exception 'Opportunity changed. Reload.';end if;
 if p_state not in ('draft','published','closed') then raise exception 'Valid recruitment state required';end if;
 if p_state='published' then
  if o.status<>'open' then raise exception 'The underlying opportunity is closed';end if;
  if o.reply_by<=now() then raise exception 'Application deadline has expired';end if;
  if not exists(select 1 from public.survey_projects where id=o.survey_project_id and status='active') then raise exception 'Active survey project required';end if;
  update public.work_opportunities
  set publication_state='published',applications_open=true,published_at=coalesce(published_at,now()),version=version+1
  where id=p_id;
 elsif p_state='draft' then
  if exists(select 1 from public.work_applications where opportunity_id=p_id)
     or exists(select 1 from public.work_invitations where opportunity_id=p_id)
     or exists(select 1 from public.work_assignments where opportunity_id=p_id)
  then raise exception 'Recruitment with activity cannot return to draft; close applications instead';end if;
  update public.work_opportunities set publication_state='draft',applications_open=false,version=version+1 where id=p_id;
 else
  if not o.applications_open then return;end if;
  update public.work_opportunities set applications_open=false,version=version+1 where id=p_id;
 end if;
 insert into public.audit_events(actor_id,organization_id,action,detail)
 values(auth.uid(),o.organization_id,'recruitment_state_changed',jsonb_build_object('id',p_id,'state',p_state,'applications_open',p_state='published'));
end;$$;

-- Browsing returns one canonical current project listing. Legacy/manual public opportunities remain
-- historical/organization-side records once the project has an automatic current listing.
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
  if not app_private.is_active() then raise exception 'Active account required';end if;
  if p_page is null or p_page<0 or p_page>100000 then raise exception 'Invalid page';end if;
  if p_payment is not null and p_payment not in ('paid','unpaid') then raise exception 'Invalid payment filter';end if;
  if p_skill is null or length(p_skill)>100 then raise exception 'Invalid skill filter';end if;

  select coalesce(v.details,'{}'::jsonb),v.status into details,profile_status
  from public.volunteer_profiles v where v.user_id=auth.uid();
  if not found then details:='{}'::jsonb; profile_status:='missing';end if;

  with matched as materialized (
    select
      o.id,o.organization_id,o.title,o.description,o.geography_id,o.start_date,o.end_date,
      o.reply_by,o.payment_type,o.payment_note,o.status,o.survey_project_id,o.required_volunteers,
      o.required_skill,o.required_language,o.visibility,o.publication_state,o.applications_open,
      o.eligibility_note,o.created_at,o.work_mode,o.compensation_type,o.currency,o.rate,
      o.compensation_note,o.compensation_snapshot_version,o.marketplace_origin,o.marketplace_current,
      p.required_volunteers as project_required_volunteers,
      org.name as organization_name,p.title as project_title,
      a.status as application_status,i.status as invitation_status,
      (o.required_skill='' or strpos(lower(coalesce(details->>'skills','')),lower(o.required_skill))>0) as skill_match,
      (o.required_language='' or strpos(lower(coalesce(details->>'languages','')),lower(o.required_language))>0) as language_match,
      app_private.profile_in_area(auth.uid(),o.geography_id) as area_match
    from public.work_opportunities o
    join public.organizations org on org.id=o.organization_id and org.status='active'
    join public.survey_projects p on p.id=o.survey_project_id and p.status='active'
    left join lateral (
      select wa.status
      from public.work_applications wa
      where wa.survey_project_id=o.survey_project_id
        and wa.user_id=auth.uid()
        and wa.status in ('pending','shortlisted','selected')
      order by wa.updated_at desc,wa.created_at desc,wa.id desc
      limit 1
    ) a on true
    left join lateral (
      select wi.status
      from public.work_invitations wi
      join public.work_opportunities invited on invited.id=wi.opportunity_id
      where invited.survey_project_id=o.survey_project_id
        and wi.user_id=auth.uid()
        and wi.status in ('pending','accepted')
      order by wi.created_at desc,wi.id desc
      limit 1
    ) i on true
    where app_private.work_opportunity_visible(o.id,auth.uid())
      and (
        (o.marketplace_origin='project_auto' and o.marketplace_current)
        or not exists(
          select 1 from public.work_opportunities canonical
          where canonical.survey_project_id=o.survey_project_id
            and canonical.marketplace_origin='project_auto'
            and canonical.marketplace_current
        )
      )
      and (p_organization is null or o.organization_id=p_organization)
      and (p_payment is null or o.payment_type=p_payment)
      and (p_work_date is null or p_work_date between o.start_date and o.end_date)
      and (p_deadline is null or (o.reply_by at time zone 'UTC')::date<=p_deadline)
      and (
        trim(p_skill)=''
        or strpos(lower(o.required_skill),lower(trim(p_skill)))>0
        or strpos(lower(o.description),lower(trim(p_skill)))>0
      )
      and (
        p_area is null
        or exists(
          with recursive areas as (
            select id from public.geographies where id=p_area
            union all
            select g.id from public.geographies g join areas x on g.parent_id=x.id
          )
          select 1 from areas where id=o.geography_id
        )
      )
  ), enriched as (
    select m.*,
      (
        profile_status='verified'
        and m.application_status is null
        and m.invitation_status is null
        and m.skill_match
        and m.language_match
      ) as can_apply,
      case
        when profile_status<>'verified' then 'Publish an active volunteer profile before applying'
        when m.application_status is not null then 'An active application already exists for this project'
        when m.invitation_status is not null then 'Respond to the existing invitation'
        when not m.skill_match then 'Required skill is not listed on your profile'
        when not m.language_match then 'Required language is not listed on your profile'
        when m.visibility='area' and not m.area_match then 'Work area is outside your current profile location; you may still apply if you can work there'
        else ''
      end as eligibility_reason
    from matched m
  ), batch as (
    select * from enriched order by start_date,created_at,id limit 50 offset p_page*50
  )
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(to_jsonb(b) order by start_date,created_at,id) from batch b),'[]'::jsonb),
    'total',(select count(*) from enriched),'page',p_page,'page_size',50
  ) into result;
  return result;
end;$$;

-- Application consent remains application-scoped. Prevent duplicate live applications across
-- compensation-listing rollovers for the same project.
create or replace function public.apply_work_opportunity(
  p_opportunity uuid,p_availability text,p_note text,p_profile_share_consent boolean
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  o public.work_opportunities;
  p public.volunteer_profiles;
  existing public.work_applications;
  project_existing public.work_applications;
  new_id uuid;
  snapshot jsonb;
begin
 if not app_private.is_active() then raise exception 'Active account required';end if;
 select * into o from public.work_opportunities where id=p_opportunity for update;
 if not found or not app_private.work_opportunity_visible(o.id,auth.uid()) then raise exception 'Published recruitment with open applications required';end if;
 if not exists(select 1 from public.organizations where id=o.organization_id and status='active') or not exists(select 1 from public.survey_projects where id=o.survey_project_id and status='active') then raise exception 'Opportunity unavailable';end if;
 select * into p from public.volunteer_profiles where user_id=auth.uid();
 if not found or p.status<>'verified' then raise exception 'Publish an active volunteer profile before applying';end if;
 if exists(select 1 from public.work_invitations wi join public.work_opportunities invited on invited.id=wi.opportunity_id where invited.survey_project_id=o.survey_project_id and wi.user_id=auth.uid() and wi.status in ('pending','accepted')) then raise exception 'Respond to the existing project invitation instead of applying';end if;
 if o.required_skill<>'' and strpos(lower(coalesce(p.details->>'skills','')),lower(o.required_skill))=0 then raise exception 'Required skill is not listed on your profile';end if;
 if o.required_language<>'' and strpos(lower(coalesce(p.details->>'languages','')),lower(o.required_language))=0 then raise exception 'Required language is not listed on your profile';end if;
 if p_availability is null or length(trim(p_availability)) not between 3 and 1000 then raise exception 'Availability is required';end if;
 if p_note is null or length(p_note)>2000 then raise exception 'Application message is too long';end if;
 if p_profile_share_consent is distinct from true then raise exception 'Application-scoped profile snapshot consent is required';end if;

 select * into project_existing
 from public.work_applications
 where survey_project_id=o.survey_project_id
   and user_id=auth.uid()
   and status in ('pending','shortlisted','selected')
 order by updated_at desc,created_at desc
 limit 1
 for update;
 if found then raise exception 'An active application already exists for this project';end if;

 select * into existing from public.work_applications where opportunity_id=o.id and user_id=auth.uid() for update;
 snapshot:=app_private.recruitment_profile_snapshot(auth.uid());
 if snapshot is null then raise exception 'Volunteer profile unavailable';end if;
 if found then
  update public.work_applications
  set status='pending',note=trim(p_note),availability=trim(p_availability),profile_share_consent=true,
      consent_version='recruitment-profile-v1',profile_snapshot=snapshot,review_note='',reviewed_by=null,reviewed_at=null,
      withdrawn_at=null,updated_at=now(),version=version+1
  where id=existing.id returning id into new_id;
 else
  insert into public.work_applications(
    opportunity_id,organization_id,survey_project_id,user_id,volunteer_name,organization_name,
    project_title,opportunity_title,note,availability,profile_share_consent,consent_version,profile_snapshot
  ) values(
    o.id,o.organization_id,o.survey_project_id,auth.uid(),coalesce(snapshot->>'full_name',''),
    (select name from public.organizations where id=o.organization_id),
    (select title from public.survey_projects where id=o.survey_project_id),o.title,
    trim(p_note),trim(p_availability),true,'recruitment-profile-v1',snapshot
  ) returning id into new_id;
 end if;
 insert into public.notifications(user_id,title,body)
 select m.user_id,'New Field Worker application','A Field Worker applied for a published project. Open Workforce marketplace to review it.'
 from public.organization_memberships m join public.accounts a on a.id=m.user_id
 where m.organization_id=o.organization_id and m.role='ngo_admin' and m.status='active' and a.status='active' and m.user_id<>auth.uid();
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
 values(auth.uid(),auth.uid(),o.organization_id,'work_application_submitted',jsonb_build_object('id',new_id,'opportunity',o.id,'project',o.survey_project_id,'consent_version','recruitment-profile-v1'));
 return new_id;
end;$$;

-- Backfill one canonical automatic listing for every currently active project. Existing manual
-- opportunities/applications remain historical and fully reviewable; discovery prefers this project listing.
do $$
declare r record;
begin
  for r in select id from public.survey_projects where status='active' order by created_at,id loop
    perform app_private.ensure_project_marketplace_opportunity(r.id,false);
  end loop;
end;
$$;

revoke all on function app_private.ensure_project_marketplace_opportunity(uuid,boolean),
  app_private.auto_publish_project_marketplace(),app_private.sync_project_marketplace_state()
from public,anon,authenticated;
