import React from 'react';import{createRoot}from'react-dom/client';import{SurveyProjectDetail}from'../../../src/features/surveys/SurveyProjectDetail';
import '../../../src/style.css';
window.rpcCalls=[];
const manager=new URLSearchParams(location.search).has('manager');
createRoot(document.getElementById('root')).render(<SurveyProjectDetail project={{id:'project',title:'Consent fixture',template_id:'template',organization_id:'org',geography_id:'area',status:'active',moderation_status:'allowed',start_date:'2026-01-01',end_date:'2027-01-01',target:100,purpose:'Fixture purpose',consent_notice:'Fixture notice'}} userId={manager?'manager':'worker'} workspaceMode="field-work" manage={false} review={manager} manageAssignments={manager} geographies={[{id:'area',name:'Project area',kind:'province',active:true,parent_id:null}]} back={()=>{}} openRecruitment={()=>window.recruitmentOpened=true}/>);
