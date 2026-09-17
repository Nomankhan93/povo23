-- POEM 2.14.0 follow-up:
-- Restore assignment/project-access revocation semantics that existed before
-- area-aware project governance policies were introduced.

drop policy if exists assignment_read on public.survey_assignments;

create policy assignment_read
on public.survey_assignments
for select
to authenticated
using (
  app_private.is_active()
  and app_private.can_read_project(project_id)
  and (
    user_id = auth.uid()
    or app_private.can_review_project_area(
      project_id,
      collection_geography_id
    )
  )
);

drop policy if exists response_read on public.survey_responses;

create policy response_read
on public.survey_responses
for select
to authenticated
using (
  app_private.is_active()
  and app_private.can_read_project(project_id)
  and (
    collector_id = auth.uid()
    or app_private.can_review_project_area(
      project_id,
      collection_geography_id
    )
  )
);

drop policy if exists capture_files_read on public.survey_capture_files;

create policy capture_files_read
on public.survey_capture_files
for select
to authenticated
using (
  app_private.is_active()
  and app_private.can_read_project(project_id)
  and (
    collector_id = auth.uid()
    or app_private.can_review_project_area(
      project_id,
      collection_geography_id
    )
  )
);

create or replace function app_private.can_access_capture_file(
  path text,
  writing boolean
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.survey_capture_files f
    where f.object_name = path
      and case
        when writing then
          f.collector_id = auth.uid()
          and app_private.can_collect(f.project_id)
        else
          (
            (
              f.collector_id = auth.uid()
              and app_private.can_read_project(f.project_id)
            )
            or app_private.can_review_project_area(
              f.project_id,
              f.collection_geography_id
            )
          )
      end
  );
$$;
