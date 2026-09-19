import type { CaptureInput } from '@workspace/api-client-react';

export interface QueuedCapture {
  id?: number;
  projectId: number;
  externalId: string;
  payload: CaptureInput;
  photoBlobs: Blob[];
  audioBlobs: Blob[];
  status: 'pending' | 'syncing' | 'failed' | 'synced';
  error?: string;
  errorType?: 'network' | 'conflict' | 'validation';
  serverItemIds?: number[];
  createdAt: number;
}

export interface CaptureDraft {
  projectId: number;
  siteId: number;
  crewId: number;
  workDate: string;
  items: Array<{ workTypeId: number; quantity: number; note: string }>;
  photoBlob: Blob | null;
  audioBlob: Blob | null;
  location: { latitude: number; longitude: number } | null;
  updatedAt: number;
}

const DB_NAME = 'FiberOpsFieldDB';
const DB_VERSION = 2;
const STORE_NAME = 'captures';
const DRAFT_STORE_NAME = 'drafts';

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('projectId', 'projectId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('externalId', 'externalId', { unique: true });
      }
      if (!db.objectStoreNames.contains(DRAFT_STORE_NAME)) {
        db.createObjectStore(DRAFT_STORE_NAME, { keyPath: 'projectId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getCaptureDraft(projectId: number): Promise<CaptureDraft | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(DRAFT_STORE_NAME, 'readonly').objectStore(DRAFT_STORE_NAME).get(projectId);
    request.onsuccess = () => resolve(request.result as CaptureDraft | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function putCaptureDraft(draft: CaptureDraft): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE_NAME, 'readwrite');
    tx.objectStore(DRAFT_STORE_NAME).put(draft);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Draft transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('Draft transaction failed'));
  });
}

export async function addCaptureToQueue(capture: Omit<QueuedCapture, 'id'>): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, DRAFT_STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.add(capture);
    let captureId = 0;
    request.onsuccess = () => {
      captureId = request.result as number;
    };
    tx.objectStore(DRAFT_STORE_NAME).delete(capture.projectId);
    tx.oncomplete = () => resolve(captureId);
    tx.onabort = () => reject(tx.error ?? new Error('Queue transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('Queue transaction failed'));
  });
}

export async function getQueuedCaptures(projectId?: number): Promise<QueuedCapture[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      let results = request.result as QueuedCapture[];
      if (projectId !== undefined) {
        results = results.filter(r => r.projectId === projectId);
      }
      resolve(results.sort((a, b) => b.createdAt - a.createdAt));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function updateCaptureStatus(
  id: number,
  status: QueuedCapture['status'],
  error?: string,
  updates: Pick<QueuedCapture, 'errorType' | 'serverItemIds'> = {},
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const record = getReq.result as QueuedCapture;
      if (record) {
        record.status = status;
        record.error = error;
        record.errorType = updates.errorType;
        record.serverItemIds = updates.serverItemIds ?? record.serverItemIds;
        store.put(record);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Queue update transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('Queue update transaction failed'));
  });
}

export async function deleteCapture(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
