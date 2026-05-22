import { ref, shallowRef } from 'vue';
import { dbPromise } from './offlineOutbox.js';

const STORE = 'checkouts';

export const checkoutCount = ref(0);
export const dirtyCount = ref(0);
// Sets of note IDs — used by note-list rows to show an "available offline"
// indicator. shallowRef so reassigning a fresh Set triggers reactivity.
export const cachedNoteIds = shallowRef(new Set());
export const dirtyNoteIds = shallowRef(new Set());

async function refreshCounts() {
  const db = await dbPromise;
  const rows = await db.getAll(STORE);
  checkoutCount.value = rows.length;
  const cached = new Set();
  const dirty = new Set();
  for (const r of rows) {
    cached.add(r.noteId);
    if (r.dirty === 1) dirty.add(r.noteId);
  }
  cachedNoteIds.value = cached;
  dirtyNoteIds.value = dirty;
  dirtyCount.value = dirty.size;
}

export async function createCheckout(note) {
  const db = await dbPromise;
  const now = Date.now();
  const record = {
    noteId: note.id,
    baseVersion: note.updated_at,
    baseContent: note.content || '',
    baseTitle: note.title || '',
    baseTags: Array.isArray(note.tags) ? note.tags.map(t => t.id || t) : [],
    baseNotebookId: note.notebook_id || null,
    localContent: note.content || '',
    localTitle: note.title || '',
    localTags: Array.isArray(note.tags) ? note.tags.map(t => t.id || t) : [],
    localNotebookId: note.notebook_id || null,
    dirty: 0,
    checkedOutAt: now,
    lastEditedAt: null,
    lastSyncAttemptAt: null,
    lastSyncError: null
  };
  await db.put(STORE, record);
  await refreshCounts();
  return record;
}

export async function getCheckout(noteId) {
  if (!noteId) return undefined;
  const db = await dbPromise;
  return db.get(STORE, noteId);
}

export async function hasCheckout(noteId) {
  return !!(await getCheckout(noteId));
}

export async function updateLocal(noteId, patch) {
  const db = await dbPromise;
  const row = await db.get(STORE, noteId);
  if (!row) return null;
  const next = { ...row };
  if ('content' in patch) next.localContent = patch.content;
  if ('title' in patch) next.localTitle = patch.title;
  if ('tags' in patch) next.localTags = patch.tags;
  if ('notebookId' in patch) next.localNotebookId = patch.notebookId;
  // Dirty = local diverges from base in any tracked field.
  next.dirty = (
    next.localContent !== next.baseContent ||
    next.localTitle !== next.baseTitle ||
    next.localNotebookId !== next.baseNotebookId ||
    JSON.stringify(next.localTags) !== JSON.stringify(next.baseTags)
  ) ? 1 : 0;
  if (next.dirty) next.lastEditedAt = Date.now();
  await db.put(STORE, next);
  await refreshCounts();
  return next;
}

export async function markClean(noteId, newServerNote) {
  const db = await dbPromise;
  const row = await db.get(STORE, noteId);
  if (!row) return null;
  const next = {
    ...row,
    baseVersion: newServerNote.updated_at,
    baseContent: newServerNote.content || '',
    baseTitle: newServerNote.title || '',
    baseTags: Array.isArray(newServerNote.tags) ? newServerNote.tags.map(t => t.id || t) : row.baseTags,
    baseNotebookId: newServerNote.notebook_id ?? row.baseNotebookId,
    localContent: newServerNote.content || '',
    localTitle: newServerNote.title || '',
    localTags: Array.isArray(newServerNote.tags) ? newServerNote.tags.map(t => t.id || t) : row.localTags,
    localNotebookId: newServerNote.notebook_id ?? row.localNotebookId,
    dirty: 0,
    lastSyncAttemptAt: Date.now(),
    lastSyncError: null
  };
  await db.put(STORE, next);
  await refreshCounts();
  return next;
}

export async function markSyncError(noteId, message) {
  const db = await dbPromise;
  const row = await db.get(STORE, noteId);
  if (!row) return null;
  row.lastSyncAttemptAt = Date.now();
  row.lastSyncError = message || 'unknown error';
  await db.put(STORE, row);
  return row;
}

export async function discardCheckout(noteId) {
  const db = await dbPromise;
  await db.delete(STORE, noteId);
  await refreshCounts();
}

export async function listCheckouts() {
  const db = await dbPromise;
  const rows = await db.getAllFromIndex(STORE, 'checkedOutAt');
  // Most recent first.
  return rows.sort((a, b) => b.checkedOutAt - a.checkedOutAt);
}

export async function refreshFromServer(noteId, serverNote) {
  // Same effect as markClean — used by "Refresh offline copy" action where
  // local edits are discarded in favour of the latest server state.
  return markClean(noteId, serverNote);
}

// Initialize on module load.
refreshCounts().catch(() => {});
