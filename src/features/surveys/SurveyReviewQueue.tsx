import {useEffect,useState} from 'react';
import {db} from '../../lib/supabase/client';
import {Badge} from '../../shared/ui/FormFields';
type Row={id:string;project_id:string;status:string;created_at:string};
export function SurveyReviewQueue({onOpen}:{onOpen:(projectId:string,responseId:string)=>void}){
  const [rows,setRows]=useState<Row[]>([]),[titles,setTitles]=useState<Record<string,string>>({});
  const [page,setPage]=useState(0),[more,setMore]=useState(false),[revision,setRevision]=useState(0);
  const [busy,setBusy]=useState(true),[error,setError]=useState('');
  useEffect(()=>{
    let live=true;setBusy(true);setError('');setRows([]);
    void (async()=>{
      const result=await db!.from('survey_responses').select('id,project_id,status,created_at')
        .in('status',['submitted','correction_required']).order('created_at').order('id').range(page*50,page*50+50);
      if(result.error)throw result.error;
      const records=result.data||[],ids=[...new Set(records.map(row=>row.project_id))];
      const projects=ids.length?await db!.from('survey_projects').select('id,title').in('id',ids):{data:[],error:null};
      if(projects.error)throw projects.error;
      if(live){setRows(records.slice(0,50));setMore(records.length>50);setTitles(Object.fromEntries((projects.data||[]).map(row=>[row.id,row.title])))}
    })().catch(()=>{if(live)setError('Survey review queue could not be loaded. Retry to continue.')}).finally(()=>{if(live)setBusy(false)});
    return()=>{live=false};
  },[page,revision]);
  return <section className="panel detail"><h2>Survey response review</h2><p>Review submitted survey work or follow responses awaiting correction. Identity verification is a separate process.</p>
    {busy&&<p role="status">Loading survey review queue…</p>}
    {error&&<p role="alert">{error}<button onClick={()=>setRevision(v=>v+1)}>Retry survey review</button></p>}
    {rows.map(row=><article className="document-row" key={row.id}><h3>{titles[row.project_id]||'Survey project'}</h3><Badge value={row.status}/><p>Response {row.id}</p><button className="primary" onClick={()=>onOpen(row.project_id,row.id)}>Review response</button></article>)}
    {!busy&&!error&&!rows.length&&<p>No survey responses need review in your scope.</p>}
    <div className="actions"><button disabled={busy||page===0} onClick={()=>setPage(v=>v-1)}>Previous</button><span>Page {page+1}</span><button disabled={busy||!more} onClick={()=>setPage(v=>v+1)}>Next</button><button disabled={busy} onClick={()=>setRevision(v=>v+1)}>Refresh</button></div>
  </section>;
}
