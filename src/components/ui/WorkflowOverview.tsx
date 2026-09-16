import type {ReactNode} from 'react';
export const navigationGroups = [
  {label:'Workspace',pages:['Overview','My profile','Work experience','Private documents']},
  {label:'People & partners',pages:['Volunteers','Partner NGO application','NGO applications','Partner NGOs','Workforce marketplace','Available Opportunities','My Applications','My Assigned Surveys','Invitations','Workforce payables']},
  {label:'Field operations',pages:['Survey projects','Survey templates','Verification','Canonical registry','Project governance','Data sharing']},
  {label:'Administration',pages:['Memberships','Accounts','Geography','Notifications','Activity']},
];
export function StatusBadge({children,tone='neutral'}:{children:ReactNode;tone?:'neutral'|'success'|'warning'}){
 return <span className={`status-pill status-${tone}`}>{children}</span>;
}
export function EmptyState({children}:{children:ReactNode}){return <p className="empty-state">{children}</p>}
export function WorkflowOverview({staff,personal,profileStatus,unread,allowed,onNavigate,onField}:{staff:boolean;personal:boolean;profileStatus:string;unread:number;allowed:readonly string[];onNavigate:(page:string)=>void;onField:()=>void}){
 const tasks=personal?[
  ['My profile','Your volunteer profile','Update your skills, availability and sharing preferences.'],
  ['Survey projects','Your survey work','Open projects and continue assigned field work.'],
  ['Workforce payables','Your earnings','View pending claims, approved amounts and payment history.'],
  ['Invitations','Work invitations','Review invitations and choose your next assignment.'],
  ['Partner NGO application','Represent an NGO','Apply for a Partner NGO workspace using your existing personal POEM account.']
 ]:[
  ['Survey projects','Survey operations','Open projects, assignments and survey responses.'],
  ['Verification','Review work','Open the verification workspace for available reviews.'],
  ['Volunteers','Volunteer network','Find profiles available to your workspace.'],
  ['Canonical registry','Beneficiary registry','Review identities and resolve possible matches.'],
  ['Workforce payables','Workforce accounting','Review work claims and record approved payments.'],
  ['Partner NGOs','Partner organizations','Open partner records and organization operations.']
 ];
 return <>
  <section className="workspace-summary" aria-label="Workspace summary">
   <div><span className="eyebrow">YOUR WORKSPACE</span><h2>{staff?'POEM operations':personal?'Ready for your next assignment?':'NGO operations'}</h2><p>{personal?'Published profile changes go live immediately. Admin approval is not required.':'Choose an action below. Available records and actions depend on your role and workspace.'}</p></div>
   <div className="summary-metrics"><div><span>Unread notifications</span><strong>{unread}</strong><button className="link" onClick={()=>onNavigate('Notifications')}>Open notifications</button></div>{personal&&<div><span>Profile status</span><StatusBadge>{profileStatus}</StatusBadge></div>}</div>
  </section>
  <section aria-label="Workspace actions" className="workflow-grid">{tasks.filter(([page])=>allowed.includes(page)).map(([page,title,description])=><article className="workflow-card" key={page}><h3>{title}</h3><p>{description}</p><button className="secondary" onClick={()=>onNavigate(page)}>Open {page.toLowerCase()} <span aria-hidden="true">→</span></button></article>)}<article className="workflow-card field-card"><span className="eyebrow">ON YOUR DEVICE</span><h3>Field workspace</h3><p>Download assigned projects, continue device drafts and check synchronization.</p><button className="primary" onClick={onField}>Open offline field</button></article></section>
 </>;
}
