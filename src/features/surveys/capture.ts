import type { Json } from '../../lib/supabase/database.types';
import type { Question } from './model';
export function visibleAnswers(questions: Question[], answers: Record<string, Json>) {
  const result: Record<string, Json> = {};
  for (const q of questions) {
    if (q.when && result[q.when.question] !== q.when.equals) continue;
    if (Object.hasOwn(answers, q.id)) result[q.id] = answers[q.id];
  }
  return result;
}
export function isVisible(q: Question, answers: Record<string, Json>) {
  return !q.when || answers[q.when.question] === q.when.equals;
}
export function answerText(value: Json | undefined): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
}
export function captureErrors(questions: Question[], raw: Record<string, Json>, submitting: boolean): string[] {
  const answers=visibleAnswers(questions,raw), errors:string[]=[];
  const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
  for(const q of questions){
    if(!isVisible(q,answers))continue;
    const v=answers[q.id], empty=v===undefined||v===null||v===''||(Array.isArray(v)&&!v.length);
    if(empty){if(submitting&&q.required)errors.push(q.label+': answer required');continue}
    const bad=(message:string)=>errors.push(q.label+': '+message);
    if(q.type==='number'&&(typeof v!=='number'||!Number.isFinite(v)||(q.min!==undefined&&v<q.min)||(q.max!==undefined&&v>q.max)))bad('number outside allowed range');
    if(q.type==='phone'&&!/^\+?[0-9]{7,15}$/.test(String(v)))bad('use 7–15 digits, optional leading +');
    if(q.type==='identity'&&!/^[0-9]{13}$/.test(String(v)))bad('use 13 digits');
    if(q.type==='date'&&(!validDate(String(v))||(q.after&&answers[q.after]&&String(v)<String(answers[q.after]))))bad('invalid date or date precedes referenced answer');
    if(q.type==='choice'&&!q.options?.includes(String(v)))bad('choose a listed option');
    if(q.type==='yesno'&&typeof v!=='boolean')bad('choose yes or no');
    if(q.type==='multiple'&&(!Array.isArray(v)||v.some(x=>!q.options?.includes(String(x)))||new Set(v).size!==v.length))bad('choose unique listed options');
    if(q.type==='household'){
      if(!Array.isArray(v)||v.length>30)bad('maximum 30 members');
      else for(const member of v){const m=member as Record<string,Json>;if(!m||typeof m!=='object'||String(m.full_name??'').trim().length<2||String(m.relationship??'').trim().length<2)bad('each member needs a name and relationship');else if(m.birth_date&&(!validDate(String(m.birth_date))||String(m.birth_date)>new Date().toISOString().slice(0,10)))bad('invalid member birth date')}
    }
    if(q.type==='gps'){const m=v as Record<string,Json>;if(!m||typeof m!=='object')bad('capture location or give an unavailable reason');else if('unavailable_reason' in m&&String(m.unavailable_reason??'').trim().length<5)bad('give a reason of at least 5 characters')}
  }
  return errors;
}
