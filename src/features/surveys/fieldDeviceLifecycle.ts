import {assertOwner,fieldInventory,fieldRecords,eraseOwnerFieldData,clearFieldReceipts} from './offlineSurveyStore';
import {attendanceInventory,eraseAttendanceDeviceData,clearAttendanceReceipts} from '../workforce/attendanceOfflineStore';
import {cleanupAcknowledgedAttachments,type LocalAttachment} from './fieldAttachments';
import {flushActiveDraft} from './activeDraft';

export async function deviceInventory(ownerId:string){
  await assertOwner(ownerId);
  const [surveys,attendance]=await Promise.all([fieldInventory(ownerId),attendanceInventory(ownerId)]);
  let attachments:Awaited<ReturnType<typeof fieldRecords<LocalAttachment>>>;
  try{attachments=await fieldRecords<LocalAttachment>(ownerId,'attachment');}catch{
    attachments=surveys.records.filter(r=>r.kind==='attachment').map(r=>({key:r.key,updatedAt:r.updatedAt,value:{id:r.key,project:'',question:'',filename:'Unreadable attachment '+r.key,mime:'',size:0,offset:0,consent:{},state:'failed',error:'Could not decrypt this copy; keep device data or explicitly erase after recovery.'}}));
  }
  const downloads=surveys.records.filter(r=>r.kind==='bundle').length;
  await assertOwner(ownerId);
  const unsynced={drafts:surveys.drafts.length,surveys:surveys.queue.length,attendance:attendance.filter(r=>r.status!=='synced').length,attachments:attachments.filter(r=>r.value.state!=='uploaded').length};
  return{surveys,attendance,attachments,downloads,unsynced};
}
export function eraseConfirmation(inventory:Awaited<ReturnType<typeof deviceInventory>>){
  const n=inventory.unsynced;
  return `Permanently erase this account's device data? Unsynced: ${n.drafts} drafts, ${n.surveys} surveys, ${n.attendance} attendance records and ${n.attachments} attachments. Downloaded references and local receipts will also be removed. An in-flight request may already have reached the server; server records are unchanged. Close other field tabs first. Type ERASE to confirm.`;
}
export async function eraseDeviceData(ownerId:string){
  await flushActiveDraft();await assertOwner(ownerId);
  const marker='fieldlance-device-erasing:'+ownerId;
  window.localStorage.setItem(marker,String(Date.now()));
  window.localStorage.setItem('fieldlance-device-generation:'+ownerId,crypto.randomUUID());
  try{
    // Independent databases cannot share a transaction. On failure retain a visible error and allow retry.
    await eraseAttendanceDeviceData(ownerId);
    await eraseOwnerFieldData(ownerId);
  }catch(error){throw new Error('Device cleanup was incomplete. Remaining copies are retained; retry cleanup. '+(error as Error).message);}
  finally{window.localStorage.removeItem(marker);window.dispatchEvent(new Event('poem:survey-queue-change'));}
}
export async function cleanDeviceReceipts(ownerId:string){
  await cleanupAcknowledgedAttachments(ownerId);await clearAttendanceReceipts(ownerId);await clearFieldReceipts(ownerId);
}
