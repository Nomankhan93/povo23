-- POEM 2.7.2: Geography and regression stabilization.
-- Tighten new district creation so a Division is required everywhere except ICT,
-- while preserving unchanged legacy rows that may pre-date this rule.

create or replace function public.save_geography(
  p_id uuid,
  p_parent uuid,
  p_kind text,
  p_name text,
  p_code text,
  p_source text,
  p_active boolean
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
 declare
   result_id uuid;
   current_row public.geographies;
   parent_kind text;
   parent_code text;
 begin
   if not app_private.can_manage_ngos() then
     raise exception 'POEM admin access required';
   end if;

   if app_private.geo_rank(p_kind) is null
      or length(trim(p_name)) not between 2 and 120
      or length(trim(p_code)) not between 1 and 80
      or length(p_source) > 1000
      or p_active is null then
     raise exception 'Invalid geography';
   end if;

   if p_id is not null then
     select * into current_row
     from public.geographies
     where id=p_id
     for update;

     if not found then raise exception 'Area not found'; end if;
     if current_row.parent_id is distinct from p_parent or current_row.kind<>p_kind then
       raise exception 'Existing areas cannot be moved to a different parent or level';
     end if;
   end if;

   if p_kind='province' and p_parent is not null then
     raise exception 'Province / territory cannot have a parent';
   end if;

   if p_kind<>'province' then
     select kind,code into parent_kind,parent_code
     from public.geographies
     where id=p_parent;

     if parent_kind is null then raise exception 'Invalid parent level'; end if;

     if p_kind='district' then
       if parent_kind='division' then
         null;
       elsif parent_kind='province' and parent_code='PKREF-ICT' then
         null;
       elsif p_id is not null
         and current_row.parent_id is not distinct from p_parent
         and current_row.kind='district' then
         -- Preserve unchanged legacy rows created before the stricter rule.
         null;
       else
         raise exception 'Invalid parent level';
       end if;
     elsif app_private.geo_rank(parent_kind)<>app_private.geo_rank(p_kind)-1 then
       raise exception 'Invalid parent level';
     end if;
   end if;

   if p_active and p_parent is not null and not app_private.geo_active(p_parent) then
     raise exception 'Parent hierarchy is inactive';
   end if;

   if p_id is null then
     insert into public.geographies(parent_id,kind,name,code,source_note,active)
     values(p_parent,p_kind,trim(p_name),trim(p_code),p_source,p_active)
     returning id into result_id;
   else
     update public.geographies
     set name=trim(p_name),code=trim(p_code),source_note=p_source,active=p_active
     where id=p_id
     returning id into result_id;
   end if;

   insert into public.audit_events(actor_id,action,detail)
   values(auth.uid(),'geography_saved',jsonb_build_object('id',result_id,'name',p_name,'active',p_active));

   return result_id;
 end;
$$;

revoke all on function public.save_geography(uuid,uuid,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.save_geography(uuid,uuid,text,text,text,text,boolean) to authenticated;
