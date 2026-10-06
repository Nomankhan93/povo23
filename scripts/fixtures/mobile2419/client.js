import {db as base,rpc as original,user,org,project,template,id,tables,projectRow} from '../recruitment2418/client';
export {user,org,project,template,id,tables,projectRow};
export const configured=true;
const questions=[
 {id:'visit',label:'Visit purpose',type:'text',required:true},
 {id:'phone',label:'Contact phone',type:'phone',required:true},
 {id:'barrier',label:'Any access barrier?',type:'yesno',required:false},
 {id:'detail',label:'Describe the access barrier',type:'text',required:true,when:{question:'barrier',equals:true}},
 {id:'services',label:'Services requested',type:'multiple',required:false,options:['Health advice','Transport support','Follow-up visit']},
 {id:'date',label:'Follow-up date',type:'date',required:false},
 {id:'count',label:'Number of visits',type:'number',required:false,min:0,max:10},
 {id:'notes',label:'Additional notes',type:'text',required:false},
];
Object.assign(projectRow,{governance_version:1,governance_notice:'Collect only with consent.',required_volunteers:10});
Object.assign(tables.survey_templates[0],{questions,status:'published'});
tables.notifications=[{id:id(90),user_id:user,title:'Your assignment is active',body:'Continue the community survey.',category:'recruitment',priority:'normal',created_at:new Date().toISOString(),read_at:null,archived_at:null,action_page:'My Assigned Surveys',action_label:'Review assignment',source_kind:'work_assignment',source_ref:id(20),organization_id:org,project_id:project,event_key:'work_assignment_accepted',payload:{assignment_id:id(20)}}];
window.savedSurveys=[];
export async function rpc(name,args){
 if(['notification_center','operational_task_queue','refresh_operational_task_escalations','mark_all_notifications_read','mark_notification_read','save_survey_response'].includes(name)){
  window.rpcCalls.push({name,args:structuredClone(args)});
  if(name==='notification_center')return {items:tables.notifications.filter(row=>args.p_filter!=='unread'||!row.read_at),unread:tables.notifications.filter(row=>!row.read_at).length,total:tables.notifications.length};
  if(name==='operational_task_queue')return {rows:[],count:0};
  if(name==='mark_all_notifications_read'||name==='mark_notification_read'){tables.notifications.forEach(row=>row.read_at=new Date().toISOString());return 1}
  if(name==='save_survey_response'){if(!args.p_consent.agreed)throw {message:'Record informed consent before saving personal information',code:'P0001'};window.savedSurveys.push(structuredClone(args));return id(99)}
  return null;
 }
 return original(name,args);
}
export const db={...base,rpc(name,args){
 const result=Promise.resolve().then(()=>rpc(name,args)).then(data=>({data,error:null}),error=>({data:null,error}));
 result.abortSignal=()=>result;return result;
}};
