-- POEM 2.7.4: self-published editable volunteer profiles and private profile photos.
-- Normal profile publishing no longer depends on POEM admin approval.

alter table public.volunteer_profiles
  add column if not exists photo_path text,
  add column if not exists photo_updated_at timestamptz;

-- Keep the legacy save/review RPCs for backward compatibility and historical tests.
-- The normal UI now uses this self-publish RPC. It reuses all current validation,
-- then activates the profile immediately without a separate admin approval step.
create or replace function public.publish_my_profile(
  p_details jsonb,
  p_version integer,
  p_geography uuid
) returns void
language plpgsql
security definer
set search_path=''
as $$
 declare previous_status text;
 begin
   if not app_private.is_active() then raise exception 'Account is not active'; end if;
   select status into previous_status
   from public.volunteer_profiles
   where user_id=auth.uid()
   for update;
   if previous_status is null then raise exception 'Profile not found'; end if;
   if previous_status='suspended' then raise exception 'Your profile is suspended. Contact POEM.'; end if;

   -- Existing validation covers supported fields, full address and Taluka / Tehsil.
   perform public.save_my_profile(p_details,true,p_version,p_geography);

   -- "verified" is retained as the legacy database-ready state so existing survey
   -- and workforce authorization remains compatible. UI labels it Active profile;
   -- it no longer means that an administrator approved the profile.
   update public.volunteer_profiles
   set status='verified',
       review_note='',
       reviewed_by=null,
       reviewed_at=null,
       review_checks='{}'::jsonb,
       updated_at=now()
   where user_id=auth.uid() and status<>'suspended';

   insert into public.audit_events(actor_id,subject_id,action,detail)
   values(auth.uid(),auth.uid(),'profile_published',jsonb_build_object('from',previous_status));
 end;
$$;
revoke all on function public.publish_my_profile(jsonb,integer,uuid) from public,anon,authenticated;
grant execute on function public.publish_my_profile(jsonb,integer,uuid) to authenticated;

-- Private document review is now independent from profile publication.
create or replace function app_private.invalidate_document_review(subject uuid) returns void
language plpgsql
security definer
set search_path=''
as $$
 begin
   -- Retained as a compatibility hook for document RPCs. Document review status is
   -- stored on volunteer_documents and no longer changes profile publication state.
   perform 1 from public.volunteer_profiles where user_id=subject;
 end;
$$;
revoke all on function app_private.invalidate_document_review(uuid) from public,anon,authenticated;

-- Profile photo storage is private. The owner, authorized POEM volunteer managers,
-- and NGOs that can already read the profile may read the photo bytes.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('poem-profile-photos','poem-profile-photos',false,2097152,array['image/jpeg','image/png'])
on conflict(id) do update
set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function app_private.profile_photo_access(path text, operation text) returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
 declare subject uuid; expected text;
 begin
   begin
     subject:=split_part(path,'/',1)::uuid;
   exception when others then
     return false;
   end;
   expected:=subject::text||'/profile';
   if path is distinct from expected then return false; end if;
   if operation='read' then
     return app_private.can_read_profile(subject);
   elsif operation in ('write','delete') then
     return subject=auth.uid()
       and app_private.is_active()
       and exists(select 1 from public.volunteer_profiles p where p.user_id=subject and p.status<>'suspended');
   end if;
   return false;
 end;
$$;
revoke all on function app_private.profile_photo_access(text,text) from public,anon,authenticated;
grant execute on function app_private.profile_photo_access(text,text) to authenticated;

create policy poem_profile_photo_read on storage.objects
for select to authenticated
using(bucket_id='poem-profile-photos' and app_private.profile_photo_access(name,'read'));

create policy poem_profile_photo_insert on storage.objects
for insert to authenticated
with check(bucket_id='poem-profile-photos' and app_private.profile_photo_access(name,'write'));

create policy poem_profile_photo_update on storage.objects
for update to authenticated
using(bucket_id='poem-profile-photos' and app_private.profile_photo_access(name,'write'))
with check(bucket_id='poem-profile-photos' and app_private.profile_photo_access(name,'write'));

create policy poem_profile_photo_delete on storage.objects
for delete to authenticated
using(bucket_id='poem-profile-photos' and app_private.profile_photo_access(name,'delete'));

create or replace function public.set_profile_photo(p_present boolean) returns void
language plpgsql
security definer
set search_path=''
as $$
 declare path text:=auth.uid()::text||'/profile'; meta jsonb;
 begin
   if not app_private.is_active() then raise exception 'Active account required'; end if;
   perform 1 from public.volunteer_profiles where user_id=auth.uid() and status<>'suspended' for update;
   if not found then raise exception 'Profile is suspended'; end if;

   if p_present then
     select metadata into meta
     from storage.objects
     where bucket_id='poem-profile-photos' and name=path;
     if meta is null then raise exception 'Uploaded profile photo is missing'; end if;
     if coalesce((meta->>'size')::bigint,0) not between 1 and 2097152
        or coalesce(meta->>'mimetype','') not in ('image/jpeg','image/png') then
       raise exception 'Profile photo must be JPG or PNG up to 2 MiB';
     end if;
     update public.volunteer_profiles
     set photo_path=path,photo_updated_at=now(),updated_at=now()
     where user_id=auth.uid();
   else
     update public.volunteer_profiles
     set photo_path=null,photo_updated_at=now(),updated_at=now()
     where user_id=auth.uid();
   end if;

   insert into public.audit_events(actor_id,subject_id,action,detail)
   values(auth.uid(),auth.uid(),case when p_present then 'profile_photo_saved' else 'profile_photo_removed' end,'{}'::jsonb);
 end;
$$;
revoke all on function public.set_profile_photo(boolean) from public,anon,authenticated;
grant execute on function public.set_profile_photo(boolean) to authenticated;
