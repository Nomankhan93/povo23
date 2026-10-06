import type {Json} from '../../lib/supabase/database.types';
import type {Question} from './model';

// Templates have ordered questions but no section metadata. Group presentation only;
// keep IDs, order, visibility, answers and submission payloads unchanged.
export function surveyQuestionSections(questions:Question[]){
  return Array.from({length:Math.ceil(questions.length/4)},(_,i)=>({
    id:'questions-'+i,
    title:'Questions '+(i*4+1)+'–'+Math.min((i+1)*4,questions.length),
    questions:questions.slice(i*4,i*4+4),
  }));
}

// Mirrors the existing SQL age rule for disclosure only. The RPC stays authoritative.
// Unknown/unavailable registry age remains conservative; household member ages count too.
export function representativeNeeded(birth:string|null|undefined,questions:Question[],answers:Record<string,Json>,today=new Date()){
  const year=today.getUTCFullYear()-18,month=today.getUTCMonth();
  const day=Math.min(today.getUTCDate(),new Date(Date.UTC(year,month+1,0)).getUTCDate());
  const threshold=new Date(Date.UTC(year,month,day)).toISOString().slice(0,10);
  const needs=(value:unknown)=>typeof value!=='string'||!value||value>threshold;
  return needs(birth)||questions.some(q=>q.type==='household'&&Array.isArray(answers[q.id])&&
    (answers[q.id] as Json[]).some(member=>needs(member&&typeof member==='object'&&!Array.isArray(member)?member.birth_date:null)));
}
