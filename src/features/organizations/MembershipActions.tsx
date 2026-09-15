import {useState} from 'react';
export function MembershipActions({role,status,label,busy,save}:{role:string;status:string;label:string;busy:boolean;save:(role:string,status:string)=>void}){
 const [editing,setEditing]=useState(false),[nextRole,setNextRole]=useState(role);
 function changeStatus(){
  const removing=status==='active';
  if(!window.confirm(`${removing?'Suspend':'Restore'} organization membership for ${label}? ${removing?'This removes permissions granted by this membership. Separately assigned survey access and platform roles are unchanged. The account and history are retained.':'This restores the saved membership role.'}`))return;
  save(role,removing?'suspended':'active');
 }
 return <div className="actions">
 {editing?<><label className="field">Membership role<select disabled={busy} value={nextRole} onChange={e=>setNextRole(e.target.value)}><option value="ngo_admin">NGO admin</option><option value="member">Member</option></select></label><button type="button" disabled={busy||nextRole===role} onClick={()=>{if(window.confirm(`Change ${label} from ${role==='ngo_admin'?'NGO admin':'Member'} to ${nextRole==='ngo_admin'?'NGO admin':'Member'}?`))save(nextRole,status)}}>Save role</button><button type="button" disabled={busy} onClick={()=>{setEditing(false);setNextRole(role)}}>Cancel</button></>:<button type="button" disabled={busy} onClick={()=>setEditing(true)}>Edit role</button>}
 <button type="button" className="secondary" disabled={busy} onClick={changeStatus}>{status==='active'?'Remove membership access':'Restore membership access'}</button>
 </div>;
}
