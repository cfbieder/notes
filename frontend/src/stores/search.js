import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/client.js';

// Supported prefix filters: from:drive, is:auto-update, is:pinned
const PREFIX_FILTERS = {
  'from:drive': 'from_drive',
  'is:auto-update': 'auto_update'
};

function parseQuery(raw) {
  const filters = {};
  let textParts = [];

  const tokens = raw.trim().split(/\s+/);
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (PREFIX_FILTERS[lower]) {
      filters[PREFIX_FILTERS[lower]] = 'true';
    } else {
      textParts.push(token);
    }
  }

  return { text: textParts.join(' '), filters };
}

export const useSearchStore = defineStore('search', () => {
  const query = ref('');
  const results = ref([]);
  const meta = ref({ total: 0, query: '', limit: 20, offset: 0 });
  const loading = ref(false);

  // Expose active filters for UI chips
  const activeFilters = computed(() => {
    const { filters } = parseQuery(query.value);
    return Object.keys(PREFIX_FILTERS).filter(k => filters[PREFIX_FILTERS[k]]);
  });

  async function search(q, extraFilters = {}) {
    if (!q || q.trim().length === 0) {
      results.value = [];
      meta.value = { total: 0, query: '', limit: 20, offset: 0 };
      return;
    }

    loading.value = true;
    query.value = q;
    try {
      const { text, filters } = parseQuery(q);

      // Need either text or at least one filter
      if (!text && Object.keys(filters).length === 0) {
        results.value = [];
        meta.value = { total: 0, query: '', limit: 20, offset: 0 };
        return;
      }

      const params = new URLSearchParams();
      if (text) params.set('q', text);
      Object.entries(filters).forEach(([k, v]) => params.set(k, v));
      if (extraFilters.notebook_id) params.set('notebook_id', extraFilters.notebook_id);
      if (extraFilters.tag_id) params.set('tag_id', extraFilters.tag_id);

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

  return { query, results, meta, loading, activeFilters, search, clear };
});
