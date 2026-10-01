const accepted=new URLSearchParams(location.search).has('accepted');
export const db={
 from(table){const q={select(){return q},eq(){return q},not(){return q},ilike(){return q},order(){return q},range(){return q},limit(){return q},in(){return q},single(){return q},then(resolve){let data=[];if(table==='survey_templates')data={id:'template',name:'Fixture template',questions:[]};if(table==='survey_assignments')data=[{project_id:'project',user_id:'worker',active:true,collection_geography_id:'area'}];if(table==='work_assignments')data=accepted?[{user_id:'worker',status:'active',responded_at:'2026-09-30'}]:[];return Promise.resolve({data,error:null,count:0}).then(resolve)}};return q},
 rpc(name){if(name!=='can_collect_project')throw Error('Unexpected RPC '+name);return Promise.resolve({data:accepted,error:null})}
};
export async function rpc(name,args){window.rpcCalls.push({name,args});return null;}
