import type {Database} from '../../lib/supabase/database.types';
type Functions=Database['public']['Functions'];
type Name='record_organization_funding'|'reserve_project_funding'|'release_project_funding';
export type FundingRequest = {[N in Name]:{name:N;args:Functions[N]['Args'];organization:string;userId:string;uncertain:boolean}}[Name];
export type FundingResult={state:'success'|'rejected'|'uncertain';message:string};
export async function executeFundingRequest(
 request:FundingRequest,
 send:(request:FundingRequest)=>Promise<unknown>,
 lookup:(request:FundingRequest)=>Promise<boolean>,
):Promise<FundingResult>{
 try{
  // A retry may fail current balance checks before the backend's idempotency check.
  if(request.uncertain && await lookup(request))return {state:'success',message:'Funding operation confirmed in the journal.'};
  await send(request);
  return {state:'success',message:'Funding operation confirmed.'};
 }catch(error){
  const code=(error as {code?:string})?.code;
  // A later rejection cannot disprove an earlier uncertain commit.
  if(!request.uncertain && ['P0001','23514','42501','22003','22P02'].includes(code||'')){
   const message=String((error as {message?:string}).message||'');
   return {state:'rejected',message:/insufficient|exceeds.*reserved/i.test(message)
    ?'Funding was not recorded. Check the available or reserved balance and adjust the amount.'
    :/permission|administration|access/i.test(message)
     ?'Funding was not recorded. Your current account does not have permission for this operation.'
     :'Funding was not recorded. Check the amount, currency, required note and current project status before submitting again.'};
  }
  return {state:'uncertain',message:'The outcome could not be confirmed. Your original amount, details and request ID are retained. Use Retry same request; do not submit a replacement operation.'};
 }
}
const storageKey=(userId:string)=>'fieldlance:funding-request:'+userId;
export function readFundingRequest(userId:string):FundingRequest|null{
 const saved=sessionStorage.getItem(storageKey(userId));if(!saved)return null;
 const parsed=JSON.parse(saved) as FundingRequest;
 if(parsed.userId!==userId||!['record_organization_funding','reserve_project_funding','release_project_funding'].includes(parsed.name)||!parsed.args?.p_idempotency_key)throw Error('Pending funding request needs review.');
 return parsed;
}
export function retainFundingRequest(request:FundingRequest){
 // Persist BEFORE sending, so reload/navigation cannot manufacture a replacement key.
 sessionStorage.setItem(storageKey(request.userId),JSON.stringify({...request,uncertain:true}));
}
export function clearFundingRequest(userId:string){sessionStorage.removeItem(storageKey(userId))}
