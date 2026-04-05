import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client.js';

export const useNotebooksStore = defineStore('notebooks', () => {
  const notebooks = ref([]);
  const stacks = ref([]);
  const loading = ref(false);

  async function fetchNotebooks() {
    loading.value = true;
    try {
      const res = await api.get('/notebooks');
      notebooks.value = res.data;
    } finally {
      loading.value = false;
    }
  }

  async function fetchStacks() {
    const res = await api.get('/stacks');
    stacks.value = res.data;
  }

  async function createNotebook(name, stackId) {
    const res = await api.post('/notebooks', { name, stack_id: stackId });
    await fetchNotebooks();
    return res.data;
  }

  async function updateNotebook(id, data) {
    const res = await api.put(`/notebooks/${id}`, data);
    await fetchNotebooks();
    return res.data;
  }

  async function deleteNotebook(id) {
    await api.delete(`/notebooks/${id}`);
    await fetchNotebooks();
  }

  async function createStack(name) {
    const res = await api.post('/stacks', { name });
    await fetchStacks();
    return res.data;
  }

  async function deleteStack(id) {
    await api.delete(`/stacks/${id}`);
    await fetchStacks();
  }

  function getDefaultNotebook() {
    return notebooks.value.find(n => n.is_default);
  }

  return {
    notebooks, stacks, loading,
    fetchNotebooks, fetchStacks,
    createNotebook, updateNotebook, deleteNotebook,
    createStack, deleteStack,
    getDefaultNotebook
  };
});
