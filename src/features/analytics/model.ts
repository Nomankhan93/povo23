export type ReportSelection = {kind: string; status?: string};
export type ReportRow = {id: string; kind: string; label: string; project_id: string | null; project_name: string | null; organization_name: string | null; geography_name: string | null; status: string; created_at: string; due_on: string | null; amount: string | null; currency: string | null};
export type OperationalReport = {allowed_kinds: string[]; as_of: string; timezone: string; counts: Record<string,number>; totals: Record<string,number>; active_workers: number; due_cases: number; withdrawal_attention?: number | null; total: number; offset: number; rows: ReportRow[]; trend: {month:string;state:string;n:number}[]; money: {currency:string;state:string;amount:string}[]};
export const reportLabels: Record<string,string> = {projects:'Projects', responses:'Survey responses', applications:'Applications', assignments:'Assignments', opportunities:'Opportunities', cases:'Cases', assistance:'Assistance delivery', payables:'Payable eligibility', finance:'Payable journal', organizations:'Organizations', organization_applications:'Organization applications', profiles:'Field Worker profiles'};
export const reportCount = (data: OperationalReport | null, kind: string, state?: string): number => state ? data?.counts[`${kind}.${state}`] || 0 : data?.totals[kind] || 0;
export function csvCell(value: unknown): string {
  let text=String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
export function reportCSV(rows: ReportRow[]): string {
  const keys: (keyof ReportRow)[]=['id','kind','label','organization_name','project_name','geography_name','status','created_at','due_on','currency','amount'];
  return '\ufeff'+[keys.map(csvCell).join(','),...rows.map(row=>keys.map(key=>csvCell(row[key])).join(','))].join('\r\n');
}
