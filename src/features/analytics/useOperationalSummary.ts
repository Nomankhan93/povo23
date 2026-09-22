import {useEffect,useState} from 'react';
import {rpc} from '../../lib/supabase/client';
import {reportCount,type OperationalReport} from './model';
export function useOperationalSummary(organization: string|null, project: string|null, revision=0) {
  const [data,setData]=useState<OperationalReport|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{let live=true;setLoading(true);setData(null);setError('');
    rpc('operational_report',{p_org:organization,p_project:project}).then(value=>{if(live)setData(value as unknown as OperationalReport)}).catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setLoading(false)});
    return()=>{live=false};
  },[organization,project,revision]);
  return {data,error,loading,count:(kind:string,state?:string)=>reportCount(data,kind,state)};
}
