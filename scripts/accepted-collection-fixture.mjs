// Latest-schema collection fixtures must establish genuine worker consent through public RPCs.
// This does not bypass triggers, invent acceptance, or change any production data.
export async function acceptCollectionFixture(db,project,user){
 const query=async(q,a=[])=>(await db.query(q,a)).rows;
 const saved=(await query("select current_user role,current_setting('request.jwt.claim.sub',true) uid"))[0];
 const as=async id=>{await db.exec('RESET ROLE');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('SET ROLE authenticated');};
 const call=async(n,a)=>(await query('select public.'+n+'('+a.map((_,i)=>'$'+(i+1)).join(',')+') result',a))[0].result;
 try{
  await db.exec('RESET ROLE');
  if((await query("select 1 from public.work_assignments where survey_project_id=$1 and user_id=$2 and status='active' and responded_at is not null",[project,user])).length)return;
  const p=(await query("select *,start_date::text start,end_date::text finish from public.survey_projects where id=$1",[project]))[0];
  const manager=(await query("select a.id from public.accounts a where a.status='active' and (a.platform_role='super_admin' or exists(select 1 from public.organization_memberships m where m.user_id=a.id and m.organization_id=$1 and m.role='ngo_admin' and m.status='active')) order by (a.platform_role='super_admin') desc limit 1",[p.organization_id]))[0].id;
  const opportunity=(await query("select id from public.work_opportunities where survey_project_id=$1 and marketplace_current",[project]))[0].id;
  const existing=(await query("select id,status,version from public.work_applications where survey_project_id=$1 and user_id=$2 and status in ('pending','shortlisted','selected')",[project,user]))[0];
  await as(user);
  const application=existing?.id || await call('apply_work_opportunity',[opportunity,'Available for fixture period','Explicit consent for collection regression fixture',true]);
  await as(manager);
  if(existing?.status!=='selected')await call('review_work_application',[application,'selected','Collection regression fixture selection',existing?.version||1]);
  const assignment=await call('create_work_assignment',[project,user,'application',application,p.work_mode||'volunteer',p.compensation_type||'none',p.currency||'PKR',p.rate||null,1,p.start,p.finish,'Collection regression fixture formal terms']);
  await as(user);
  await call('respond_work_assignment',[assignment,'accepted',1]);
 }finally{
  await db.exec('RESET ROLE');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[saved.uid||'']);
  if(saved.role==='authenticated'||saved.role==='anon')await db.exec('SET ROLE '+saved.role);
 }
}
