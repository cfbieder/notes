import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/client.js';

// Supported prefix filters: from:drive, is:auto-update, is:source (CR039),
// and ch:<label> — a chapter of the active book (CR039 §10.4).
const PREFIX_FILTERS = {
  'from:drive': 'from_drive',
  'is:auto-update': 'auto_update',
  'is:source': 'note_type'
};
const PREFIX_VALUES = { note_type: 'source' };
const CHAPTER_RE = /^ch:(\S+)$/i;

function parseQuery(raw) {
  const filters = {};
  let textParts = [];

  const tokens = raw.trim().split(/\s+/);
  for (const token of tokens) {
    const lower = token.toLowerCase();
    const ch = token.match(CHAPTER_RE);
    if (PREFIX_FILTERS[lower]) {
      const key = PREFIX_FILTERS[lower];
      filters[key] = PREFIX_VALUES[key] || 'true';
    } else if (ch) {
      filters.chapter = ch[1];
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
  const highlightResults = ref([]); // CR039: matching highlights (quotes/comments)

  // Expose active filters for UI chips
  const activeFilters = computed(() => {
    const { filters } = parseQuery(query.value);
    const active = Object.keys(PREFIX_FILTERS).filter(k => filters[PREFIX_FILTERS[k]]);
    if (filters.chapter) active.push(`ch:${filters.chapter}`);
    return active;
  });

  async function search(q, extraFilters = {}) {
    if (!q || q.trim().length === 0) {
      results.value = [];
      highlightResults.value = [];
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

      // Highlights are searched alongside notes when there is text to match.
      const hlParams = new URLSearchParams();
      if (text) {
        hlParams.set('q', text);
        if (filters.chapter) hlParams.set('chapter', filters.chapter);
      }
      const [res, hl] = await Promise.all([
        api.get(`/search?${params}`),
        text ? api.get(`/search/highlights?${hlParams}`).catch(() => ({ data: [] })) : Promise.resolve({ data: [] })
      ]);
      results.value = res.data;
      meta.value = res.meta;
      highlightResults.value = hl.data;
    } finally {
      loading.value = false;
    }
  }

  function clear() {
    query.value = '';
    results.value = [];
    highlightResults.value = [];
    meta.value = { total: 0, query: '', limit: 20, offset: 0 };
  }

  return { query, results, meta, loading, highlightResults, activeFilters, search, clear };
});
