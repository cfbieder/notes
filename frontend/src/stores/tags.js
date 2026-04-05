import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client.js';

export const useTagsStore = defineStore('tags', () => {
  const tags = ref([]);
  const loading = ref(false);

  async function fetchTags() {
    loading.value = true;
    try {
      const res = await api.get('/tags');
      tags.value = res.data;
    } finally {
      loading.value = false;
    }
  }

  async function createTag(name, color) {
    const res = await api.post('/tags', { name, color });
    await fetchTags();
    return res.data;
  }

  async function updateTag(id, data) {
    const res = await api.put(`/tags/${id}`, data);
    await fetchTags();
    return res.data;
  }

  async function deleteTag(id) {
    await api.delete(`/tags/${id}`);
    await fetchTags();
  }

  return { tags, loading, fetchTags, createTag, updateTag, deleteTag };
});
