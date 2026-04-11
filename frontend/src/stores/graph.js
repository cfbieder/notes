import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client.js';

export const useGraphStore = defineStore('graph', () => {
  const fullGraph = ref({ nodes: [], edges: [] });
  const localGraph = ref({ nodes: [], edges: [] });
  const backlinks = ref([]);
  const unlinkedMentions = ref([]);
  const loading = ref(false);

  async function fetchFullGraph() {
    loading.value = true;
    try {
      const res = await api.get('/graph');
      fullGraph.value = res.data;
    } finally {
      loading.value = false;
    }
  }

  async function fetchLocalGraph(noteId) {
    try {
      const res = await api.get(`/notes/${noteId}/graph`);
      localGraph.value = res.data;
    } catch {
      localGraph.value = { nodes: [], edges: [] };
    }
  }

  async function fetchBacklinks(noteId) {
    try {
      const res = await api.get(`/notes/${noteId}/backlinks`);
      backlinks.value = res.data;
    } catch {
      backlinks.value = [];
    }
  }

  async function fetchUnlinkedMentions(noteId) {
    try {
      const res = await api.get(`/notes/${noteId}/unlinked-mentions`);
      unlinkedMentions.value = res.data;
    } catch {
      unlinkedMentions.value = [];
    }
  }

  return {
    fullGraph, localGraph, backlinks, unlinkedMentions, loading,
    fetchFullGraph, fetchLocalGraph, fetchBacklinks, fetchUnlinkedMentions
  };
});
