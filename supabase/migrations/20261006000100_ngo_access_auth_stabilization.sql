-- POEM 2.13.1 — NGO Access & Authentication Stabilization
-- Retire user-facing permanent NGO profile sharing, preserve historical schema compatibility,
-- and make current NGO profile access follow explicit POEM recruitment/assignment relationships.

-- Existing permanent grants are retired without firing the old revocation triggers. The table
-- and RPC remain as historical compatibility surfaces for older migrations/tests; current UI and
-- current assignment flows no longer create or require these grants.
truncate table public.profile_shares;

create or replace function app_private.ngo_scoped_profile_access(org uuid,subject uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.accounts a join public.volunteer_profiles v on v.user_id=a.id where a.id=subject and a.status='active' and v.status<>'suspended')
 and (
   exists(
     select 1 from public.work_assignments w
     where w.organization_id=org and w.user_id=subject and w.status in ('offered','active')
   )
   or exists(
     select 1
     from public.survey_assignments sa
     join public.survey_projects p on p.id=sa.project_id
     where p.organization_id=org and sa.user_id=subject and sa.active
   )
   or exists(
     select 1 from public.work_invitations i
     where i.organization_id=org and i.user_id=subject and i.status in ('pending','accepted')
   )
 );
$$;

create or replace function app_private.ngo_profile_access(org uuid,subject uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select app_private.ngo_admin(org)
 and exists(select 1 from public.accounts a join public.volunteer_profiles v on v.user_id=a.id where a.id=subject and a.status='active' and v.status<>'suspended')
 and (
   app_private.ngo_scoped_profile_access(org,subject)
   or exists(select 1 from public.profile_shares s where s.organization_id=org and s.user_id=subject)
 );
$$;

create or replace function app_private.can_read_profile(subject uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select app_private.is_active() and (
   subject=auth.uid()
   or app_private.can_manage_volunteers()
   or exists(
     select 1 from public.organizations o
     where app_private.ngo_profile_access(o.id,subject)
   )
 );
$$;

-- Direct survey assignment no longer depends on a permanent volunteer->NGO grant. The project
-- manager still needs project authority, the volunteer must have an active published profile,
-- and current independent-verification governance is enforced before activation.
create or replace function public.set_survey_assignment(p_project uuid,p_user uuid,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
declare p public.survey_projects;
begin
 if not app_private.can_review_survey(p_project) then raise exception 'Project management permission required';end if;
 select * into p from public.survey_projects where id=p_project for update;
 if not found or p_active is null then raise exception 'Project and assignment decision required';end if;
 if p_active and p.status<>'active' then raise exception 'Active project required for assignment';end if;
 if p_active and not exists(
   select 1 from public.accounts a
   join public.volunteer_profiles v on v.user_id=a.id
   where a.id=p_user and a.status='active' and v.status='verified'
 ) then raise exception 'Assign a published active volunteer';end if;
 if p_active and not app_private.can_manage_surveys() and not (
   exists(select 1 from public.work_applications a where a.survey_project_id=p_project and a.user_id=p_user and a.status='selected')
   or exists(select 1 from public.work_invitations i join public.work_opportunities o on o.id=i.opportunity_id where o.survey_project_id=p_project and i.user_id=p_user and i.status='accepted')
   or exists(select 1 from public.work_assignments w where w.survey_project_id=p_project and w.user_id=p_user and w.status in ('offered','active'))
   or exists(select 1 from public.profile_shares s where s.user_id=p_user and s.organization_id=p.organization_id)
 ) then raise exception 'Volunteer must be connected through a selected application, accepted invitation or assignment';end if;
 if p_active and not app_private.project_recruitment_verification_ready(p_project,p_user) then raise exception 'Current project independent verification requirements are not satisfied';end if;
 insert into public.survey_assignments(project_id,user_id,active) values(p_project,p_user,p_active)
 on conflict(project_id,user_id) do update set active=excluded.active;
 insert into public.notifications(user_id,title,body) values(p_user,'Survey assignment updated','Open My Assigned Surveys to see your assigned field work.');
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
 values(auth.uid(),p_user,p.organization_id,'survey_assignment_changed',jsonb_build_object('project',p_project,'active',p_active,'access_model','assignment_scoped'));
end;$$;

-- Accepted legacy invitations remain usable after permanent sharing is retired. The invitation
-- itself is the bounded relationship; it does not create a permanent profile grant.
create or replace function public.respond_work_invitation(p_id uuid,p_status text,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare i public.work_invitations;o public.work_opportunities;oid uuid;
begin
 if not app_private.is_active() then raise exception 'Active account required';end if;
 select opportunity_id into oid from public.work_invitations where id=p_id and user_id=auth.uid();
 select * into o from public.work_opportunities where id=oid for update;
 select * into i from public.work_invitations where id=p_id and user_id=auth.uid() for update;
 if not found then raise exception 'Invitation not found';end if;
 if i.status<>'pending' or i.version is distinct from p_version then raise exception 'Invitation changed. Reload.';end if;
 if o.status<>'open' or o.reply_by<=now() then raise exception 'Opportunity closed or invitation expired';end if;
 if not exists(select 1 from public.organizations where id=i.organization_id and status='active') then raise exception 'Active Partner NGO required';end if;
 if not exists(select 1 from public.volunteer_profiles where user_id=auth.uid() and status<>'suspended') then raise exception 'Profile suspended';end if;
 if p_status is null or p_status not in ('accepted','declined') then raise exception 'Accept or decline required';end if;
 update public.work_invitations set status=p_status,version=version+1,responded_at=now() where id=p_id;
 insert into public.notifications(user_id,title,body)
 select m.user_id,'Invitation response','A volunteer responded. Open your NGO Invitations workspace.'
 from public.organization_memberships m join public.accounts a on a.id=m.user_id
 where m.organization_id=i.organization_id and m.role='ngo_admin' and m.status='active' and a.status='active';
 insert into public.audit_events(actor_id,subject_id,organization_id,action,detail)
 values(auth.uid(),auth.uid(),i.organization_id,'invitation_responded',jsonb_build_object('id',p_id,'status',p_status,'access_model','invitation_scoped'));
end;$$;

revoke all on function app_private.ngo_scoped_profile_access(uuid,uuid) from public,anon,authenticated;
grant execute on function app_private.ngo_scoped_profile_access(uuid,uuid) to authenticated;

revoke all on function app_private.ngo_profile_access(uuid,uuid),app_private.can_read_profile(uuid) from public,anon,authenticated;
grant execute on function app_private.ngo_profile_access(uuid,uuid),app_private.can_read_profile(uuid) to authenticated;

revoke all on function public.set_survey_assignment(uuid,uuid,boolean),public.respond_work_invitation(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.set_survey_assignment(uuid,uuid,boolean),public.respond_work_invitation(uuid,text,integer) to authenticated;
