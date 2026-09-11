-- Additive upgrade. The Phase 1.1 migration stays unchanged.
create table public.geographies (
 id uuid primary key default gen_random_uuid(),parent_id uuid references public.geographies(id),
 kind text not null check(kind in ('province','division','district','taluka','uc','village','ward')),
 name text not null check(length(trim(name)) between 2 and 120),code text not null check(length(code) between 1 and 80),
 source_note text not null default '',active boolean not null default true,created_at timestamptz not null default now(),
 unique(code)
);
create index geography_parent on public.geographies(parent_id);
alter table public.volunteer_profiles add column geography_id uuid references public.geographies(id);
alter table public.volunteer_profiles add column review_checks jsonb not null default '{}'::jsonb;
create index profiles_geography on public.volunteer_profiles(geography_id);
create function app_private.geo_rank(k text) returns int language sql immutable set search_path='' as $$ select case k when 'province' then 0 when 'division' then 1 when 'district' then 2 when 'taluka' then 3 when 'uc' then 4 when 'village' then 5 when 'ward' then 5 end $$;
create function app_private.geo_active(g uuid) returns boolean language sql stable security definer set search_path='' as $$
 with recursive chain as (select id,parent_id,active from public.geographies where id=g union all select p.id,p.parent_id,p.active from public.geographies p join chain c on p.id=c.parent_id)
 select coalesce(bool_and(active),false) from chain; $$;
create function public.save_geography(p_id uuid,p_parent uuid,p_kind text,p_name text,p_code text,p_source text,p_active boolean) returns uuid language plpgsql security definer set search_path='' as $$
 declare result_id uuid; current_row public.geographies;
 begin
 if not app_private.is_admin() then raise exception 'POEM admin access required'; end if;
 if app_private.geo_rank(p_kind) is null or length(trim(p_name)) not between 2 and 120 or length(trim(p_code)) not between 1 and 80 or length(p_source)>1000 or p_active is null then raise exception 'Invalid geography'; end if;
 if p_kind='province' and p_parent is not null then raise exception 'Province cannot have a parent'; end if;
 if p_kind<>'province' and not exists(select 1 from public.geographies where id=p_parent and app_private.geo_rank(kind)=app_private.geo_rank(p_kind)-1) then raise exception 'Invalid parent level'; end if;
 if p_active and p_parent is not null and not app_private.geo_active(p_parent) then raise exception 'Parent hierarchy is inactive'; end if;
 if p_id is null then
 insert into public.geographies(parent_id,kind,name,code,source_note,active) values(p_parent,p_kind,trim(p_name),trim(p_code),p_source,p_active) returning id into result_id;
 else
 select * into current_row from public.geographies where id=p_id for update;
 if not found then raise exception 'Area not found'; end if;
 if current_row.parent_id is distinct from p_parent or current_row.kind<>p_kind then raise exception 'Existing areas cannot be moved to a different parent or level'; end if;
 update public.geographies set name=trim(p_name),code=trim(p_code),source_note=p_source,active=p_active where id=p_id returning id into result_id;
 end if;
 insert into public.audit_events(actor_id,action,detail) values(auth.uid(),'geography_saved',jsonb_build_object('id',result_id,'name',p_name,'active',p_active));return result_id;
 end; $$;
alter table public.geographies enable row level security;
create policy geography_read on public.geographies for select to authenticated using(app_private.is_active());
revoke all on public.geographies from anon,authenticated;
grant select on public.geographies to authenticated;
grant all on public.geographies to service_role;
-- Move old entry points behind the new validated interface; never leave the old RPC exposed.
alter function public.save_my_profile(jsonb,boolean,integer) set schema app_private;
alter function app_private.save_my_profile(jsonb,boolean,integer) rename to save_profile_v11;
revoke all on function app_private.save_profile_v11(jsonb,boolean,integer) from public,anon,authenticated;
create function public.save_my_profile(p_details jsonb,p_submit boolean,p_version integer,p_geography uuid) returns void language plpgsql security definer set search_path='' as $$
 begin
 if p_geography is not null and not app_private.geo_active(p_geography) then raise exception 'Selected geography or an ancestor is inactive'; end if;
 if p_submit and not exists(select 1 from public.geographies where id=p_geography and app_private.geo_rank(kind)>=2) then raise exception 'Select a district or a more specific area before submitting'; end if;
 perform app_private.save_profile_v11(p_details,p_submit,p_version);
 update public.volunteer_profiles set geography_id=p_geography,review_checks='{}' where user_id=auth.uid();
 end; $$;

create table public.volunteer_documents (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.accounts(id),
 object_path text not null unique,file_name text not null,mime_type text not null,byte_size bigint not null check(byte_size between 1 and 5242880),
 kind text not null check(kind in ('cv','education','training','reference','identity')),
 state text not null default 'uploading' check(state in ('uploading','ready','deleting','deleted')),
 review_status text not null default 'pending' check(review_status in ('pending','accepted','rejected')),
 review_note text not null default '',reviewed_by uuid references public.accounts(id),reviewed_at timestamptz,
 created_at timestamptz not null default now(),version integer not null default 1
);
create index documents_user_state on public.volunteer_documents(user_id,state);
alter table public.volunteer_documents enable row level security;
create policy document_metadata_read on public.volunteer_documents for select to authenticated using(app_private.is_active() and (user_id=auth.uid() or app_private.is_admin()));
revoke all on public.volunteer_documents from anon,authenticated;
grant select on public.volunteer_documents to authenticated;
grant all on public.volunteer_documents to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('poem-private-documents','poem-private-documents',false,5242880,array['application/pdf','image/jpeg','image/png']);
create function app_private.document_access(path text,operation text) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.is_active() and exists(select 1 from public.volunteer_documents d join public.volunteer_profiles p on p.user_id=d.user_id where d.object_path=path and
 case operation
 when 'read' then d.state='ready' and (d.user_id=auth.uid() or app_private.is_admin())
 when 'upload' then d.user_id=auth.uid() and d.state='uploading' and p.status<>'suspended'
 when 'delete' then d.user_id=auth.uid() and d.state='deleting'
 else false end); $$;
create policy poem_document_read on storage.objects for select to authenticated using(bucket_id='poem-private-documents' and (app_private.document_access(name,'read') or app_private.document_access(name,'delete')));
create policy poem_document_upload on storage.objects for insert to authenticated with check(bucket_id='poem-private-documents' and app_private.document_access(name,'upload'));
create policy poem_document_delete on storage.objects for delete to authenticated using(bucket_id='poem-private-documents' and app_private.document_access(name,'delete'));
-- There is deliberately no UPDATE policy: previously reviewed bytes cannot be replaced.
create function app_private.invalidate_document_review(subject uuid) returns void language plpgsql security definer set search_path='' as $$
 begin
 update public.volunteer_profiles set version=version+1,status=case when status='verified' then 'pending' else status end,review_checks='{}',reviewed_by=null,reviewed_at=null,review_note='',updated_at=now() where user_id=subject;
 end; $$;
create function public.begin_document_upload(p_name text,p_type text,p_bytes bigint,p_kind text) returns jsonb language plpgsql security definer set search_path='' as $$
 declare row public.volunteer_documents; new_id uuid:=gen_random_uuid(); suffix text;
 begin
 if not app_private.is_active() then raise exception 'Active account required'; end if;
 perform 1 from public.volunteer_profiles where user_id=auth.uid() and status<>'suspended' for update;
 if not found then raise exception 'Profile is suspended'; end if;
 if p_type not in ('application/pdf','image/jpeg','image/png') or p_bytes not between 1 and 5242880 or length(p_name) not between 1 and 200 or p_name~'[/\\]' or p_kind not in ('cv','education','training','reference','identity') then raise exception 'Use a PDF, JPG or PNG up to 5 MiB with a valid file name'; end if;
 if (select count(*) from public.volunteer_documents where user_id=auth.uid() and state<>'deleted')>=20 then raise exception 'Maximum 20 documents. Remove unused files or incomplete uploads first.'; end if;
 suffix:=case p_type when 'application/pdf' then '.pdf' when 'image/png' then '.png' else '.jpg' end;
 insert into public.volunteer_documents(id,user_id,object_path,file_name,mime_type,byte_size,kind) values(new_id,auth.uid(),auth.uid()::text||'/'||new_id::text||suffix,p_name,p_type,p_bytes,p_kind) returning * into row;return to_jsonb(row);
 end; $$;
create function public.finish_document_upload(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
 declare d public.volunteer_documents; meta jsonb;
 begin
 if not app_private.is_active() then raise exception 'Active account required'; end if;
 perform 1 from public.volunteer_profiles where user_id=auth.uid() and status<>'suspended' for update;
 if not found then raise exception 'Profile is suspended'; end if;
 select * into d from public.volunteer_documents where id=p_id and user_id=auth.uid() for update;
 if not found then raise exception 'Document not found'; end if;
 if d.state='ready' then return; end if;
 if d.state<>'uploading' then raise exception 'Invalid upload state'; end if;
 select metadata into meta from storage.objects where bucket_id='poem-private-documents' and name=d.object_path;
 if meta is null or coalesce((meta->>'size')::bigint,0)<>d.byte_size or meta->>'mimetype' is distinct from d.mime_type then raise exception 'Uploaded object is missing or does not match the declared size/type'; end if;
 update public.volunteer_documents set state='ready',version=version+1 where id=p_id;
 perform app_private.invalidate_document_review(auth.uid());
 insert into public.audit_events(actor_id,subject_id,action,detail) values(auth.uid(),auth.uid(),'document_uploaded',jsonb_build_object('id',p_id,'kind',d.kind));
 end; $$;
create function public.begin_document_delete(p_id uuid) returns text language plpgsql security definer set search_path='' as $$
 declare d public.volunteer_documents;
 begin
 if not app_private.is_active() then raise exception 'Active account required'; end if;
 perform 1 from public.volunteer_profiles where user_id=auth.uid() for update;
 select * into d from public.volunteer_documents where id=p_id and user_id=auth.uid() for update;
 if not found or d.state='deleted' then raise exception 'Document not found'; end if;
 if d.state<>'deleting' then
 update public.volunteer_documents set state='deleting',version=version+1 where id=p_id;
 perform app_private.invalidate_document_review(auth.uid());
 insert into public.audit_events(actor_id,subject_id,action,detail) values(auth.uid(),auth.uid(),'document_removal_requested',jsonb_build_object('id',p_id));
 end if;
 return d.object_path;
 end; $$;
create function public.finish_document_delete(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
 declare path text;
 begin
 if not app_private.is_active() then raise exception 'Active account required'; end if;
 select object_path into path from public.volunteer_documents where id=p_id and user_id=auth.uid() and state='deleting' for update;
 if not found then raise exception 'No removal pending'; end if;
 if exists(select 1 from storage.objects where bucket_id='poem-private-documents' and name=path) then raise exception 'Remove the stored file before completing removal'; end if;
 update public.volunteer_documents set state='deleted',version=version+1 where id=p_id;
 end; $$;
create function public.review_document(p_id uuid,p_status text,p_note text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
 declare d public.volunteer_documents; owner_user uuid;
 begin
 if not app_private.is_admin() then raise exception 'POEM admin access required'; end if;
 select user_id into owner_user from public.volunteer_documents where id=p_id;
 perform 1 from public.volunteer_profiles where user_id=owner_user for update;
 select * into d from public.volunteer_documents where id=p_id for update;
 if not found or d.state<>'ready' then raise exception 'Ready document not found'; end if;
 if d.user_id=auth.uid() then raise exception 'Cannot review your own document'; end if;
 if d.version is distinct from p_version then raise exception 'Document changed. Reload before reviewing.'; end if;
 if p_status not in ('accepted','rejected') or length(trim(p_note)) not between 3 and 2000 then raise exception 'Decision and review note required'; end if;
 update public.volunteer_documents set review_status=p_status,review_note=p_note,reviewed_by=auth.uid(),reviewed_at=now(),version=version+1 where id=p_id;
 perform app_private.invalidate_document_review(d.user_id);
 insert into public.audit_events(actor_id,subject_id,action,detail) values(auth.uid(),d.user_id,'document_reviewed',jsonb_build_object('id',p_id,'status',p_status,'note',p_note));
 end; $$;
create function public.document_download_path(p_id uuid) returns text language plpgsql security definer set search_path='' as $$
 declare d public.volunteer_documents;
 begin
 select * into d from public.volunteer_documents where id=p_id;
 if not found or not app_private.document_access(d.object_path,'read') then raise exception 'Document access denied'; end if;
 insert into public.audit_events(actor_id,subject_id,action,detail) values(auth.uid(),d.user_id,'document_download_requested',jsonb_build_object('id',p_id));return d.object_path;
 end; $$;
alter function public.review_profile(uuid,text,text,integer) set schema app_private;
alter function app_private.review_profile(uuid,text,text,integer) rename to review_profile_v11;
revoke all on function app_private.review_profile_v11(uuid,text,text,integer) from public,anon,authenticated;
create function public.review_profile(p_user_id uuid,p_status text,p_note text,p_version integer,p_checks jsonb) returns void language plpgsql security definer set search_path='' as $$
 declare geo uuid;
 begin
 if not app_private.is_admin() then raise exception 'POEM admin access required'; end if;
 select geography_id into geo from public.volunteer_profiles where user_id=p_user_id for update;
 if p_status='verified' then
 if not app_private.geo_active(geo) then raise exception 'Profile needs an active structured location'; end if;
 if p_checks is null or jsonb_typeof(p_checks)<>'object' or p_checks->'profile_complete' is distinct from 'true'::jsonb or p_checks->'contact_checked' is distinct from 'true'::jsonb or p_checks->'location_checked' is distinct from 'true'::jsonb then raise exception 'Complete the profile, contact and location checklist'; end if;
 if exists(select 1 from public.volunteer_documents where user_id=p_user_id and state in ('uploading','deleting')) then raise exception 'Finish pending uploads/removals before profile approval'; end if;
 if exists(select 1 from public.volunteer_documents where user_id=p_user_id and state='ready' and review_status<>'accepted') then raise exception 'All current documents must be accepted before profile approval'; end if;
 end if;
 if octet_length(coalesce(p_checks,'{}')::text)>1000 then raise exception 'Invalid checklist'; end if;
 perform app_private.review_profile_v11(p_user_id,p_status,p_note,p_version);
 update public.volunteer_profiles set review_checks=jsonb_build_object('profile_complete',p_checks->'profile_complete','contact_checked',p_checks->'contact_checked','location_checked',p_checks->'location_checked') where user_id=p_user_id;
 end; $$;

create table public.notifications (
 id bigint generated always as identity primary key,user_id uuid not null references public.accounts(id),
 title text not null,body text not null,read_at timestamptz,created_at timestamptz not null default now()
);
create index notification_user_time on public.notifications(user_id,created_at desc);
alter table public.notifications enable row level security;
create policy notifications_read on public.notifications for select to authenticated using(user_id=auth.uid() and app_private.is_active());
revoke all on public.notifications from anon,authenticated;
grant select on public.notifications to authenticated;
grant all on public.notifications to service_role;
grant all on sequence public.notifications_id_seq to service_role;
create function app_private.notify_event() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 if new.subject_id is not null and new.action in ('profile_reviewed','document_reviewed','membership_changed','account_access_changed') then
 insert into public.notifications(user_id,title,body) values(new.subject_id,replace(new.action,'_',' '),'Your POEM record was updated. Open your profile or workspace to view the current status.');
 end if;return new;
 end; $$;
create trigger poem_notify after insert on public.audit_events for each row execute function app_private.notify_event();
create function public.mark_notification_read(p_id bigint) returns void language plpgsql security definer set search_path='' as $$
 begin
 if not app_private.is_active() then raise exception 'Active account required'; end if;
 update public.notifications set read_at=coalesce(read_at,now()) where id=p_id and user_id=auth.uid();
 if not found then raise exception 'Notification not found'; end if;
 end; $$;
revoke all on function app_private.geo_rank(text),app_private.geo_active(uuid),app_private.document_access(text,text),app_private.invalidate_document_review(uuid),app_private.notify_event() from public,anon,authenticated;
grant execute on function app_private.geo_active(uuid),app_private.document_access(text,text) to authenticated;
revoke all on function public.save_geography(uuid,uuid,text,text,text,text,boolean),public.save_my_profile(jsonb,boolean,integer,uuid),public.begin_document_upload(text,text,bigint,text),public.finish_document_upload(uuid),public.begin_document_delete(uuid),public.finish_document_delete(uuid),public.review_document(uuid,text,text,integer),public.document_download_path(uuid),public.review_profile(uuid,text,text,integer,jsonb),public.mark_notification_read(bigint) from public,anon,authenticated;
grant execute on function public.save_geography(uuid,uuid,text,text,text,text,boolean),public.save_my_profile(jsonb,boolean,integer,uuid),public.begin_document_upload(text,text,bigint,text),public.finish_document_upload(uuid),public.begin_document_delete(uuid),public.finish_document_delete(uuid),public.review_document(uuid,text,text,integer),public.document_download_path(uuid),public.review_profile(uuid,text,text,integer,jsonb),public.mark_notification_read(bigint) to authenticated;
