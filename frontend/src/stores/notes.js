import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, OfflineError } from '../api/client.js';
import { useNotebooksStore } from './notebooks.js';
import {
  getCheckout, createCheckout, updateLocal, discardCheckout, markClean,
  listCheckouts
} from '../lib/checkouts.js';
import { flush as flushCheckouts, forceCheckIn, adoptServer } from '../lib/checkoutSync.js';

export const useNotesStore = defineStore('notes', () => {
  const notes = ref([]);
  const currentNote = ref(null);
  const meta = ref({ total: 0, limit: 50, offset: 0 });
  const loading = ref(false);

  // Filters
  const filters = ref({
    notebook_id: null,
    tag_id: null,
    in_inbox: null,
    note_type: null,
    search: null
  });

  // Set when fetchNotes had to fall back to local IDB because the API was
  // unreachable. UI can use this to surface a banner ("Showing offline
  // copies only — your full list will return when you're back online").
  const offlineFallback = ref(false);

  async function fetchNotes() {
    loading.value = true;
    try {
      const params = new URLSearchParams();
      if (filters.value.notebook_id) params.set('notebook_id', filters.value.notebook_id);
      if (filters.value.tag_id) params.set('tag_id', filters.value.tag_id);
      if (filters.value.in_inbox !== null) params.set('in_inbox', filters.value.in_inbox);
      if (filters.value.note_type) params.set('note_type', filters.value.note_type);
      if (filters.value.search) params.set('search', filters.value.search);

      const query = params.toString();
      try {
        const res = await api.get(`/notes${query ? '?' + query : ''}`);
        notes.value = res.data;
        meta.value = res.meta;
        offlineFallback.value = false;
      } catch (err) {
        if (!(err instanceof OfflineError)) throw err;
        // Offline: synthesize a notes list from local checkouts so the user
        // can still browse the notes they took with them.
        const rows = await listCheckouts();
        const local = rows.map(r => ({
          id: r.noteId,
          title: r.localTitle || '(untitled)',
          content: r.localContent || '',
          notebook_id: r.localNotebookId,
          updated_at: new Date(r.lastEditedAt || r.checkedOutAt).toISOString(),
          // Filters can narrow this further client-side if needed.
          note_type: 'note',
          pinned: false,
          format: 'markdown',
          _localOnly: true
        }));
        notes.value = local;
        meta.value = { total: local.length, limit: local.length, offset: 0 };
        offlineFallback.value = true;
      }
    } finally {
      loading.value = false;
    }
  }

  async function fetchNote(id) {
    // Checked-out notes are sourced from local IDB only. We do NOT try to
    // refresh server metadata here — on iPad Safari in Airplane mode,
    // navigator.onLine stays `true` so apiFetch can't fast-fail, and the
    // actual fetch hangs ~30s before the OS gives up. That delay made the
    // editor render blank for half a minute. For a checked-out note the
    // local snapshot is the canonical view; users who want fresh metadata
    // use the "Refresh offline copy" toolbar action.
    const checkout = await getCheckout(id);
    if (checkout) {
      const merged = {
        id,
        title: checkout.localTitle,
        content: checkout.localContent,
        notebook_id: checkout.localNotebookId ?? null,
        updated_at: checkout.baseVersion,
        _checkedOut: true,
        _dirty: checkout.dirty === 1
      };
      currentNote.value = merged;
      return merged;
    }
    // No local checkout. Try the server. If offline, return null with a
    // flag so callers can render a "Note not available offline" message
    // instead of bubbling an unhandled rejection up the render tree.
    try {
      const res = await api.get(`/notes/${id}`);
      currentNote.value = res.data;
      return res.data;
    } catch (err) {
      if (err instanceof OfflineError) {
        currentNote.value = { id, title: '', content: '', _unavailableOffline: true };
        return currentNote.value;
      }
      throw err;
    }
  }

  async function createNote(data) {
    const res = await api.post('/notes', data);
    // Refresh list in the background — don't block the caller on a potentially
    // slow GET (especially via the service worker on mobile).
    fetchNotes().catch(() => {});
    useNotebooksStore().fetchNotebooks();
    return res.data;
  }

  async function updateNote(id, data) {
    // If this note is checked out, edits go to the local IDB copy and do not
    // touch the server. Check-in is the only path that pushes for these.
    const checkout = await getCheckout(id);
    if (checkout) {
      const patch = {};
      if ('title' in data) patch.title = data.title;
      if ('content' in data) patch.content = data.content;
      if ('notebook_id' in data) patch.notebookId = data.notebook_id;
      if ('tag_ids' in data) patch.tags = data.tag_ids;
      const updated = await updateLocal(id, patch);
      // Mirror onto currentNote so reactive views update.
      if (currentNote.value && currentNote.value.id === id) {
        currentNote.value = {
          ...currentNote.value,
          title: updated.localTitle,
          content: updated.localContent,
          notebook_id: updated.localNotebookId,
          _dirty: updated.dirty === 1
        };
      }
      // Note-list rows should reflect the title change too.
      const idx = notes.value.findIndex(n => n.id === id);
      if (idx !== -1 && 'title' in data) {
        notes.value[idx] = { ...notes.value[idx], title: updated.localTitle };
      }
      return currentNote.value;
    }
    const res = await api.put(`/notes/${id}`, data);
    // Update in list without full refetch
    const idx = notes.value.findIndex(n => n.id === id);
    if (idx !== -1) {
      notes.value[idx] = { ...notes.value[idx], ...res.data };
    }
    if (currentNote.value && currentNote.value.id === id) {
      currentNote.value = { ...currentNote.value, ...res.data };
    }
    if (data.notebook_id !== undefined) {
      useNotebooksStore().fetchNotebooks();
    }
    return res.data;
  }

  // Soft delete — move to trash
  async function trashNote(id) {
    await api.delete(`/notes/${id}`);
    // If this note had an offline checkout, remove it — there's nothing to
    // sync back and we don't want a stale local copy lingering.
    if (await getCheckout(id)) {
      await discardCheckout(id);
    }
    if (currentNote.value && currentNote.value.id === id) {
      currentNote.value = null;
    }
    await fetchNotes();
    useNotebooksStore().fetchNotebooks();
    // Refresh ideas store too — if the trashed note was an idea, the count must drop.
    // Lazy import to avoid circular dependency at module load.
    import('./ideas.js').then(m => m.useIdeasStore().fetchIdeas().catch(() => {}));
  }

  // Trash management
  const trashedNotes = ref([]);

  async function fetchTrash() {
    const res = await api.get('/notes/trash');
    trashedNotes.value = res.data;
  }

  async function restoreNote(id) {
    await api.post(`/notes/${id}/restore`);
    await fetchTrash();
  }

  async function permanentlyDeleteNote(id) {
    await api.delete(`/notes/${id}/permanent`);
    trashedNotes.value = trashedNotes.value.filter(n => n.id !== id);
  }

  async function emptyTrash() {
    await api.delete('/notes/trash/empty');
    trashedNotes.value = [];
  }

  function setFilter(key, value) {
    filters.value[key] = value;
  }

  function clearFilters() {
    filters.value = { notebook_id: null, tag_id: null, in_inbox: null, note_type: null, search: null };
  }

  // ===== CR027: Offline checkout actions =====

  async function checkoutNote(id) {
    // Hit the API for the canonical updated_at — this is the base_version
    // that future check-ins will be compared against.
    const res = await api.get(`/notes/${id}`);
    const note = res.data;
    await createCheckout(note);
    if (currentNote.value && currentNote.value.id === id) {
      currentNote.value = { ...currentNote.value, _checkedOut: true, _dirty: false };
    }
    return note;
  }

  async function checkInNoteOne(id) {
    // Trigger a flush; the global flush picks up only dirty rows but will
    // include this one. For single-note "Check in now" we just call flush —
    // simpler and keeps one code path.
    return flushCheckouts();
  }

  async function discardOfflineCopy(id) {
    await discardCheckout(id);
    // Refresh currentNote with the live server copy.
    if (currentNote.value && currentNote.value.id === id) {
      try {
        const fresh = await api.get(`/notes/${id}`);
        currentNote.value = fresh.data;
      } catch {
        currentNote.value = { ...currentNote.value, _checkedOut: false, _dirty: false };
      }
    }
  }

  async function refreshOfflineCopy(id) {
    const res = await api.get(`/notes/${id}`);
    await markClean(id, res.data);
    if (currentNote.value && currentNote.value.id === id) {
      currentNote.value = {
        ...res.data,
        _checkedOut: true,
        _dirty: false
      };
    }
    return res.data;
  }

  async function resolveConflictKeepLocal(noteId, serverNote) {
    const result = await forceCheckIn(noteId, serverNote.updated_at);
    if (result.status === 'ok' && currentNote.value?.id === noteId) {
      currentNote.value = {
        ...currentNote.value,
        ...result.server,
        title: result.server.title,
        content: result.server.content,
        _checkedOut: true,
        _dirty: false
      };
    }
    return result;
  }

  async function resolveConflictKeepServer(noteId, serverNote) {
    await adoptServer(noteId, serverNote);
    if (currentNote.value?.id === noteId) {
      currentNote.value = { ...serverNote, _checkedOut: true, _dirty: false };
    }
  }

  async function resolveConflictMerged(noteId, serverNote, mergedContent) {
    const result = await forceCheckIn(noteId, serverNote.updated_at, { content: mergedContent });
    if (result.status === 'ok' && currentNote.value?.id === noteId) {
      currentNote.value = {
        ...currentNote.value,
        ...result.server,
        _checkedOut: true,
        _dirty: false
      };
    }
    return result;
  }

  return {
    notes, currentNote, meta, loading, filters, trashedNotes, offlineFallback,
    fetchNotes, fetchNote, createNote, updateNote,
    trashNote, fetchTrash, restoreNote, permanentlyDeleteNote, emptyTrash,
    setFilter, clearFilters,
    // CR027
    checkoutNote, checkInNoteOne, discardOfflineCopy, refreshOfflineCopy,
    resolveConflictKeepLocal, resolveConflictKeepServer, resolveConflictMerged
  };
});
