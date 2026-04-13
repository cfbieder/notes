import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/client.js';
import { useNotebooksStore } from './notebooks.js';

export const useNotesStore = defineStore('notes', () => {
  const notes = ref([]);
  const currentNote = ref(null);
  const meta = ref({ total: 0, limit: 50, offset: 0 });
  const loading = ref(false);

  // Filters
  const filters = ref({
    notebook_id: null,
    tag_id: null,
    is_inbox: null,
    search: null
  });

  async function fetchNotes() {
    loading.value = true;
    try {
      const params = new URLSearchParams();
      if (filters.value.notebook_id) params.set('notebook_id', filters.value.notebook_id);
      if (filters.value.tag_id) params.set('tag_id', filters.value.tag_id);
      if (filters.value.is_inbox !== null) params.set('is_inbox', filters.value.is_inbox);
      if (filters.value.search) params.set('search', filters.value.search);

      const query = params.toString();
      const res = await api.get(`/notes${query ? '?' + query : ''}`);
      notes.value = res.data;
      meta.value = res.meta;
    } finally {
      loading.value = false;
    }
  }

  async function fetchNote(id) {
    const res = await api.get(`/notes/${id}`);
    currentNote.value = res.data;
    return res.data;
  }

  async function createNote(data) {
    const res = await api.post('/notes', data);
    await fetchNotes();
    useNotebooksStore().fetchNotebooks();
    return res.data;
  }

  async function updateNote(id, data) {
    const res = await api.put(`/notes/${id}`, data);
    // Update in list without full refetch
    const idx = notes.value.findIndex(n => n.id === id);
    if (idx !== -1) {
      notes.value[idx] = { ...notes.value[idx], ...res.data };
    }
    if (currentNote.value && currentNote.value.id === id) {
      currentNote.value = { ...currentNote.value, ...res.data };
    }
    if (data.notebook_id !== undefined || data.is_inbox !== undefined) {
      useNotebooksStore().fetchNotebooks();
    }
    return res.data;
  }

  // Soft delete — move to trash
  async function trashNote(id) {
    await api.delete(`/notes/${id}`);
    if (currentNote.value && currentNote.value.id === id) {
      currentNote.value = null;
    }
    await fetchNotes();
    useNotebooksStore().fetchNotebooks();
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
    filters.value = { notebook_id: null, tag_id: null, is_inbox: null, search: null };
  }

  return {
    notes, currentNote, meta, loading, filters, trashedNotes,
    fetchNotes, fetchNote, createNote, updateNote,
    trashNote, fetchTrash, restoreNote, permanentlyDeleteNote, emptyTrash,
    setFilter, clearFilters
  };
});
