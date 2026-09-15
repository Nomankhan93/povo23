import {useState} from 'react';
import type {Question} from './model';
export function TemplatePreview({questions}:{questions:Question[]}){
 const [answers,setAnswers]=useState<Record<string,string|boolean>>({});
 const visible=new Set<string>();for(const q of questions){if(!q.when||(visible.has(q.when.question)&&answers[q.when.question]===q.when.equals))visible.add(q.id);}
 return <section className="panel"><h3>Form preview</h3><p>Preview only — answers are not saved. GPS, household member entry and file capture use the existing field survey workflow.</p>{questions.filter(q=>visible.has(q.id)).map(q=><label className="field" key={q.id}>{q.label||'Untitled question'}{q.required?' *':''}
 {q.type==='choice'||q.type==='yesno'?<select value={String(answers[q.id]??'')} onChange={e=>setAnswers(a=>({...a,[q.id]:q.type==='yesno'&&e.target.value!==''?e.target.value==='true':e.target.value}))}><option value="">Choose answer</option>{(q.type==='yesno'?['true','false']:q.options||[]).map(o=><option key={o} value={o}>{q.type==='yesno'?(o==='true'?'Yes':'No'):o}</option>)}</select>:q.type==='multiple'?<span>{q.options?.map(o=><label className="checklabel" key={o}><input type="checkbox"/>{o}</label>)}</span>:['gps','household','photo','document'].includes(q.type)?<span>{q.type} field — available during survey collection</span>:<input type={q.type==='number'?'number':q.type==='date'?'date':'text'} min={q.min} max={q.max}/>}
 </label>)}</section>;
}
