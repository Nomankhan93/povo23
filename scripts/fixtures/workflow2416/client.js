export const id=n=>'b4160000-0000-4000-8000-'+String(n).padStart(12,'0');
export const user=id(9001),org=id(9002),project=id(9003);
const day='2026-10-01';
window.rpcCalls=[];window.queryCalls=[];window.fixture={failFocus:new URLSearchParams(location.search).has("failFocus"),hidden:false,loseFunding:true,rejectFunding:false};
const base={organization_id:org,organization_name:'Fixture Organization',user_id:user,survey_project_id:project,project_title:'Fixture project',volunteer_name:'Fixture Worker',opportunity_id:null,opportunity_title:'Field project',created_at:day+'T00:00:00Z',version:1};
const assignments=Array.from({length:201},(_,i)=>({...base,id:id(i+1),status:i===0?'offered':'completed',work_mode:'volunteer',compensation_type:'none',currency:'PKR',rate:null,target_surveys:10,start_date:day,end_date:'2027-01-01',terms_note:'Formal fixture offer',responded_at:i===0?null:day}));
const applications=Array.from({length:501},(_,i)=>({...base,id:id(i+1001),status:'pending',profile_snapshot:{},profile_share_consent:true,availability:'Available',note:'Application fixture'}));
const drafts=[{id:id(9010),organization_id:org,name:'Saved template',questions:[],source:{},version:1,review_status:'draft',updated_at:day}];
const projectDrafts=[{id:id(9011),organization_id:org,title:'Saved project',template_id:null,geography_id:null,target:null,start_date:null,end_date:null,purpose:'',consent_version:'v1',consent_notice:'',version:1,review_status:'draft',updated_at:day}];
const account={id:user,platform_role:'super_admin',status:'active',full_name:'Fixture Admin',email:'fixture@example.test'};
const orgRow={id:org,name:'Fixture Organization',status:'active'};
const projectRow={id:project,organization_id:org,title:'Fixture project',status:'active',created_at:day,compensation_currency:'PKR',geography_id:id(9012),start_date:day,end_date:'2027-01-01',work_mode:'volunteer'};
const journals=JSON.parse(sessionStorage.getItem('fixture-journals')||'[]');
const tables={accounts:[account],organizations:[orgRow],organization_memberships:[{organization_id:org,user_id:user,role:'ngo_admin',status:'active'}],volunteer_profiles:[{user_id:user,status:'verified',details:{full_name:'Fixture Admin'}}],survey_projects:[projectRow],work_assignments:assignments,work_applications:applications,survey_template_drafts:drafts,survey_project_drafts:projectDrafts,survey_templates:[],finance_funding_sources:[{id:id(9013),organization_id:org,name:'Verified grant',currency:'PKR',source_type:'grant'}],finance_journals:journals};
export const db={
 auth:{getUser:async()=>({data:{user:{id:user}},error:null}),signOut:async()=>{window.signedOut=true;return {error:null}}},
 from(table){
  const filters=[],orders=[];let limit=Infinity,start=0,single=false,cursor=null;
  const q={select(){return q},eq(k,v){filters.push(row=>row[k]===v);q.exact=k==='id'?v:q.exact;return q},filter(k,op,v){if(op!=='eq')throw Error('Unexpected filter');return q.eq(k,v)},is(k,v){filters.push(row=>(row[k]??null)===v);return q},in(k,values){filters.push(row=>values.includes(row[k]));return q},not(k,op,v){filters.push(row=>row[k]!==v);return q},order(k,{ascending=true}={}){orders.push([k,ascending]);return q},limit(n){limit=n;return q},range(a,b){start=a;limit=b-a+1;return q},or(value){cursor=value;return q},single(){single=true;return q},maybeSingle(){single=true;return q},then(resolve,reject){
   window.queryCalls.push({table,limit:Number.isFinite(limit)?limit:null,exact:q.exact||null,cursor});
   if(window.fixture.failFocus&&q.exact&&(table==='work_assignments'||table==='work_applications'))return Promise.resolve({data:null,error:{message:'Simulated network error'}}).then(resolve,reject);
   let rows=(tables[table]||[]).filter(row=>filters.every(fn=>fn(row)));
   // The older linked project is deliberately absent from the bounded preview.
   if(table==='survey_projects'&&!q.exact&&new URLSearchParams(location.search).get('surface')==='recruitment')rows=[];
   if(window.fixture.hidden&&(table==='work_assignments'||table==='work_applications'))rows=[];
   if(cursor){const match=cursor.match(/created_at.lt.([^,]+),and\(created_at.eq.[^,]+,id.lt.([^)]+)\)/);if(!match)throw Error('Unexpected cursor '+cursor);rows=rows.filter(row=>row.created_at<match[1]||(row.created_at===match[1]&&row.id<match[2]));}
   rows=[...rows].sort((a,b)=>{for(const [k,asc]of orders){if(a[k]!==b[k])return (a[k]<b[k]?-1:1)*(asc?1:-1)}return 0}).slice(start,start+limit);
   return Promise.resolve({data:single?(rows[0]||null):rows,error:null,count:rows.length}).then(resolve,reject);
  }};return q;
 },
 rpc:async(name,args)=>{try{return {data:await rpc(name,args),error:null}}catch(error){return {data:null,error}}}
};
export async function rpc(name,args){
 window.rpcCalls.push({name,args:structuredClone(args)});
 if(name==='my_workspace_access')return {workspaces:[{id:org,label:'Fixture Organization'},{id:'poem',label:'FieldLance Staff'},{id:'personal',label:'Field Worker'}],defaultScope:org,worker:true,enrollment:'worker',applications:[]};
 if(name.includes('save_')&&name.includes('_draft'))return (args.p_version||0)+1;
 if(name==='available_work_opportunities')return {rows:[],total:0};
 if(name==='review_work_application'){applications.find(row=>row.id===args.p_id).status=args.p_status;return null}
 if(name==='respond_work_assignment'){const row=assignments.find(row=>row.id===args.p_id);if(!row||row.status!=='offered')throw Error('Offer unavailable');row.status=args.p_status==='accepted'?'active':'declined';return row.id}
 if(name==='project_funding_status')return {project_id:project,organization_id:org,project_status:'active',currency:'PKR',organization_available:1000,project_reserved:1000,can_manage:true,can_record_external:true};
 if(name==='project_funding_history')return {rows:[]};
 if(name==='project_funding_assurance'||name==='project_closure_status'||name==='project_payable_finance_reconciliation')return null;
 if(['record_organization_funding','reserve_project_funding','release_project_funding'].includes(name)){
  if(window.fixture.rejectFunding)throw {code:'P0001',message:'Insufficient organization available funds'};
  let existing=journals.find(row=>row.idempotency_key===args.p_idempotency_key);
  if(!existing){existing={id:id(9999-journals.length),created_by:user,organization_id:org,idempotency_key:args.p_idempotency_key,journal_type:{record_organization_funding:'organization_funding_received',reserve_project_funding:'project_funding_reserved',release_project_funding:'project_funding_released'}[name]};journals.push(existing);sessionStorage.setItem('fixture-journals',JSON.stringify(journals));}
  if(window.fixture.loseFunding){window.fixture.loseFunding=false;throw new TypeError('Response lost after commit')}
  return existing.id;
 }
 return null;
}
