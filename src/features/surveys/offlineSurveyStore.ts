import type { Database, Json } from "../../lib/supabase/database.types";
import { db } from "../../lib/supabase/client";

type SaveArgs = Database["public"]["Functions"]["save_survey_response"]["Args"];

export type SurveyDeviceDraft = {
  person: string;
  household: string;
  name: string;
  birth: string;
  householdLabel: string;
  answers: Record<string, Json>;
  consent: {
    governance_version?: number;
    agreed: boolean;
    method: string;
    representative: string;
    relationship: string;
  };
};

type Cipher = { iv: string; data: string };
type QueueState = "pending" | "needs_attention";
type StoredQueue = {
  id: string;
  ownerId: string;
  projectId: string;
  responseId: string | null;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  nextAttemptAt: number;
  state: QueueState;
  error: string;
  recoveredAt?: number;
  failureKind?: "rejected" | "unreadable";
  cipher: Cipher;
};
type StoredDraft = {
  id: string;
  ownerId: string;
  projectId: string;
  responseId: string | null;
  updatedAt: number;
  cipher: Cipher;
};

export type SurveyQueueSummary = {
  pending: number;
  attention: number;
  total: number;
};

const DB_NAME = "poem-field-store-v1";
const DB_VERSION = 1;
const KEY_ID = "survey-device-key";
let database: Promise<IDBDatabase> | null = null;

function request<T>(value: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error || new Error("Device storage failed"));
  });
}

function transactionDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Device storage transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("Device storage transaction aborted"));
  });
}

function openDatabase() {
  if (database) return database;
  if (!("indexedDB" in window))
    return Promise.reject(new Error("Encrypted device storage is unavailable in this browser"));
  database = new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const value = open.result;
      if (!value.objectStoreNames.contains("keys")) value.createObjectStore("keys", { keyPath: "id" });
      if (!value.objectStoreNames.contains("drafts")) value.createObjectStore("drafts", { keyPath: "id" });
      if (!value.objectStoreNames.contains("queue")) value.createObjectStore("queue", { keyPath: "id" });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error || new Error("Could not open encrypted device storage"));
  });
  return database;
}

function toBase64(bytes: Uint8Array) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

function fromBase64(value: string) {
  const text = atob(value);
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
  return out;
}

async function deviceKey() {
  if (!window.crypto?.subtle)
    throw new Error("Secure browser encryption is unavailable; online save is required");
  const value = await openDatabase();
  const readTx = value.transaction("keys", "readonly");
  const found = (await request(readTx.objectStore("keys").get(KEY_ID))) as
    | { id: string; key: CryptoKey }
    | undefined;
  await transactionDone(readTx);
  if (found?.key) return found.key;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const writeTx = value.transaction("keys", "readwrite");
  // IDB serializes readwrite transactions across tabs. Recheck inside the
  // same transaction as insertion; never overwrite another writer's key.
  const done = transactionDone(writeTx);
  const keys = writeTx.objectStore("keys");
  const winner = await request(keys.get(KEY_ID)) as { key: CryptoKey } | undefined;
  if (!winner?.key) keys.add({ id: KEY_ID, key });
  await done;
  return winner?.key || key;
}

async function encrypt(value: unknown): Promise<Cipher> {
  const key = await deviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(encrypted)) };
}

async function decrypt<T>(cipher: Cipher): Promise<T> {
  const key = await deviceKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(cipher.iv) },
    key,
    fromBase64(cipher.data),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

function draftId(ownerId: string, projectId: string, responseId: string | null) {
  return `${ownerId}:${projectId}:${responseId || "new"}`;
}
function queueId(ownerId: string, requestId: string) {
  return `${ownerId}:${requestId}`;
}
function changed() {
  window.dispatchEvent(new Event("poem:survey-queue-change"));
}

export async function saveSurveyDeviceDraft(
  ownerId: string,
  projectId: string,
  responseId: string | null,
  payload: SurveyDeviceDraft,
) {
  const value = await openDatabase();
  const cipher = await encrypt(payload);
  const tx = value.transaction("drafts", "readwrite");
  const row: StoredDraft = {
    id: draftId(ownerId, projectId, responseId),
    ownerId,
    projectId,
    responseId,
    updatedAt: Date.now(),
    cipher,
  };
  tx.objectStore("drafts").put(row);
  await transactionDone(tx);
}

export async function loadSurveyDeviceDraft(
  ownerId: string,
  projectId: string,
  responseId: string | null,
) {
  const value = await openDatabase();
  const tx = value.transaction("drafts", "readonly");
  const row = (await request(
    tx.objectStore("drafts").get(draftId(ownerId, projectId, responseId)),
  )) as StoredDraft | undefined;
  await transactionDone(tx);
  if (!row || row.ownerId !== ownerId || row.projectId !== projectId) return null;
  return decrypt<SurveyDeviceDraft>(row.cipher);
}

export async function deleteSurveyDeviceDraft(
  ownerId: string,
  projectId: string,
  responseId: string | null,
) {
  const value = await openDatabase();
  const tx = value.transaction("drafts", "readwrite");
  tx.objectStore("drafts").delete(draftId(ownerId, projectId, responseId));
  await transactionDone(tx);
}

export async function enqueueSurveySave(ownerId: string, args: SaveArgs) {
  if (!args.p_request_id || !args.p_project) throw new Error("Survey request and project IDs are required");
  const requestId = args.p_request_id;
  const projectId = args.p_project;
  const value = await openDatabase();
  const id = queueId(ownerId, requestId);
  const tx0 = value.transaction("queue", "readonly");
  const existing = (await request(tx0.objectStore("queue").get(id))) as StoredQueue | undefined;
  await transactionDone(tx0);
  if (existing) return;
  const cipher = await encrypt(args);
  const now = Date.now();
  const row: StoredQueue = {
    id,
    ownerId,
    projectId,
    responseId: args.p_id,
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    nextAttemptAt: now,
    state: "pending",
    error: "",
    cipher,
  };
  const tx = value.transaction("queue", "readwrite");
  const done = transactionDone(tx);
  const store = tx.objectStore("queue");
  if (!(await request(store.get(id)))) store.add(row);
  await done;
  changed();
}

async function queueRows(ownerId: string) {
  const value = await openDatabase();
  const tx = value.transaction("queue", "readonly");
  const rows = (await request(tx.objectStore("queue").getAll())) as StoredQueue[];
  await transactionDone(tx);
  return rows.filter((row) => row.ownerId === ownerId).sort((a, b) => a.createdAt - b.createdAt);
}

async function putQueue(row: StoredQueue) {
  const value = await openDatabase();
  const tx = value.transaction("queue", "readwrite"), done = transactionDone(tx);
  const store = tx.objectStore("queue");
  // A slower tab must never resurrect a copy another tab already acknowledged.
  const current = await request(store.get(row.id)) as StoredQueue | undefined;
  if (current && !current.recoveredAt) store.put(row);
  await done;
  changed();
}

export async function removeQueuedSurveySave(ownerId: string, requestId: string) {
  const value = await openDatabase();
  const tx = value.transaction("queue", "readwrite");
  tx.objectStore("queue").delete(queueId(ownerId, requestId));
  await transactionDone(tx);
  changed();
}

export async function surveyQueueSummary(ownerId: string): Promise<SurveyQueueSummary> {
  const rows = await queueRows(ownerId);
  const attention = rows.filter((row) => row.state === "needs_attention").length;
  return { total: rows.length, pending: rows.length - attention, attention };
}

async function assertOwner(ownerId: string) {
  if (!db) throw new Error("Supabase is not configured");
  const { data, error } = await db.auth.getSession();
  if (error || data.session?.user.id !== ownerId) throw new Error("Sign in with the survey owner's account first");
}

export async function attentionSurveyCopies(ownerId: string) {
  await assertOwner(ownerId);
  const rows = await queueRows(ownerId);
  return rows.filter(row => row.state === "needs_attention").map(({cipher: _cipher, ...row}) => row);
}

export async function inspectAttentionSurvey(ownerId: string, id: string) {
  await assertOwner(ownerId);
  const row = (await queueRows(ownerId)).find(item => item.id === id && item.state === "needs_attention");
  if (!row) throw new Error("Failed survey copy is no longer available");
  const args = await decrypt<SaveArgs>(row.cipher);
  await assertOwner(ownerId);
  return args;
}

export async function recoverAttentionSurvey(ownerId: string, id: string) {
  await assertOwner(ownerId);
  const row = (await queueRows(ownerId)).find(item => item.id === id && item.state === "needs_attention");
  // Old queue rows do not prove whether the server committed. Retry those
  // with their original request ID instead of creating a replacement.
  if (!row || row.failureKind !== "rejected") throw new Error("Only a confirmed server rejection can be recovered for editing. Retry the original request first.");
  const args = await inspectAttentionSurvey(ownerId, id);
  const consent = args.p_consent as SurveyDeviceDraft["consent"];
  const draft: SurveyDeviceDraft = {
    person: args.p_person || "", household: args.p_household || "",
    name: args.p_name || "", birth: args.p_birth || "", householdLabel: args.p_household_label || "",
    answers: args.p_answers as Record<string, Json>, consent,
  };
  const cipher = await encrypt(draft);
  await assertOwner(ownerId);
  const value = await openDatabase();
  const tx = value.transaction(["drafts", "queue"], "readwrite"), done = transactionDone(tx);
  const queue = tx.objectStore("queue");
  const current = await request(queue.get(id)) as StoredQueue | undefined;
  if (!current || current.state !== "needs_attention" || current.recoveredAt) { await done; throw new Error("This copy has already been recovered or changed. Open its recovery draft instead."); }
  const store = tx.objectStore("drafts"), target = draftId(ownerId,row.projectId,row.responseId);
  const existing = await request(store.get(target));
  if (existing) { await done; throw new Error("An existing device draft must be reviewed or discarded in the survey form first. The failed copy is retained."); }
  store.add({id:target,ownerId,projectId:row.projectId,responseId:row.responseId,updatedAt:Date.now(),cipher});
  queue.put({...current,recoveredAt:Date.now()});
  await done;
  // Keep the rejected source until its owner explicitly discards it.
  changed();
  return { projectId:row.projectId, responseId:row.responseId };
}

export async function retryAttentionSurvey(ownerId: string, id: string) {
  await assertOwner(ownerId);
  const row = (await queueRows(ownerId)).find(item => item.id === id && item.state === "needs_attention");
  if (!row) throw new Error("Failed survey copy is no longer available");
  if (row.recoveredAt) throw new Error("This copy was recovered for editing. Review its draft instead of retrying the old request.");
  await assertOwner(ownerId);
  row.state="pending"; row.nextAttemptAt=0; row.error=""; delete row.failureKind;
  await putQueue(row); // Exact encrypted args and request UUID retained.
}

export async function discardAttentionSurvey(ownerId: string, id: string) {
  await assertOwner(ownerId);
  const value=await openDatabase(), tx=value.transaction("queue","readwrite"), done=transactionDone(tx);
  const store=tx.objectStore("queue"), row=await request(store.get(id)) as StoredQueue | undefined;
  if (row?.ownerId === ownerId && row.state === "needs_attention") store.delete(id);
  await done;
  changed();
}

export function definitiveSurveySaveError(error: { code?: string | null }) {
  return /^(P0001|22\w{3}|23\w{3}|42501|40001|40P01)$/.test(error.code || "");
}

function retryDelay(attempts: number) {
  return Math.min(300_000, 5_000 * 2 ** Math.min(attempts, 6));
}

export async function markQueuedSurveyAttention(
  ownerId: string,
  requestId: string,
  message: string,
) {
  const rows = await queueRows(ownerId);
  const row = rows.find((item) => item.id === queueId(ownerId, requestId));
  if (!row) return;
  row.state = "needs_attention";
  row.failureKind = "rejected";
  row.error = message.slice(0, 1000);
  row.updatedAt = Date.now();
  await putQueue(row);
}

export async function markQueuedSurveyPending(
  ownerId: string,
  requestId: string,
  message: string,
) {
  const rows = await queueRows(ownerId);
  const row = rows.find((item) => item.id === queueId(ownerId, requestId));
  if (!row) return;
  row.state = "pending";
  row.error = message.slice(0, 1000);
  row.attempts += 1;
  row.nextAttemptAt = Date.now() + retryDelay(row.attempts);
  row.updatedAt = Date.now();
  await putQueue(row);
}

export async function syncSurveyQueue(ownerId: string) {
  if (!db || !navigator.onLine) return surveyQueueSummary(ownerId);
  const auth = await db.auth.getUser();
  if (auth.error || auth.data.user?.id !== ownerId) return surveyQueueSummary(ownerId);
  const rows = await queueRows(ownerId);
  for (const row of rows) {
    if (row.state !== "pending" || row.nextAttemptAt > Date.now()) continue;
    try {
      await assertOwner(ownerId);
      let args: SaveArgs;
      try { args = await decrypt<SaveArgs>(row.cipher); }
      catch { row.state="needs_attention"; row.failureKind="unreadable"; row.error="This device copy cannot be decrypted. It has been retained; automatic retry is paused."; await putQueue(row); continue; }
      await assertOwner(ownerId);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      const result = await Promise.resolve(db.rpc("save_survey_response", args).abortSignal(controller.signal)).finally(() => clearTimeout(timer));
      await assertOwner(ownerId);
      if (result.error) {
        if (definitiveSurveySaveError(result.error)) {
          row.state = "needs_attention";
          row.failureKind = "rejected";
          row.error = result.error.message.slice(0, 1000);
          row.updatedAt = Date.now();
          await putQueue(row);
        } else {
          row.error = result.error.message.slice(0, 1000);
          row.attempts += 1;
          row.nextAttemptAt = Date.now() + retryDelay(row.attempts);
          row.updatedAt = Date.now();
          await putQueue(row);
        }
        continue;
      }
      if (!args.p_request_id) throw new Error("Queued survey request ID is missing");
      await removeQueuedSurveySave(ownerId, args.p_request_id);
      window.dispatchEvent(
        new CustomEvent("poem:survey-synced", {
          detail: { projectId: row.projectId, responseId: result.data },
        }),
      );
    } catch (error) {
      await assertOwner(ownerId);
      row.error = ((error as Error).message || "Sync failed").slice(0, 1000);
      row.attempts += 1;
      row.nextAttemptAt = Date.now() + retryDelay(row.attempts);
      row.updatedAt = Date.now();
      await putQueue(row);
    }
  }
  return surveyQueueSummary(ownerId);
}
