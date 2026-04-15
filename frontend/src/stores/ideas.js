import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client.js';
import { useNotebooksStore } from './notebooks.js';

export const useIdeasStore = defineStore('ideas', () => {
  const ideas = ref([]);
  const meta = ref({ total: 0, limit: 50, offset: 0 });
  const loading = ref(false);
  const count = ref(0);

  async function fetchIdeas() {
    loading.value = true;
    try {
      const res = await api.get('/notes?note_type=idea');
      ideas.value = res.data;
      meta.value = res.meta;
      count.value = res.meta.total;
    } finally {
      loading.value = false;
    }
  }

  async function createIdea(data) {
    const res = await api.post('/notes', { ...data, note_type: 'idea', is_inbox: false });
    await fetchIdeas();
    return res.data;
  }

  async function updateIdea(id, data) {
    const res = await api.put(`/notes/${id}`, data);
    const idx = ideas.value.findIndex(n => n.id === id);
    if (idx !== -1) {
      ideas.value[idx] = { ...ideas.value[idx], ...res.data };
    }
    return res.data;
  }

  async function deleteIdea(id) {
    await api.delete(`/notes/${id}`);
    ideas.value = ideas.value.filter(n => n.id !== id);
    count.value = Math.max(0, count.value - 1);
  }

  async function promoteIdea(id, notebookId) {
    const res = await api.post(`/notes/${id}/promote`, { notebook_id: notebookId });
    ideas.value = ideas.value.filter(n => n.id !== id);
    count.value = Math.max(0, count.value - 1);
    useNotebooksStore().fetchNotebooks();
    return res.data;
  }

  async function mergeIdea(id, targetNoteId) {
    const res = await api.post(`/notes/${id}/merge-into`, { target_note_id: targetNoteId });
    ideas.value = ideas.value.filter(n => n.id !== id);
    count.value = Math.max(0, count.value - 1);
    // Refresh notes list since the source idea is now soft-deleted and target content changed.
    // Lazy import to avoid circular dependency.
    import('./notes.js').then(m => m.useNotesStore().fetchNotes().catch(() => {}));
    return res.data;
  }

  return { ideas, meta, loading, count, fetchIdeas, createIdea, updateIdea, deleteIdea, promoteIdea, mergeIdea };
});
