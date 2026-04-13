import { openDB } from 'idb';
import { ref } from 'vue';
import { api, OfflineError } from '../api/client.js';

const DB_NAME = 'noted-offline';
const STORE = 'outbox';
const DB_VERSION = 1;

// Kinds map to API calls the outbox knows how to replay.
export const KIND_NOTE = 'note';
export const KIND_TASK = 'task';

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(STORE)) {
      const store = db.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('createdAt', 'createdAt');
    }
  }
});

export const pendingCount = ref(0);
let flushing = false;

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // RFC4122 v4 fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

async function refreshPending() {
  const db = await dbPromise;
  pendingCount.value = await db.count(STORE);
}

export async function enqueue(kind, payload) {
  const db = await dbPromise;
  const row = {
    id: uuid(),
    kind,
    payload: { ...payload, client_id: uuid() },
    createdAt: Date.now(),
    attempts: 0,
    lastError: null
  };
  await db.put(STORE, row);
  await refreshPending();
  return row;
}

export async function list() {
  const db = await dbPromise;
  return db.getAllFromIndex(STORE, 'createdAt');
}

export async function remove(id) {
  const db = await dbPromise;
  await db.delete(STORE, id);
  await refreshPending();
}

async function replayOne(row) {
  if (row.kind === KIND_NOTE) {
    return api.post('/notes', row.payload);
  }
  if (row.kind === KIND_TASK) {
    return api.post('/tasks', row.payload);
  }
  throw new Error(`Unknown outbox kind: ${row.kind}`);
}

/**
 * Flush all queued items. Safe to call repeatedly; concurrent calls no-op.
 * Returns { synced, failed, offline }.
 */
export async function flush() {
  if (flushing) return { synced: 0, failed: 0, offline: false };
  flushing = true;
  let synced = 0;
  let failed = 0;
  let offline = false;
  try {
    const items = await list();
    for (const row of items) {
      try {
        await replayOne(row);
        await remove(row.id);
        synced++;
      } catch (err) {
        if (err instanceof OfflineError) {
          offline = true;
          break; // stop — network is still down
        }
        // Real failure: bump attempts, keep in queue, surface error.
        const db = await dbPromise;
        const fresh = await db.get(STORE, row.id);
        if (fresh) {
          fresh.attempts = (fresh.attempts || 0) + 1;
          fresh.lastError = err.message || String(err);
          await db.put(STORE, fresh);
        }
        failed++;
      }
    }
  } finally {
    flushing = false;
    await refreshPending();
  }
  return { synced, failed, offline };
}

// Initialize pending count on module load.
refreshPending();
