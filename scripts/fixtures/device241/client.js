// Browser acceptance transport fixture. Production code never imports this module.
const owner=()=>localStorage.getItem('fixture-owner')||'alice';
const state=()=>JSON.parse(localStorage.getItem('fixture-server')||'{"rows":[],"requests":[]}');
const fixtureOffline=()=>localStorage.getItem('fixture-offline')==='yes';

const save=s=>{
  if(fixtureOffline()) {
    throw new TypeError('Failed to fetch');
  }
  localStorage.setItem('fixture-server',JSON.stringify(s));
};
export const assignment=()=>({id:'assignment-'+owner(),user_id:owner(),survey_project_id:'project',project_title:'Offline pilot',organization_name:'Pilot NGO',organization_id:'ngo',status:'active',compensation_type:'none',work_mode:'volunteer',currency:'PKR',rate:null,start_date:'2026-01-01',end_date:'2027-12-31'});
export const policy={project_id:'project',timezone:'UTC',location_policy:'not_required',max_accuracy_m:100,updated_at:'2026-09-28T00:00:00Z',can_manage:false};
export const configured=true;
const listeners=new Set();
const account=()=>({id:owner(),full_name:owner()==='alice'?'Alice':'Bob',platform_role:'volunteer',status:'active'});
const profile=()=>({id:'profile-'+owner(),user_id:owner(),status:'verified'});
function fixtureRows(table){
  if(table==='accounts')return[account()];
  if(table==='volunteer_profiles')return[profile()];
  if(table==='work_assignments')return[assignment()];
  return[];
}
function query(table){
  const filters=[];let inside=null,limit=null,range=null,mode='many';
  const execute=async()=>{
    let rows=fixtureRows(table).filter(row=>filters.every(([kind,key,value])=>kind==='eq'?row[key]===value:Array.isArray(value)&&value.includes(row[key])));
    if(inside)rows=rows.filter(row=>inside.values.includes(row[inside.key]));
    if(range)rows=rows.slice(range.from,range.to+1);else if(limit!==null)rows=rows.slice(0,limit);
    if(mode==='single'){
      if(rows.length!==1)return{data:null,error:new Error(`Fixture expected one ${table} row; received ${rows.length}`)};
      return{data:rows[0],error:null};
    }
    if(mode==='maybeSingle'){
      if(rows.length>1)return{data:null,error:new Error(`Fixture expected at most one ${table} row; received ${rows.length}`)};
      return{data:rows[0]||null,error:null};
    }
    return{data:rows,error:null};
  };
  const q={
    select:()=>q,
    eq:(key,value)=>{filters.push(['eq',key,value]);return q;},
    in:(key,values)=>{inside={key,values};return q;},
    order:()=>q,
    limit:value=>{limit=value;return q;},
    range:(from,to)=>{range={from,to};return q;},
    single:()=>{mode='single';return execute();},
    maybeSingle:()=>{mode='maybeSingle';return execute();},
    then:(resolve,reject)=>execute().then(resolve,reject),
  };
  return q;
}
export const db={
 auth:{getSession:async()=>({data:{session:{user:{id:owner()},access_token:'fixture'}},error:null}),getUser:async()=>({data:{user:{id:owner()}},error:null}),onAuthStateChange:cb=>{listeners.add(cb);return{data:{subscription:{unsubscribe:()=>listeners.delete(cb)}}};},signOut:async()=>{for(const cb of listeners)cb('SIGNED_OUT',null);return{error:null};}},
 from:table=>query(table),
 rpc(name,args){const result=rpc(name,args).then(data=>({data,error:null}),error=>({data:null,error}));result.abortSignal=()=>result;return result;}
};
export async function rpc(name,args){
 if(name==='my_workspace_access')return{workspaces:[{id:'personal',label:'Field Worker'}],defaultScope:'personal',worker:true,enrollment:'active',intent:'worker',applications:[]};
 if(!navigator.onLine)throw Error('Offline transport');
 if(name==='project_attendance_policy')return policy;
 if(name==='attendance_workspace'){const s=state();return{rows:s.rows,count:s.rows.length,summary:{open:s.rows.filter(r=>r.status==='open').length,submitted:s.rows.filter(r=>r.status==='submitted').length,approved:0,correction_required:0,rejected:0},can_manage:false,page:0,from:'2026-09-01',to:'2026-09-30'};}
 if(name==='start_assignment_work_session'||name==='checkout_assignment_work_session'){
  if(localStorage.getItem('fixture-reject'))throw Object.assign(Error('Assignment access revoked; evidence retained'),{code:'P0001'});
  const s=state();if(s.requests.includes(args.p_request))return{id:'session',version:1};s.requests.push(args.p_request);
  if(name==='start_assignment_work_session')s.rows=[{id:'session',assignment_id:args.p_assignment,project_id:'project',organization_id:'ngo',worker_id:owner(),project_title:'Offline pilot',organization_name:'Pilot NGO',volunteer_name:'Alice',work_mode:'volunteer',compensation_type:'none',currency:'PKR',rate:null,assignment_start_date:'2026-01-01',assignment_end_date:'2027-12-31',status:'open',version:1,work_date:'2026-09-28',timezone:'UTC',location_policy_snapshot:'not_required',max_accuracy_m_snapshot:100,check_in_captured_at:args.p_captured_at,check_in_received_at:args.p_captured_at,check_out_captured_at:null,check_out_received_at:null,effective_check_in_at:args.p_captured_at,effective_check_out_at:null,worker_note:'',submitted_at:null,reviewed_by:null,reviewed_at:null,review_note:'',payable_unit_id:null,duration_minutes:null,check_in_accuracy_m:null,check_out_accuracy_m:null,check_in_latitude:null,check_in_longitude:null,check_out_latitude:null,check_out_longitude:null,check_in_permission_state:'not_requested',check_out_permission_state:null,check_in_quality:'not_required',check_out_quality:null,check_in_location_note:'',check_out_location_note:null}];
  else s.rows=s.rows.map(r=>({...r,status:'submitted',version:2,check_out_captured_at:args.p_captured_at,check_out_received_at:args.p_captured_at,effective_check_out_at:args.p_captured_at,worker_note:args.p_worker_note||''}));save(s);return{id:'session',version:name==='start_assignment_work_session'?1:2};
 }
 throw Error('Unexpected fixture RPC '+name);
}
