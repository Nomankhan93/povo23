import { useEffect, useState } from 'react';
import type { Json } from '../../lib/supabase/database.types';
import { db, rpc } from '../../lib/supabase/client';
import type { Question } from './model';
import { answerText } from './capture';
import { stageAttachment, type LocalAttachment } from './fieldAttachments';
import {fieldRecords} from './offlineSurveyStore';

export function AttachmentView({ id }: { id: string }) {
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[link,setLink]=useState('');
  useEffect(()=>{if(!link)return;const timer=window.setTimeout(()=>setLink(''),55000);return ()=>window.clearTimeout(timer)},[link]);
  async function view(){setBusy(true);setError('');try{
    const path=await rpc('authorize_survey_capture_view',{p_id:id});
    const r=await db!.storage.from('survey-capture').createSignedUrl(path,60);
    if(r.error)throw r.error;
    setLink(r.data.signedUrl);
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  return <span><button type="button" className="secondary" disabled={busy} onClick={()=>void view()}>Prepare private attachment link</button>{link&&<a href={link} target="_blank" rel="noopener noreferrer">Open attachment (expires in 60 seconds)</a>}{error&&<span role="alert">{error}</span>}</span>;
}
export function CaptureField({q,value,onChange,projectId,consent,onBusy,ownerId}:{ownerId:string;q:Question;value:Json|undefined;onChange:(v:Json)=>void;projectId:string;consent:Json;onBusy:(v:boolean)=>void}){
 const [savedFiles,setSavedFiles]=useState<LocalAttachment[]>([]);
 useEffect(()=>{if(q.type!=='photo'&&q.type!=='document')return;let live=true;const load=()=>{void fieldRecords<LocalAttachment>(ownerId,'attachment').then(rows=>{if(live)setSavedFiles(rows.map(r=>r.value).filter(f=>f.project===projectId&&f.question===q.id))}).catch(e=>{if(live)setError(e.message)})};load();window.addEventListener('poem:survey-queue-change',load);return()=>{live=false;window.removeEventListener('poem:survey-queue-change',load)}},[ownerId,projectId,q.id,q.type]);
 const [error,setError]=useState(''),[working,setWorking]=useState(false),[authority,setAuthority]=useState('');
 async function upload(file:File){setError('');setWorking(true);onBusy(true);try{
   const id=await stageAttachment(ownerId,projectId,q.id,file,{...(consent as Record<string,Json>),capture_authority:authority},q.type==='photo');
   onChange(id);
 }catch(e){setError((e as Error).message)}finally{setWorking(false);onBusy(false)}}
 function gps(){setError('');setWorking(true);onBusy(true);
   const done=()=>{setWorking(false);onBusy(false)};
   if(!navigator.geolocation){setError('Location unavailable. Enter a reason below.');done();return}
   navigator.geolocation.getCurrentPosition(p=>{onChange({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,captured_at:new Date(p.timestamp).toISOString()});done()},e=>{setError(e.message+' — enter a reason or retry.');done()},{enableHighAccuracy:true,timeout:20000,maximumAge:0});
 }
 const label=<legend>{q.label}{q.required?' *':''}</legend>;
 if(q.type==='photo'||q.type==='document')return <fieldset>{label}<p>Private JPG/PNG{q.type==='document'?' or PDF':''}, up to 5 MiB. Obtain consent before capture. Encrypted file bytes are saved on this device before an answer is accepted.</p><label className="field">Who consented to this attachment?<select value={authority} onChange={e=>setAuthority(e.target.value)}><option value="">Choose consent authority</option><option value="adult_subject">Adult subject</option><option value="representative">Guardian / representative named above</option></select></label><input aria-label={q.label} type="file" accept={q.type==='photo'?'image/jpeg,image/png':'image/jpeg,image/png,application/pdf'} capture={q.type==='photo'?'environment':undefined} disabled={working || !authority} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value=''}}/>{savedFiles.length>0&&<label className="field">Recover an existing device file<select value="" onChange={e=>{if(e.target.value)onChange("local-file:"+e.target.value)}}><option value="">Select retained file for this question</option>{savedFiles.map(f=><option key={f.id} value={f.id}>{f.filename} — {f.state} — {f.id.slice(0,8)}</option>)}</select></label>}{working&&<p role="status">Saving encrypted file on this device… keep this form open.</p>}{typeof value==='string'&&value&&<><p>{value.startsWith("local-file:")?"Saved locally — uploads with survey sync":"Uploaded"}</p>{!value.startsWith("local-file:")&&<AttachmentView id={value}/>}<button type="button" onClick={()=>onChange('')}>Remove answer</button></>}{error&&<p role="alert">{error}</p>}</fieldset>;
 if(q.type==='gps')return <fieldset>{label}<button type="button" disabled={working} onClick={gps}>{working?'Locating…':'Capture current location'}</button><pre>{answerText(value)}</pre><label className="field">If unavailable, explain why<input minLength={5} maxLength={300} value={value&&typeof value==='object'&&!Array.isArray(value)?String(value.unavailable_reason??''):''} onChange={e=>onChange(e.target.value?{unavailable_reason:e.target.value}:'')}/></label>{error&&<p role="alert">{error}</p>}</fieldset>;
 if(q.type==='household'){
 const members=(Array.isArray(value)?value:[]) as Record<string,Json>[];
 const update=(index:number,key:string,v:string)=>onChange(members.map((m,i)=>i===index?{...m,[key]:v}:m));
 return <fieldset>{label}<p>Reported members, maximum 30. These answers do not automatically create registry identities.</p>{members.map((m,i)=><fieldset key={i}><legend>Member {i+1}</legend>{(['full_name','birth_date','relationship'] as const).map(key=><label key={key} className="field">{key.replaceAll('_',' ')}<input value={String(m[key]??'')} type={key==='birth_date'?'date':'text'} max={key==='birth_date'?new Date().toISOString().slice(0,10):undefined} maxLength={key==='relationship'?100:200} onChange={e=>update(i,key,e.target.value)}/></label>)}<button type="button" onClick={()=>onChange(members.filter((_,n)=>n!==i))}>Remove member</button></fieldset>)}<button type="button" disabled={members.length>=30} onClick={()=>onChange([...members,{full_name:'',birth_date:'',relationship:''}])}>Add household member</button></fieldset>;
 }
 if(q.type==='multiple')return <fieldset>{label}{q.options?.map(o=><label className="checklabel" key={o}><input type="checkbox" checked={Array.isArray(value)&&value.includes(o)} onChange={e=>{const current=Array.isArray(value)?value:[];onChange(e.target.checked?[...current,o]:current.filter(v=>v!==o))}}/>{o}</label>)}</fieldset>;
 if(q.type==='choice'||q.type==='yesno')return <label className="field">{q.label}{q.required?' *':''}<select value={String(value??'')} onChange={e=>onChange(e.target.value===''?'':q.type==='yesno'?e.target.value==='true':e.target.value)}><option value="">Choose answer</option>{(q.type==='yesno'?['true','false']:q.options||[]).map(o=><option key={o} value={o}>{q.type==='yesno'?(o==='true'?'Yes':'No'):o}</option>)}</select></label>;
 return <label className="field">{q.label}{q.required?' *':''}<input type={q.type==='number'?'number':q.type==='date'?'date':q.type==='phone'?'tel':'text'} inputMode={q.type==='identity'?'numeric':undefined} min={q.min} max={q.max} step={q.type==='number'?'any':undefined} maxLength={q.type==='identity'?13:4000} value={String(value??'')} onChange={e=>onChange(q.type==='number'&&e.target.value!==''?Number(e.target.value):e.target.value)}/>{q.type==='identity'&&<small>13 digits, without spaces or dashes.</small>}{q.type==='phone'&&<small>7–15 digits, optional leading +.</small>}</label>;
}
