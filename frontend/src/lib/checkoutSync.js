import { reactive } from 'vue';
import { api, OfflineError } from '../api/client.js';
import {
  listCheckouts, markClean, markSyncError, discardCheckout, createCheckout,
  getCheckout, updateLocal
} from './checkouts.js';

// Simple event bus for conflict events. Views subscribe via `onConflict()`.
// We use a Set so multiple components can listen (e.g. App.vue mounts the
// modal, OfflinePanel may also react).
const conflictListeners = new Set();
export function onConflict(fn) {
  conflictListeners.add(fn);
  return () => conflictListeners.delete(fn);
}
function emitConflict(payload) {
  for (const fn of conflictListeners) {
    try { fn(payload); } catch (e) { /* swallow to keep iteration */ }
  }
}

export const syncState = reactive({
  flushing: false,
  lastFlushAt: null,
  lastResult: null
});

let flushing = false;

async function checkInOne(row, { forceBaseVersion } = {}) {
  const baseVersion = forceBaseVersion || row.baseVersion;
  const body = {
    base_version: baseVersion,
    title: row.localTitle,
    content: row.localContent,
    notebook_id: row.localNotebookId,
    tag_ids: row.localTags
  };
  try {
    const res = await api.post(`/notes/${row.noteId}/checkin`, body);
    await markClean(row.noteId, res.data);
    return { status: 'ok', noteId: row.noteId, server: res.data };
  } catch (err) {
    if (err instanceof OfflineError) {
      return { status: 'offline', noteId: row.noteId };
    }
    if (err.status === 409 && err.body?.data?.server) {
      await markSyncError(row.noteId, 'Conflict on check-in');
      emitConflict({
        noteId: row.noteId,
        local: {
          title: row.localTitle,
          content: row.localContent,
          notebookId: row.localNotebookId,
          tags: row.localTags
        },
        server: err.body.data.server
      });
      return { status: 'conflict', noteId: row.noteId };
    }
    if (err.status === 404) {
      await markSyncError(row.noteId, 'Note no longer exists on server');
      return { status: 'gone', noteId: row.noteId };
    }
    await markSyncError(row.noteId, err.message || String(err));
    return { status: 'error', noteId: row.noteId, error: err.message };
  }
}

/**
 * Flush all dirty checkouts. Safe to call repeatedly; concurrent calls no-op.
 * Returns a summary so callers can show toasts.
 */
export async function flush() {
  if (flushing) return { synced: 0, conflicts: 0, errors: 0, offline: false };
  flushing = true;
  syncState.flushing = true;
  let synced = 0;
  let conflicts = 0;
  let errors = 0;
  let offline = false;
  try {
    const rows = (await listCheckouts()).filter(r => r.dirty === 1);
    for (const row of rows) {
      const result = await checkInOne(row);
      if (result.status === 'ok') synced++;
      else if (result.status === 'conflict') conflicts++;
      else if (result.status === 'offline') { offline = true; break; }
      else errors++;
    }
  } finally {
    flushing = false;
    syncState.flushing = false;
    syncState.lastFlushAt = Date.now();
    syncState.lastResult = { synced, conflicts, errors, offline };
  }
  return { synced, conflicts, errors, offline };
}

/**
 * Force-overwrite the server with the local copy. Called by the conflict
 * modal's "Keep local" or "Hand-merge → Save" actions. Bumps base_version to
 * the server's just-seen value so the server accepts the update.
 */
export async function forceCheckIn(noteId, serverUpdatedAt, overrides = {}) {
  const row = await getCheckout(noteId);
  if (!row) return { status: 'error', noteId, error: 'no checkout' };

  // If overrides include merged content, persist it before the force push so
  // the editor reflects it after the round-trip.
  if (overrides.content !== undefined) {
    await updateLocal(noteId, { content: overrides.content });
  }

  const fresh = await getCheckout(noteId);
  return checkInOne(fresh, { forceBaseVersion: serverUpdatedAt });
}

/**
 * Adopt the server version: discard the local checkout, then re-create from
 * the server's payload (already in hand from the 409). Avoids a redundant GET.
 */
export async function adoptServer(noteId, serverNote) {
  await discardCheckout(noteId);
  await createCheckout(serverNote);
}
