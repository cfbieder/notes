import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client.js';

export const useSearchStore = defineStore('search', () => {
  const query = ref('');
  const results = ref([]);
  const meta = ref({ total: 0, query: '', limit: 20, offset: 0 });
  const loading = ref(false);

  async function search(q, filters = {}) {
    if (!q || q.trim().length === 0) {
      results.value = [];
      meta.value = { total: 0, query: '', limit: 20, offset: 0 };
      return;
    }

    loading.value = true;
    query.value = q;
    try {
      const params = new URLSearchParams({ q });
      if (filters.notebook_id) params.set('notebook_id', filters.notebook_id);
      if (filters.tag_id) params.set('tag_id', filters.tag_id);

      const res = await api.get(`/search?${params}`);
      results.value = res.data;
      meta.value = res.meta;
    } finally {
      loading.value = false;
    }
  }

  function clear() {
    query.value = '';
    results.value = [];
    meta.value = { total: 0, query: '', limit: 20, offset: 0 };
  }

  return { query, results, meta, loading, search, clear };
});
