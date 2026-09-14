import {db,rpc} from '../../lib/supabase/client';
import type {Database,Json} from '../../lib/supabase/database.types';
import {validateFile} from '../../lib/files/validateFile';
import {assertOwner,getFieldRecord,fieldRecords,putFieldRecord,putFieldRecords,deleteFieldRecord,fieldInventory} from './offlineSurveyStore';
import {resumeTus} from './tusUpload';
export type LocalAttachment={id:string;project:string;question:string;filename:string;mime:string;size:number;consent:Json;url?:string;offset:number;state:'saved locally'|'uploading'|'uploaded'|'failed';error:string};
type SaveArgs=Database['public']['Functions']['save_survey_response']['Args'];
const bytes64=(bytes:Uint8Array)=>{let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s)};
const from64=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export async function stageAttachment(owner:string,project:string,question:string,file:File,consent:Json,photo:boolean) {
 await assertOwner(owner);
 const c=consent as Record<string,Json>;
 if(c.agreed!==true||!['adult_subject','representative'].includes(String(c.capture_authority)))throw Error('Record consent and attachment authority before capture');
 if(c.capture_authority==='representative'&&(String(c.representative||'').trim().length<2||String(c.relationship||'').trim().length<2))throw Error('Enter guardian/representative name and relationship first');
 const mime=await validateFile(file);if(photo&&mime==='application/pdf')throw Error('Photo requires JPG or PNG');
 const estimate=await navigator.storage?.estimate?.();
 if(estimate?.quota&&estimate.quota-(estimate.usage||0)<file.size*3+1048576)throw Error('Device storage is too low. Free space or sync and clean acknowledged data before capture');
 const existing=await fieldRecords<LocalAttachment>(owner,'attachment');
 if(existing.reduce((n,r)=>n+r.value.size,0)+file.size>50*1024*1024)throw Error('50 MiB device attachment limit reached. Sync and clean acknowledged copies first');
 const id=crypto.randomUUID(),bytes=new Uint8Array(await file.arrayBuffer());
 const metadata:LocalAttachment={id,project,question,filename:file.name,mime,size:file.size,consent,offset:0,state:'saved locally',error:''};
 await putFieldRecords(owner,[{kind:'attachment',key:id,value:metadata},{kind:'attachment-bytes',key:id,value:bytes64(bytes)}]);
 return `local-file:${id}`;
}
export async function uploadAttachment(owner:string,id:string) {
 const file=await getFieldRecord<LocalAttachment>(owner,'attachment',id);if(!file)throw Error('Device attachment is missing; original survey retained');
 await assertOwner(owner);
 const save=()=>putFieldRecord(owner,'attachment',id,file);
 try{
   // Confirm acknowledged objects before trying another TUS URL.
   if(await rpc('offline_capture_upload_complete',{p_id:id})){file.state='uploaded';file.offset=file.size;file.error='';await save();return id}
   await rpc('reserve_offline_capture_file',{p_id:id,p_project:file.project,p_question:file.question,p_filename:file.filename,p_mime:file.mime,p_size:file.size,p_consent:file.consent});
   const stored=await getFieldRecord<string>(owner,'attachment-bytes',id);if(!stored)throw Error('Encrypted attachment bytes are missing; retain the survey and recover the original file');
   file.state='uploading';file.error='';await save();
   await resumeTus({endpoint:import.meta.env.VITE_SUPABASE_URL.replace(/\/$/,'')+'/storage/v1/upload/resumable',objectName:id,mime:file.mime,bytes:from64(stored),url:file.url,
     token:async()=>{await assertOwner(owner);const {data,error}=await db!.auth.getSession();if(error||!data.session||data.session.user.id!==owner)throw Error('Sign in as the attachment owner');return data.session.access_token},
     saveUrl:async url=>{file.url=url;await save()},progress:async offset=>{file.offset=offset;await save()}});
   if(!await rpc('offline_capture_upload_complete',{p_id:id}))throw Error('Waiting for server attachment confirmation; retry original upload');
   file.state='uploaded';file.error='';await save();return id;
 }catch(e){file.state='failed';file.error=(e as Error).message||'Attachment upload failed';await save();throw e}
}
export async function prepareSurveyAttachments(owner:string,args:SaveArgs):Promise<SaveArgs> {
 const answers={...args.p_answers as Record<string,Json>};
 for(const [key,value] of Object.entries(answers))if(typeof value==='string'&&value.startsWith('local-file:')){
   const id=value.slice(11),file=await getFieldRecord<LocalAttachment>(owner,'attachment',id);
   if(!file||file.project!==args.p_project||file.question!==key)throw Object.assign(Error('Attachment belongs to different question/project; recover for editing'),{code:'P0001'});
   answers[key]=await uploadAttachment(owner,id);
 }
 return {...args,p_answers:answers};
}
export async function reconsentAttachments(owner:string,answers:Record<string,Json>,consent:Json) {
 const result={...answers};
 for(const [key,value] of Object.entries(result))if(typeof value==='string'){
   const id=value.startsWith('local-file:')?value.slice(11):value;
   const old=await getFieldRecord<LocalAttachment>(owner,'attachment',id);if(!old)continue;
   const bytes=await getFieldRecord<string>(owner,'attachment-bytes',id);if(!bytes)throw Error('Original file bytes unavailable for renewed consent');
   result[key]=await stageAttachment(owner,old.project,old.question,new File([from64(bytes)],old.filename,{type:old.mime}),{...consent as Record<string,Json>,capture_authority:(old.consent as Record<string,Json>).capture_authority},old.mime!=='application/pdf');
 }
 return result;
}
export async function cleanupAcknowledgedAttachments(owner:string) {
 // Conservative: retain all files while any unsynchronized survey or draft exists.
 const inventory=await fieldInventory(owner);
 if(inventory.queue.length||inventory.drafts.length)throw Error('Finish or explicitly resolve all drafts and queued surveys before attachment cleanup');
 for(const row of await fieldRecords<LocalAttachment>(owner,'attachment'))if(row.value.state==='uploaded'){
   await deleteFieldRecord(owner,'attachment-bytes',row.key);await deleteFieldRecord(owner,'attachment',row.key);
 }
}
