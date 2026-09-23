import {rpc} from "../../lib/supabase/client";

type JsonObject = Record<string, unknown>;
type Cipher = {iv:string;data:string};
type Stored = {id:string;ownerId:string;assignmentId:string;createdAt:number;updatedAt:number;cipher:Cipher};

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

const DB_NAME="fieldlance-attendance-offline-v1",DB_VERSION=1,KEY_ID="attendance-device-key";
let database:Promise<IDBDatabase>|null=null;
function request<T>(value:IDBRequest<T>){return new Promise<T>((resolve,reject)=>{value.onsuccess=()=>resolve(value.result);value.onerror=()=>reject(value.error||new Error("Attendance device storage failed"));});}
function done(tx:IDBTransaction){return new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error("Attendance storage transaction failed"));tx.onabort=()=>reject(tx.error||new Error("Attendance storage transaction aborted"));});}
function openDb(){if(database)return database;if(!("indexedDB" in window))return Promise.reject(new Error("Encrypted attendance storage is unavailable"));database=new Promise((resolve,reject)=>{const o=indexedDB.open(DB_NAME,DB_VERSION);o.onupgradeneeded=()=>{const db=o.result;if(!db.objectStoreNames.contains("keys"))db.createObjectStore("keys",{keyPath:"id"});if(!db.objectStoreNames.contains("queue"))db.createObjectStore("queue",{keyPath:"id"});};o.onsuccess=()=>resolve(o.result);o.onerror=()=>reject(o.error||new Error("Could not open attendance storage"));});return database;}
function b64(bytes:Uint8Array){let s="";for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s);}
function bytes(value:string){const s=atob(value),out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;}
async function key(){if(!crypto.subtle)throw new Error("Secure browser encryption is unavailable");const db=await openDb();const rtx=db.transaction("keys","readonly"),found=await request(rtx.objectStore("keys").get(KEY_ID)) as {id:string;key:CryptoKey}|undefined;await done(rtx);if(found?.key)return found.key;const k=await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);const tx=db.transaction("keys","readwrite"),store=tx.objectStore("keys"),winner=await request(store.get(KEY_ID)) as {id:string;key:CryptoKey}|undefined;if(!winner)store.add({id:KEY_ID,key:k});await done(tx);return winner?.key||k;}
async function encrypt(value:unknown):Promise<Cipher>{const k=await key(),iv=crypto.getRandomValues(new Uint8Array(12)),plain=new TextEncoder().encode(JSON.stringify(value)),data=await crypto.subtle.encrypt({name:"AES-GCM",iv},k,plain);return{iv:b64(iv),data:b64(new Uint8Array(data))};}
async function decrypt<T>(cipher:Cipher):Promise<T>{const k=await key(),plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:bytes(cipher.iv)},k,bytes(cipher.data));return JSON.parse(new TextDecoder().decode(plain)) as T;}
function id(ownerId:string,assignmentId:string){return `${ownerId}:${assignmentId}`;}
function changed(){window.dispatchEvent(new Event("fieldlance:attendance-queue-change"));}
async function read(ownerId:string,assignmentId:string){const db=await openDb(),tx=db.transaction("queue","readonly"),row=await request(tx.objectStore("queue").get(id(ownerId,assignmentId))) as Stored|undefined;await done(tx);if(!row||row.ownerId!==ownerId)return null;return{row,payload:await decrypt<PendingPayload>(row.cipher)};}
async function write(ownerId:string,assignmentId:string,payload:PendingPayload,createdAt=Date.now()){const db=await openDb(),tx=db.transaction("queue","readwrite");tx.objectStore("queue").put({id:id(ownerId,assignmentId),ownerId,assignmentId,createdAt,updatedAt:Date.now(),cipher:await encrypt(payload)} satisfies Stored);await done(tx);changed();}
async function remove(ownerId:string,assignmentId:string){const db=await openDb(),tx=db.transaction("queue","readwrite");tx.objectStore("queue").delete(id(ownerId,assignmentId));await done(tx);changed();}

export async function queueAttendanceStart(ownerId:string,args:AttendanceStartPayload){const current=await read(ownerId,args.p_assignment);if(current?.payload.checkout)throw new Error("A pending checkout already exists for this assignment");await write(ownerId,args.p_assignment,{assignmentId:args.p_assignment,start:args},current?.row.createdAt);}
export async function queueAttendanceCheckout(ownerId:string,assignmentId:string,args:AttendanceCheckoutPayload){const current=await read(ownerId,assignmentId);await write(ownerId,assignmentId,{assignmentId,start:current?.payload.start,checkout:args},current?.row.createdAt);}
export async function pendingAttendance(ownerId:string):Promise<PendingAttendanceSummary[]>{const db=await openDb(),tx=db.transaction("queue","readonly"),rows=await request(tx.objectStore("queue").getAll()) as Stored[];await done(tx);const result=[] as PendingAttendanceSummary[];for(const row of rows.filter(r=>r.ownerId===ownerId)){try{const p=await decrypt<PendingPayload>(row.cipher);result.push({id:row.id,assignmentId:row.assignmentId,hasStart:Boolean(p.start),hasCheckout:Boolean(p.checkout),updatedAt:row.updatedAt});}catch{/* Unreadable local evidence is intentionally not surfaced as usable. */}}return result.sort((a,b)=>a.updatedAt-b.updatedAt);}

export async function syncAttendanceQueue(ownerId:string){const db=await openDb(),tx=db.transaction("queue","readonly"),rows=await request(tx.objectStore("queue").getAll()) as Stored[];await done(tx);let synced=0;const errors:string[]=[];for(const row of rows.filter(r=>r.ownerId===ownerId).sort((a,b)=>a.createdAt-b.createdAt)){try{const payload=await decrypt<PendingPayload>(row.cipher);let sessionId=payload.checkout?.p_session||"",version=payload.checkout?.p_version||1;if(payload.start){const started=await (rpc as any)("start_assignment_work_session",payload.start) as JsonObject;sessionId=String(started.id||sessionId);version=Number(started.version||version);}
      if(payload.checkout){const checkout={...payload.checkout,p_session:sessionId,p_version:version};await (rpc as any)("checkout_assignment_work_session",checkout);}
      await remove(ownerId,row.assignmentId);synced+=1;
    }catch(error){errors.push(`${row.assignmentId}: ${(error as Error).message}`);}}
  return{synced,failed:errors.length,errors};
}
