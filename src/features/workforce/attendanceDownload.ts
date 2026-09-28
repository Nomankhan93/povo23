import {db,rpc} from '../../lib/supabase/client';
import {assertOwner,fieldGeneration,assertFieldGeneration,getFieldRecord,putFieldRecord} from '../surveys/offlineSurveyStore';
import {deviceFreshness} from '../surveys/deviceFreshness';
import type {Assignment,Policy,Workspace} from './AttendanceWorkspace';
export type AttendanceDownload={ownerId:string;downloadedAt:string;validUntil:string;assignments:Assignment[];workspace:Workspace;policies:Record<string,Policy>;blocked?:string};
const kind='attendance-download',key='current';
export const readAttendanceDownload=(ownerId:string)=>getFieldRecord<AttendanceDownload>(ownerId,kind,key);
export const attendanceFreshness=(value:AttendanceDownload)=>deviceFreshness(value.downloadedAt,value.validUntil,value.blocked);
export async function saveAttendanceDownload(ownerId:string,assignments:Assignment[],workspace:Workspace,generation=fieldGeneration(ownerId)){
  await assertOwner(ownerId);
  const policies:Record<string,Policy>={};
  for(const project of new Set(assignments.map(a=>a.survey_project_id).filter(Boolean))){
    const policy=await (rpc as any)('project_attendance_policy',{p_project:project}) as Policy;
    if(policy.project_id!==project)throw Error('Unexpected attendance policy project');
    policies[project!]=policy;
  }
  // A short lease is an offline collection limit, never proof of current server authorization.
  const value:AttendanceDownload={ownerId,assignments,workspace,policies,downloadedAt:new Date().toISOString(),validUntil:new Date(Date.now()+24*60*60*1000).toISOString()};
  assertFieldGeneration(ownerId,generation);await putFieldRecord(ownerId,kind,key,value);return value;
}
export async function downloadAttendance(ownerId:string){
  const generation=fieldGeneration(ownerId);
  if(!navigator.onLine)throw Error('Connect before downloading attendance assignments and policy');
  await assertOwner(ownerId);
  try{
    const a=await db!.from('work_assignments').select('*').eq('user_id',ownerId).eq('status','active').order('start_date').limit(100);
    if(a.error)throw a.error;
    const workspace=await (rpc as any)('attendance_workspace',{p_project:null,p_from:new Date(Date.now()-29*86400000).toISOString().slice(0,10),p_to:new Date().toISOString().slice(0,10),p_status:'open',p_page:0}) as Workspace;
    if(workspace.count>workspace.rows.length)throw Error("Too many open work sessions for an offline download. Review them online first.");
    return await saveAttendanceDownload(ownerId,a.data||[],workspace,generation);
  }catch(error){
    if(['P0001','42501'].includes((error as {code?:string}).code||'')){
      const old=await readAttendanceDownload(ownerId);
      if(old)await putFieldRecord(ownerId,kind,key,{...old,blocked:'Server access denied. Reconnect and refresh before capturing.'});
    }
    throw error;
  }
}

export async function invalidateAttendanceDownload(ownerId:string){const old=await readAttendanceDownload(ownerId);if(old)await putFieldRecord(ownerId,kind,key,{...old,blocked:"Attendance changed. Connect and refresh this download before new captures."});}
