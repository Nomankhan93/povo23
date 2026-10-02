import {useEffect,useRef,useState} from 'react';
import {db} from '../../lib/supabase/client';
import type {Database} from '../../lib/supabase/database.types';
type Tables=Database['public']['Tables'];
export type RecruitmentTable='work_applications'|'work_assignments'|'work_opportunities';
export type RecruitmentScope={userId?:string;organization?:string|null;project?:string|null;status?:string|null};
export function recruitmentQuery(table:RecruitmentTable,scope:RecruitmentScope){
 let q=db!.from(table).select('*');
 if(table==='work_opportunities')q=q.not('survey_project_id','is',null);
 if(scope.userId)q=q.filter('user_id','eq',scope.userId);
 if(scope.organization)q=q.eq('organization_id',scope.organization);
 if(scope.project)q=q.eq('survey_project_id',scope.project);
 if(scope.status&&scope.status!=='all')q=q.eq('status',scope.status);
 return q;
}
export function useRecruitmentCollection<T extends RecruitmentTable>(table:T,scope:RecruitmentScope,revision:number,enabled=true){
 type Row=Tables[T]['Row'];
 const key=JSON.stringify([table,scope,revision,enabled]);
 const [data,setData]=useState<{key:string;rows:Row[];more:boolean;busy:boolean;error:string}>({key,rows:[],more:false,busy:true,error:''});
 const latest=useRef(key);latest.current=key;
 const flight=useRef(false);
 async function load(append=false){
  if(!enabled)return;
  const cursor=append&&data.key===key?data.rows.at(-1):null;
  if(append&&flight.current)return;
  flight.current=true;
  setData(old=>({key,rows:append&&old.key===key?old.rows:[],more:append&&old.key===key?old.more:false,busy:true,error:''}));
  try{
   let query=recruitmentQuery(table,scope).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(51);
   if(cursor)query=query.or('created_at.lt.'+cursor.created_at+',and(created_at.eq.'+cursor.created_at+',id.lt.'+cursor.id+')');
   const result=await query;
   if(result.error)throw result.error;
   if(latest.current!==key)return;
   const rows=(result.data||[]) as unknown as Row[];
   setData(old=>({key,rows:[...(append?old.rows:[]),...rows.slice(0,50)].filter((row,index,all)=>all.findIndex(other=>other.id===row.id)===index),more:rows.length>50,busy:false,error:''}));
  }catch{if(latest.current===key)setData(old=>({...old,busy:false,error:'Recruitment records could not be loaded. Retry to continue.'}));}
  finally{if(latest.current===key)flight.current=false}
 }
 useEffect(()=>{latest.current=key;if(enabled)void load();else setData({key,rows:[],more:false,busy:false,error:''});return()=>{latest.current=''}},[key]);
 const current=data.key===key?data:{key,rows:[] as Row[],more:false,busy:enabled,error:''};
 return {...current,loadMore:()=>load(true),retry:()=>load(current.rows.length>0)};
}
