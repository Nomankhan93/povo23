import {db} from '../../lib/supabase/client';
import type {Database} from '../../lib/supabase/database.types';

type Assignment=Database['public']['Tables']['work_assignments']['Row'];
export type ApplicationAssignment=Pick<Assignment,'id'|'source_application_id'|'status'|'survey_project_id'>;
export const currentAssignmentStates=['offered','active','completed'];
export function linkedAssignment(applicationId:string,rows:ApplicationAssignment[]){
  return rows.find(row=>row.source_application_id===applicationId&&currentAssignmentStates.includes(row.status));
}
export function applicationDisplayStatus(status:string,assignment?:ApplicationAssignment){
  return assignment ? ({offered:'Offer sent',active:'Active assignment',completed:'Completed assignment'}[assignment.status]||status) : status;
}

/** Fetch relationships for visible applications, independently of the assignment list's page. */
export async function loadApplicationAssignments(ids:string[]):Promise<ApplicationAssignment[]>{
  const rows:ApplicationAssignment[]=[];
  for(let i=0;i<ids.length;i+=100){
    const result=await db!.from('work_assignments').select('id,source_application_id,status,survey_project_id')
      .in('source_application_id',ids.slice(i,i+100)).in('status',currentAssignmentStates);
    if(result.error)throw result.error;
    rows.push(...(result.data||[]));
  }
  return rows;
}

/** Selected is an application state, not proof that an offer still needs to be sent. */
export async function countReadyForOffer(scope:{userId?:string;organization?:string}){
  let count=0;
  for(let offset=0;;offset+=200){
    let query=db!.from('work_applications').select('id').eq('status','selected').order('id').range(offset,offset+199);
    if(scope.userId)query=query.eq('user_id',scope.userId);
    if(scope.organization)query=query.eq('organization_id',scope.organization);
    const result=await query;if(result.error)throw result.error;
    const rows=result.data||[];
    const assignments=await loadApplicationAssignments(rows.map(row=>row.id));
    count+=rows.filter(row=>!linkedAssignment(row.id,assignments)).length;
    if(rows.length<200)return count;
  }
}
