import {assertOwner,fieldGeneration,assertFieldGeneration} from "../surveys/offlineSurveyStore";
import {rpc} from "../../lib/supabase/client";

type JsonObject = Record<string, unknown>;
type Cipher = {iv:string;data:string};
type Stored = {id:string;ownerId:string;assignmentId:string;createdAt:number;updatedAt:number;cipher:Cipher;state?:"pending"|"syncing"|"failed";error?:string;syncingAt?:number;attempts?:number};

export type AttendanceStartPayload = {
  p_assignment:string;
  p_captured_at:string;
  p_latitude:number|null;
  p_longitude:number|null;
  p_accuracy_m:number|null;
  p_permission_state:string;
  p_location_note:string;
  p_request:string;
};
export type AttendanceCheckoutPayload = {
  p_session:string;
  p_captured_at:string;
  p_latitude:number|null;
  p_longitude:number|null;
  p_accuracy_m:number|null;
  p_permission_state:string;
  p_location_note:string;
  p_worker_note:string;
  p_request:string;
  p_version:number;
};
type PendingPayload = {
  assignmentId:string;
  start?:AttendanceStartPayload;
  checkout?:AttendanceCheckoutPayload;
};
export type PendingAttendanceSummary = {id:string;assignmentId:string;hasStart:boolean;hasCheckout:boolean;updatedAt:number};

const DB_NAME="fieldlance-attendance-offline-v1",DB_VERSION=2,KEY_ID="attendance-device-key";
let database:Promise<IDBDatabase>|null=null;
function request<T>(value:IDBRequest<T>){return new Promise<T>((resolve,reject)=>{value.onsuccess=()=>resolve(value.result);value.onerror=()=>reject(value.error||new Error("Attendance device storage failed"));});}
function done(tx:IDBTransaction){return new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error("Attendance storage transaction failed"));tx.onabort=()=>reject(tx.error||new Error("Attendance storage transaction aborted"));});}
function openDb(){if(database)return database;if(!("indexedDB" in window))return Promise.reject(new Error("Encrypted attendance storage is unavailable"));database=new Promise((resolve,reject)=>{const o=indexedDB.open(DB_NAME,DB_VERSION);o.onupgradeneeded=()=>{const db=o.result;if(!db.objectStoreNames.contains("keys"))db.createObjectStore("keys",{keyPath:"id"});if(!db.objectStoreNames.contains("queue"))db.createObjectStore("queue",{keyPath:"id"});if(!db.objectStoreNames.contains("receipts"))db.createObjectStore("receipts",{keyPath:"id"});};o.onblocked=()=>{database=null;reject(new Error("Close other FieldLance tabs to upgrade attendance storage"));};o.onsuccess=()=>{o.result.onversionchange=()=>{o.result.close();database=null;};resolve(o.result);};o.onerror=()=>{database=null;reject(o.error||new Error("Could not open attendance storage"));};});return database;}
function b64(bytes:Uint8Array){let s="";for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s);}
function bytes(value:string){const s=atob(value),out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;}
async function key(){if(!crypto.subtle)throw new Error("Secure browser encryption is unavailable");const db=await openDb();const rtx=db.transaction("keys","readonly"),found=await request(rtx.objectStore("keys").get(KEY_ID)) as {id:string;key:CryptoKey}|undefined;await done(rtx);if(found?.key)return found.key;const k=await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);const tx=db.transaction("keys","readwrite"),store=tx.objectStore("keys"),winner=await request(store.get(KEY_ID)) as {id:string;key:CryptoKey}|undefined;if(!winner)store.add({id:KEY_ID,key:k});await done(tx);return winner?.key||k;}
async function encrypt(value:unknown):Promise<Cipher>{const k=await key(),iv=crypto.getRandomValues(new Uint8Array(12)),plain=new TextEncoder().encode(JSON.stringify(value)),data=await crypto.subtle.encrypt({name:"AES-GCM",iv},k,plain);return{iv:b64(iv),data:b64(new Uint8Array(data))};}
async function decrypt<T>(cipher:Cipher):Promise<T>{const k=await key(),plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:bytes(cipher.iv)},k,bytes(cipher.data));return JSON.parse(new TextDecoder().decode(plain)) as T;}
function id(ownerId:string,assignmentId:string){return `${ownerId}:${assignmentId}`;}
function changed(){window.dispatchEvent(new Event("fieldlance:attendance-queue-change"));}
async function read(ownerId:string,assignmentId:string){const db=await openDb(),tx=db.transaction("queue","readonly"),row=await request(tx.objectStore("queue").get(id(ownerId,assignmentId))) as Stored|undefined;await done(tx);if(!row||row.ownerId!==ownerId)return null;return{row,payload:await decrypt<PendingPayload>(row.cipher)};}
// Encrypt before opening the transaction: WebCrypto yields beyond IDB's active task.
async function write(ownerId:string,assignmentId:string,payload:PendingPayload,previous?:Stored){
  const generation=fieldGeneration(ownerId);
  const cipher=await encrypt(payload);await assertOwner(ownerId);assertFieldGeneration(ownerId,generation);
  const db=await openDb(),tx=db.transaction("queue","readwrite"),completed=done(tx),store=tx.objectStore("queue");
  const current=await request(store.get(id(ownerId,assignmentId))) as Stored|undefined;
  if(current?.cipher.data!==previous?.cipher.data){await completed;throw new Error("Pending attendance changed in another tab; refresh before retrying");}
  store.put({id:id(ownerId,assignmentId),ownerId,assignmentId,createdAt:previous?.createdAt??Date.now(),updatedAt:Date.now(),cipher,state:"pending",error:"",attempts:previous?.attempts||0} satisfies Stored);
  await completed;changed();
}
async function remove(ownerId:string,row:Stored,sessionId:string){
  await assertOwner(ownerId);const db=await openDb(),tx=db.transaction(["queue","receipts"],"readwrite"),completed=done(tx),store=tx.objectStore("queue");
  const current=await request(store.get(row.id)) as Stored|undefined;
  if(current&&current.cipher.data!==row.cipher.data){await completed;throw new Error("Pending attendance changed during sync; sync again to submit remaining evidence");}
  if(current)tx.objectStore("receipts").put({id:row.id+":"+row.cipher.iv,ownerId,assignmentId:row.assignmentId,sessionId,updatedAt:Date.now(),status:"synced"});
  store.delete(row.id);await completed;changed();
}

export async function queueAttendanceStart(ownerId:string,args:AttendanceStartPayload){
  const generation=fieldGeneration(ownerId);
  await assertOwner(ownerId);const current=await read(ownerId,args.p_assignment);
  if(current){if(JSON.stringify(current.payload.start)===JSON.stringify(args))return;throw new Error("A pending attendance record already exists; sync it before starting again");}
  assertFieldGeneration(ownerId,generation);await write(ownerId,args.p_assignment,{assignmentId:args.p_assignment,start:args});
}
export async function queueAttendanceCheckout(ownerId:string,assignmentId:string,args:AttendanceCheckoutPayload){
  const generation=fieldGeneration(ownerId);
  await assertOwner(ownerId);const current=await read(ownerId,assignmentId);
  if(current?.payload.checkout){if(JSON.stringify(current.payload.checkout)===JSON.stringify(args))return;throw new Error("A pending checkout already exists; sync it before trying again");}
  assertFieldGeneration(ownerId,generation);await write(ownerId,assignmentId,{assignmentId,start:current?.payload.start,checkout:args},current?.row);
}
export async function pendingAttendance(ownerId:string):Promise<PendingAttendanceSummary[]>{
  await assertOwner(ownerId);const db=await openDb(),tx=db.transaction("queue","readonly"),rows=await request(tx.objectStore("queue").getAll()) as Stored[];await done(tx);
  const result:PendingAttendanceSummary[]=[];
  for(const row of rows.filter(r=>r.ownerId===ownerId)){
    let p:PendingPayload;try{p=await decrypt<PendingPayload>(row.cipher);}catch{throw new Error("Saved attendance could not be decrypted; keep this device's data and contact support");}
    result.push({id:row.id,assignmentId:row.assignmentId,hasStart:Boolean(p.start),hasCheckout:Boolean(p.checkout),updatedAt:row.updatedAt});
  }
  await assertOwner(ownerId);return result.sort((a,b)=>a.updatedAt-b.updatedAt);
}

export type AttendanceDeviceRecord = PendingAttendanceSummary & {status:"pending"|"syncing"|"failed"|"synced";error:string;sessionId?:string};
async function allRows(){const db=await openDb(),tx=db.transaction("queue","readonly"),completed=done(tx),rows=await request(tx.objectStore("queue").getAll()) as Stored[];await completed;return rows;}
export async function attendanceInventory(ownerId:string):Promise<AttendanceDeviceRecord[]>{
  await assertOwner(ownerId);const rows=(await allRows()).filter(row=>row.ownerId===ownerId),out:AttendanceDeviceRecord[]=[];
  for(const row of rows){
    let payload:PendingPayload|undefined,error=row.error||"",status:AttendanceDeviceRecord["status"]=row.state||"pending";
    try{payload=await decrypt<PendingPayload>(row.cipher);}catch{status="failed";error="Saved attendance could not be decrypted. Keep this device's data and contact support.";}
    if(status==="syncing"&&Date.now()-(row.syncingAt||0)>60000)status="pending";
    out.push({id:row.id,assignmentId:row.assignmentId,hasStart:Boolean(payload?.start),hasCheckout:Boolean(payload?.checkout),updatedAt:row.updatedAt,status,error});
  }
  const db=await openDb(),tx=db.transaction("receipts","readonly"),completed=done(tx),receipts=await request(tx.objectStore("receipts").getAll()) as {id:string;ownerId:string;assignmentId:string;sessionId:string;updatedAt:number}[];await completed;
  for(const r of receipts.filter(r=>r.ownerId===ownerId))out.push({id:r.id,assignmentId:r.assignmentId,sessionId:r.sessionId,updatedAt:r.updatedAt,status:"synced",error:"",hasStart:false,hasCheckout:false});
  await assertOwner(ownerId);return out.sort((a,b)=>b.updatedAt-a.updatedAt);
}
async function mark(row:Stored,state:"pending"|"syncing"|"failed",error=""){
  await assertOwner(row.ownerId);const db=await openDb(),tx=db.transaction("queue","readwrite"),completed=done(tx),store=tx.objectStore("queue"),current=await request(store.get(row.id)) as Stored|undefined;
  if(!current||current.cipher.data!==row.cipher.data){await completed;return;}
  store.put({...current,state,error:error.slice(0,1000),syncingAt:state==="syncing"?Date.now():undefined,attempts:(current.attempts||0)+(state==="syncing"?1:0)});await completed;changed();
}
async function syncOnce(ownerId:string,force:boolean){
  await assertOwner(ownerId);const generation=fieldGeneration(ownerId),rows=(await allRows()).filter(r=>r.ownerId===ownerId).sort((a,b)=>a.createdAt-b.createdAt);
  let synced=0;const errors:string[]=[];
  for(const row of rows){
    if(!navigator.onLine)break;
    if(!force&&row.state==="failed")continue;
    try{
      assertFieldGeneration(ownerId,generation);await assertOwner(ownerId);
      await mark(row,"syncing");const payload=await decrypt<PendingPayload>(row.cipher);
      let sessionId=payload.checkout?.p_session||"",version=payload.checkout?.p_version||1;
      if(payload.start){await assertOwner(ownerId);assertFieldGeneration(ownerId,generation);const started=await (rpc as any)("start_assignment_work_session",payload.start) as JsonObject;sessionId=String(started.id||sessionId);version=Number(started.version||version);}
      if(payload.checkout){await assertOwner(ownerId);assertFieldGeneration(ownerId,generation);await (rpc as any)("checkout_assignment_work_session",{...payload.checkout,p_session:sessionId,p_version:version});}
      await assertOwner(ownerId);assertFieldGeneration(ownerId,generation);await remove(ownerId,row,sessionId);synced++;
    }catch(error){
      errors.push(`${row.assignmentId}: ${(error as Error).message}`);
      // An erase/account switch may occur while an RPC is in flight. Never recreate local data.
      try{assertFieldGeneration(ownerId,generation);await mark(row,"failed",(error as Error).message);}catch{break;}
    }
  }
  return{synced,failed:errors.length,errors};
}
const activeSyncs=new Map<string,Promise<{synced:number;failed:number;errors:string[]}>>();
export function syncAttendanceQueue(ownerId:string,force=true){
  const existing=activeSyncs.get(ownerId);if(existing)return existing;
  const run=()=>syncOnce(ownerId,force);
  const pending=(async()=>navigator.locks?await navigator.locks.request('fieldlance-attendance-sync:'+ownerId,run):await run())().finally(()=>activeSyncs.delete(ownerId));
  activeSyncs.set(ownerId,pending);return pending;
}
async function clearOwnerStores(ownerId:string,names:string[],erasing=false){
  await assertOwner(ownerId,erasing);const db=await openDb(),tx=db.transaction(names,"readwrite"),completed=done(tx);
  for(const name of names){const store=tx.objectStore(name),rows=await request(store.getAll()) as {id:string;ownerId:string}[];for(const row of rows)if(row.ownerId===ownerId)store.delete(row.id);}
  await completed;changed();
}
export async function eraseAttendanceDeviceData(ownerId:string){await clearOwnerStores(ownerId,["queue","receipts"],true);}
export async function clearAttendanceReceipts(ownerId:string){await clearOwnerStores(ownerId,["receipts"]);}
