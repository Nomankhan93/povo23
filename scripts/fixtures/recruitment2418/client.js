// Isolated browser transport. Production never imports this module.
const params=new URLSearchParams(location.search);
for(const key of ['role','case'])if(params.has(key))sessionStorage.setItem('2418-'+key,params.get(key));
export const role=sessionStorage.getItem('2418-role')||'worker';
export const scenario=sessionStorage.getItem('2418-case')||'normal';
export const id=n=>'b4180000-0000-4000-8000-'+String(n).padStart(12,'0');
export const user=id(1),org=id(2),project=id(3),opportunity=id(4),area=id(5),template=id(6);
const today=new Date().toISOString().slice(0,10);
const end=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
export const projectRow={id:project,organization_id:org,title:'Community survey',status:'active',moderation_status:'allowed',start_date:today,end_date:end,created_at:today,geography_id:area,template_id:template,target:100,purpose:'Community survey purpose',consent_notice:'Collect with informed consent',consent_version:'v1',work_mode:'volunteer',compensation_type:'none',compensation_currency:'PKR',compensation_note:'Volunteer / unpaid',compensation_version:1};
const baseOpportunity={id:opportunity,organization_id:org,organization_name:'Partner Organization',survey_project_id:project,project_title:projectRow.title,title:'Community opportunity',description:'Collect community field data with informed consent and follow the project guidelines.',geography_id:area,start_date:today,end_date:end,reply_by:end+'T00:00:00Z',work_mode:'volunteer',payment_type:'unpaid',compensation_type:'none',compensation_snapshot_version:1,can_apply:true,marketplace_origin:'project_auto',marketplace_current:true,project_required_volunteers:10,required_volunteers:10,status:'open',publication_state:'published',applications_open:true,visibility:'all',created_at:today,version:1};
const application={id:id(10),user_id:user,organization_id:org,organization_name:'Partner Organization',survey_project_id:project,project_title:projectRow.title,status:'selected',opportunity_id:opportunity,opportunity_title:'Community opportunity',volunteer_name:'Worker One',profile_snapshot:{full_name:'Worker One',skills:'Survey work'},profile_share_consent:true,created_at:today,availability:'Available',version:1};
const assignment={id:id(20),user_id:user,source_application_id:application.id,survey_project_id:project,organization_id:org,organization_name:'Partner Organization',project_title:projectRow.title,status:scenario==='offered'?'offered':scenario==='completed'?'completed':'active',opportunity_id:opportunity,opportunity_title:'Community opportunity',volunteer_name:'Worker One',start_date:today,end_date:end,work_mode:'volunteer',compensation_type:'none',compensation_source:'opportunity_snapshot',currency:'PKR',rate:null,created_at:'2020-01-01',target_surveys:10,terms_note:'Collect consented responses',version:1,responded_at:scenario==='offered'?null:today};
const assignmentRows=['no-offer','candidate','apply','race','guidance'].includes(scenario)?[]:scenario==='old-offer'?[...Array.from({length:150},(_,i)=>({...assignment,id:id(100+i),status:'completed',source_application_id:null,created_at:today})),{...assignment,status:'offered',responded_at:null}, {...assignment,id:id(300),source_application_id:null,status:'active'}]:[assignment];
if(sessionStorage.getItem('2418-response')===scenario&&scenario==='offered')assignmentRows[0].status='active';
const applications=['apply','race','guidance'].includes(scenario)?[]:[application,{...application,id:id(11),opportunity_id:id(7),opportunity_title:'Other opportunity',volunteer_name:'Other Applicant',status:'rejected'}];
const account={id:user,status:'active',platform_role:role==='admin'?'super_admin':'volunteer',full_name:'Worker One',worker_enrollment:'enrolled'};
const profile={user_id:user,status:'verified',details:{full_name:'Worker One'},version:1};
const response={id:id(40),project_id:project,status:'submitted',created_at:today,collector_id:id(9),version:1,answers:{},full_name:'Private person',work_date:today};
export const tables={accounts:[account],volunteer_profiles:[profile],organizations:[{id:org,name:'Partner Organization',status:'active'}],
 organization_memberships:role==='worker'?[]:[{user_id:user,organization_id:org,role:'ngo_admin',status:'active'}],
 survey_projects:[projectRow],survey_assignments:[{project_id:project,user_id:user,active:true,collection_geography_id:area}],
 survey_templates:[{id:template,name:'Survey template',questions:[],version:1}],geographies:[{id:area,name:'Project area',kind:'province',active:true,parent_id:null}],
 work_assignments:assignmentRows,work_applications:applications,work_opportunities:scenario==='guidance'?[]:[baseOpportunity,{...baseOpportunity,id:id(7),title:'Other opportunity'}],
 survey_responses:role==='admin'?[response]:[]};
window.fixture={failApply:false,failCounts:false,eligible:!['blocked','expired','ineligible'].includes(scenario),tables};
window.rpcCalls=[];window.queryCalls=[];
export const configured=true;
export const db={
 auth:{getUser:async()=>({data:{user:{id:user}},error:null}),getSession:async()=>({data:{session:{user:{id:user}}},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null})},
 from(table){
  const filters=[],orders=[];let limit=Infinity,start=0,single=false,head=false,cursor=null;
  const q={select(columns='*',options={}){head=options.head===true;return q},eq(k,v){filters.push(row=>row[k]===v);return q},filter(k,op,v){if(op!=='eq')throw Error('Unexpected filter');return q.eq(k,v)},is(k,v){filters.push(row=>(row[k]??null)===v);return q},in(k,values){filters.push(row=>values.includes(row[k]));return q},not(k,op,v){filters.push(row=>row[k]!=v);return q},ilike(){return q},order(k,{ascending=true}={}){orders.push([k,ascending]);return q},limit(n){limit=n;return q},range(a,b){start=a;limit=b-a+1;return q},or(value){cursor=value;return q},single(){single=true;return q},maybeSingle(){single=true;return q},then(resolve,reject){
   window.queryCalls.push({table,head,start,limit:Number.isFinite(limit)?limit:null});
   if(head&&window.fixture.failCounts)return Promise.resolve({data:null,error:{message:'Count unavailable'},count:null}).then(resolve,reject);
   let rows=(tables[table]||[]).filter(row=>filters.every(fn=>fn(row))),count=rows.length;
   if(cursor){const match=cursor.match(/created_at.lt.([^,]+),and\(created_at.eq.[^,]+,id.lt.([^)]+)\)/);rows=rows.filter(row=>row.created_at<match[1]||(row.created_at===match[1]&&row.id<match[2]));}
   rows=[...rows].sort((a,b)=>{for(const [k,asc]of orders){if(a[k]!==b[k])return (a[k]<b[k]?-1:1)*(asc?1:-1)}return 0}).slice(start,start+limit);
   return Promise.resolve({data:head?null:single?(rows[0]||null):rows,error:null,count}).then(resolve,reject);
  }};return q;
 },
 rpc:async(name,args)=>{try{return {data:await rpc(name,args),error:null}}catch(error){return {data:null,error}}}
};
export async function rpc(name,args){
 window.rpcCalls.push({name,args:structuredClone(args)});
 if(name==='my_workspace_access')return {workspaces:[{id:'personal',label:'Field Worker'},...(role==='worker'?[]:[{id:org,label:'Partner Organization'}]),...(role==='admin'?[{id:'poem',label:'FieldLance Staff'}]:[])],defaultScope:role==='worker'?'personal':role==='admin'?'poem':org,worker:true,enrollment:'enrolled',applications:[]};
 if(name==='operational_report'){
  const counts={},totals={};
  for(const [kind,table] of Object.entries({projects:'survey_projects',responses:'survey_responses',applications:'work_applications',assignments:'work_assignments',opportunities:'work_opportunities'})){
   totals[kind]=(tables[table]||[]).length;
   for(const row of tables[table]||[])counts[kind+'.'+row.status]=(counts[kind+'.'+row.status]||0)+1;
  }
  return {allowed_kinds:Object.keys(totals),counts,totals,rows:[],due_cases:0,active_workers:0};
 }
 if(name==='project_needs_summary')return {total:0,people:0,open:0,in_progress:0,met:0,needs_review:0,closed:0};
 if(name==='my_withdrawal_summary')return {available:0,approved:0,paid:0};
 if(name==='work_experience_history')return {rows:[],total:150};
 if(name==='available_work_opportunities'){
  const term=args?.p_skill||'';
  await new Promise(r=>setTimeout(r,term==='old'?1000:term==='new'?20:5));
  const rows=Array.from({length:scenario==='apply'?21:1},(_,i)=>({...baseOpportunity,id:id(500+i),title:(term||'Community')+' opportunity '+i}));
  return {rows,total:rows.length};
 }
 if(name==='apply_work_opportunity'){if(window.fixture.failApply)throw Error('Recoverable fixture failure');return id(50)}
 if(name==='project_workforce_candidates')return {rows:[{user_id:user,details:{full_name:'Worker One'},source_kind:'application',source_id:application.id,match_label:'selected_application',approved_surveys:0,reviewed_surveys:0,completed_assignments:0,verified_experiences:0,approval_rate:null}]};
 if(name==='check_work_assignment_conflicts')return {status:'clear',headline:'Schedule clear',reasons:[],capacity_pct:10,overlapping_commitments:0,max_active_projects:3,estimated_available_days:30};
 if(name==='create_work_assignment'){tables.work_assignments.push({...assignment,status:'offered'});return assignment.id}
 if(name==='respond_work_assignment'){assignmentRows.find(row=>row.id===args.p_id).status=args.p_status==='accepted'?'active':'declined';sessionStorage.setItem('2418-response',scenario);return null}
 if(name==='can_collect_project')return window.fixture.eligible;
 if(name==='attendance_workspace')return {rows:[],count:0,summary:{open:0,submitted:0,approved:0,correction_required:0,rejected:0},can_manage:false,page:0};
 if(name==='project_attendance_policy')return {project_id:project,timezone:'Asia/Karachi',location_policy:'not_required',max_accuracy_m:100,can_manage:false};
 if(name==='attendance_session_detail')return null;
 if(name==='list_independent_verifications')return {rows:[],has_more:false};
 if(name==='verification_subjects')return [];
 if(name==='wallet_capabilities')return {sandbox_enabled:false,enrollment_available:false};
 return null;
}
