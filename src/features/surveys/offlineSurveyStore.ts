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
  writeTx.objectStore("keys").put({ id: KEY_ID, key });
  await transactionDone(writeTx);
  return key;
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
  tx.objectStore("queue").put(row);
  await transactionDone(tx);
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
  const tx = value.transaction("queue", "readwrite");
  tx.objectStore("queue").put(row);
  await transactionDone(tx);
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

export async function clearAttentionSurveyCopies(ownerId: string) {
  const rows = await queueRows(ownerId);
  const ids = rows.filter((row) => row.state === "needs_attention").map((row) => row.id);
  if (!ids.length) return;
  const value = await openDatabase();
  const tx = value.transaction("queue", "readwrite");
  for (const id of ids) tx.objectStore("queue").delete(id);
  await transactionDone(tx);
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
      const args = await decrypt<SaveArgs>(row.cipher);
      const result = await db.rpc("save_survey_response", args);
      if (result.error) {
        if (definitiveSurveySaveError(result.error)) {
          row.state = "needs_attention";
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
      row.error = ((error as Error).message || "Sync failed").slice(0, 1000);
      row.attempts += 1;
      row.nextAttemptAt = Date.now() + retryDelay(row.attempts);
      row.updatedAt = Date.now();
      await putQueue(row);
    }
  }
  return surveyQueueSummary(ownerId);
}
