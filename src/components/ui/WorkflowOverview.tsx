import type {ReactNode} from 'react';
export function StatusBadge({children,tone='neutral'}:{children:ReactNode;tone?:'neutral'|'success'|'warning'|'danger'|'info'}){
 return <span className={`status-pill status-${tone}`}>{children}</span>;
}
export function EmptyState({children}:{children:ReactNode}){return <p className="empty-state">{children}</p>}
export function WorkflowOverview({staff,personal,profileStatus,unread,allowed,onNavigate,onField}:{staff:boolean;personal:boolean;profileStatus:string;unread:number;allowed:readonly string[];onNavigate:(page:string)=>void;onField:()=>void}){
 const tasks=personal?[
  ['My profile','Your field worker profile','Update your skills, availability and work preferences.'],
  ['Available Opportunities','Explore opportunities','Find open field assignments that match your interests and availability.'],
  ['My Applications','Your applications','Track the field opportunities you have applied for.'],
  ['My Assigned Surveys','Your assignments','Open accepted work and continue assigned survey activity.'],
  ['Workforce payables','Your earnings','View pending claims, approved amounts and payment history.'],
  ['E-Wallets & withdrawals','Your payout methods','Link JazzCash or Easypaisa, set your transaction PIN and request withdrawals. FieldLance Staff controls mock provider outcomes during development.'],
  ['Invitations','Work invitations','Review invitations and choose your next assignment.'],
  ['Partner NGO application','Organization workspace','Apply for a Partner NGO organization workspace using your existing FieldLance account.']
 ]:[
  ['Survey projects','Survey operations','Open projects, assignments and survey responses.'],
  ['Verification','Review work','Open the verification workspace for available reviews.'],
  ['Volunteers','Field worker network','Find profiles available to your workspace.'],
  ['Workforce marketplace','Recruit field teams','Publish or manage opportunities and review applications.'],
  ['Canonical registry','Beneficiary registry','Review identities and resolve possible matches.'],
  ['Beneficiary cases','Assistance cases','Manage assessed needs, assistance requests and controlled distribution plans.'],
  ['Assistance ledger','Delivered assistance','Review delivered support, plan linkage and voided ledger history.'],
  ['Workforce payables','Workforce accounting','Review work claims and record approved payments.'],
  ['Project funding','Project funding','Reserve verified organization funds for approved projects and review immutable funding movements.'],
  ['Partner NGOs','Organizations','Open partner records and organization operations.']
 ];
 return <>
  <section className="workspace-summary" aria-label="Workspace summary">
   <div><span className="eyebrow">YOUR WORKSPACE</span><h2>{staff?'Operate the field network with confidence.':personal?'Your next opportunity starts here.':'Build the field team your project needs.'}</h2><p>{personal?'Find field work, build verified experience and grow your earnings. Published profile changes go live immediately; Admin approval is not required.':staff?'Review the network, govern access and keep field operations accountable.':'Manage projects, recruitment and field delivery from one accountable organization workspace.'}</p></div>
   <div className="summary-metrics"><div><span>Unread notifications</span><strong>{unread}</strong><button className="link" onClick={()=>onNavigate('Notifications')}>Open notifications</button></div>{personal&&<div><span>Profile status</span><StatusBadge>{profileStatus}</StatusBadge></div>}</div>
  </section>
  <section aria-label="Workspace actions" className="workflow-grid">{tasks.filter(([page])=>allowed.includes(page)).map(([page,title,description])=><article className="workflow-card" key={page}><h3>{title}</h3><p>{description}</p><button className="secondary" onClick={()=>onNavigate(page)}>Open {page.toLowerCase()} <span aria-hidden="true">→</span></button></article>)}<article className="workflow-card field-card"><span className="eyebrow">ON YOUR DEVICE</span><h3>Field workspace</h3><p>Download assigned projects, continue device drafts and check synchronization.</p><button className="primary" onClick={onField}>Open offline field</button></article></section>
 </>;
}
