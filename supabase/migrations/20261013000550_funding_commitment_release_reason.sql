-- Resolve the proven PL/pgSQL variable/column ambiguity without changing
-- the RPC signature, authorization, ownership, grants, or transition rules.
create or replace function public.release_project_funding_commitment(p_opportunity uuid,p_reason text,p_request uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.project_funding_commitments; w public.work_opportunities; release_reason_value text:=trim(coalesce(p_reason,''));
begin
  if p_request is null then raise exception 'Funding commitment request key required'; end if;
  select * into w from public.work_opportunities where id=p_opportunity for update;
  if not found then raise exception 'Opportunity not found'; end if;
  if not app_private.can_manage_project_funding(w.survey_project_id) then raise exception 'Project funding management permission required'; end if;
  if length(release_reason_value) not between 3 and 1000 then raise exception 'Release reason is required'; end if;
  select * into c from public.project_funding_commitments where opportunity_id=p_opportunity for update;
  if not found then raise exception 'No funding commitment exists for this opportunity'; end if;
  if c.status in ('released','settled') then return c.id; end if;
  if exists(select 1 from public.work_assignments a where a.opportunity_id=p_opportunity and a.status in ('offered','active','completed')) then raise exception 'Active or completed assignment still uses this funding commitment'; end if;
  update public.project_funding_commitments set status='released',released_at=now(),released_by=auth.uid(),release_reason=release_reason_value,version=version+1 where id=c.id;
  insert into public.audit_events(actor_id,organization_id,action,detail) values(auth.uid(),c.organization_id,'paid_opportunity_funding_released',jsonb_build_object('commitment',c.id,'opportunity',p_opportunity,'amount',c.amount,'currency',c.currency,'reason',release_reason_value,'request',p_request));
  return c.id;
end;
$$;
