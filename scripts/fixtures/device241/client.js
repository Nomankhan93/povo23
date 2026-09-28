// Browser acceptance transport fixture. Production code never imports this module.
const owner=()=>localStorage.getItem('fixture-owner')||'alice';
const state=()=>JSON.parse(localStorage.getItem('fixture-server')||'{"rows":[],"requests":[]}');
const save=s=>localStorage.setItem('fixture-server',JSON.stringify(s));
export const assignment=()=>({id:'assignment-'+owner(),user_id:owner(),survey_project_id:'project',project_title:'Offline pilot',organization_name:'Pilot NGO',organization_id:'ngo',status:'active',compensation_type:'none',start_date:'2026-01-01',end_date:'2027-12-31'});
export const policy={project_id:'project',timezone:'UTC',location_policy:'not_required',max_accuracy_m:100,can_manage:false};
export const configured=true;
const listeners=new Set();
export const db={
 auth:{getSession:async()=>({data:{session:{user:{id:owner()},access_token:'fixture'}},error:null}),getUser:async()=>({data:{user:{id:owner()}},error:null}),onAuthStateChange:cb=>{listeners.add(cb);return{data:{subscription:{unsubscribe:()=>listeners.delete(cb)}}};},signOut:async()=>{for(const cb of listeners)cb('SIGNED_OUT',null);return{error:null};}},
 from:()=>{const q={select:()=>q,eq:()=>q,in:()=>q,order:()=>q,limit:async()=>({data:[assignment()],error:null})};return q;},
 rpc(name,args){const result=rpc(name,args).then(data=>({data,error:null}),error=>({data:null,error}));result.abortSignal=()=>result;return result;}
};
export async function rpc(name,args){
 if(!navigator.onLine)throw Error('Offline transport');
 if(name==='project_attendance_policy')return policy;
 if(name==='attendance_workspace'){const s=state();return{rows:s.rows,count:s.rows.length,summary:{open:s.rows.filter(r=>r.status==='open').length},can_manage:false};}
 if(name==='start_assignment_work_session'||name==='checkout_assignment_work_session'){
  if(localStorage.getItem('fixture-reject'))throw Object.assign(Error('Assignment access revoked; evidence retained'),{code:'P0001'});
  const s=state();if(s.requests.includes(args.p_request))return{id:'session',version:1};s.requests.push(args.p_request);
  if(name==='start_assignment_work_session')s.rows=[{id:'session',assignment_id:args.p_assignment,project_id:'project',project_title:'Offline pilot',organization_name:'Pilot NGO',status:'open',version:1,check_in_captured_at:args.p_captured_at,effective_check_in_at:args.p_captured_at,effective_check_out_at:null,duration_minutes:null,check_in_accuracy_m:null,check_out_accuracy_m:null,check_in_latitude:null,check_in_longitude:null,check_out_latitude:null,check_out_longitude:null}];
  else s.rows=s.rows.map(r=>({...r,status:'submitted',version:2}));save(s);return{id:'session',version:1};
 }
 throw Error('Unexpected fixture RPC '+name);
}
