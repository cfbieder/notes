<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useSearchStore } from '../stores/search.js';
import AppSidebar from '../components/sidebar/AppSidebar.vue';
import MobileLayout from '../components/mobile/MobileLayout.vue';
import { useMobile } from '../composables/useMobile.js';
import { Search, FileText, RefreshCw, X } from 'lucide-vue-next';

const { isMobile } = useMobile();

const router = useRouter();
const searchStore = useSearchStore();
const query = ref(searchStore.query || '');
let debounceTimer = null;

function onInput() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    searchStore.search(query.value);
  }, 300);
}

function removeFilter(filter) {
  // Remove the filter token from the query string
  const regex = new RegExp(`\\s*${filter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'gi');
  query.value = query.value.replace(regex, ' ').trim();
  searchStore.search(query.value);
}

function addFilter(filter) {
  if (!query.value.toLowerCase().includes(filter.toLowerCase())) {
    query.value = (query.value + ' ' + filter).trim();
    searchStore.search(query.value);
  }
}

function openNote(id) {
  router.push(`/notes/${id}`);
}
</script>

<template>
  <MobileLayout v-if="isMobile" title="Search">
    <main class="search-main" style="padding: 16px;">
      <div class="search-header">
        <div class="search-input-row">
          <Search :size="18" />
          <input v-model="query" class="search-input" placeholder="Search... (from:drive, is:auto-update)" @input="onInput" autofocus />
        </div>
        <div class="search-meta-row">
          <div class="search-filters">
            <span v-for="f in searchStore.activeFilters" :key="f" class="filter-chip">
              {{ f }}
              <button class="filter-chip-remove" @click="removeFilter(f)"><X :size="10" /></button>
            </span>
            <button v-if="!searchStore.activeFilters.includes('from:drive')" class="filter-quick" @click="addFilter('from:drive')">from:drive</button>
            <button v-if="!searchStore.activeFilters.includes('is:auto-update')" class="filter-quick" @click="addFilter('is:auto-update')">is:auto-update</button>
          </div>
          <span v-if="searchStore.meta.total > 0" class="search-count">
            {{ searchStore.meta.total }} result{{ searchStore.meta.total === 1 ? '' : 's' }}
          </span>
        </div>
      </div>
      <div v-if="searchStore.loading" class="loading">Searching...</div>
      <div v-else-if="query && searchStore.results.length === 0" class="empty">
        <Search :size="32" /><p>No results for "{{ query }}"</p>
      </div>
      <div v-else class="search-results">
        <button v-for="result in searchStore.results" :key="result.id" class="result-card" @click="openNote(result.id)">
          <div class="result-header">
            <span v-if="result.note_type === 'idea'" class="idea-chip" title="Idea">💡</span>
            <FileText v-else :size="16" />
            <span class="result-title">{{ result.title }}</span>
          </div>
          <div class="result-snippet" v-html="result.snippet" />
        </button>
      </div>
    </main>
  </MobileLayout>

  <div v-else class="search-layout">
    <AppSidebar />
    <main class="search-main">
      <div class="search-header">
        <div class="search-input-row">
          <Search :size="18" />
          <input
            v-model="query"
            class="search-input"
            placeholder="Search all notes... (try from:drive or is:auto-update)"
            @input="onInput"
            autofocus
          />
        </div>
        <div class="search-meta-row">
          <div class="search-filters">
            <span
              v-for="f in searchStore.activeFilters"
              :key="f"
              class="filter-chip"
            >
              <RefreshCw v-if="f.includes('auto')" :size="11" />
              {{ f }}
              <button class="filter-chip-remove" @click="removeFilter(f)"><X :size="10" /></button>
            </span>
            <button
              v-if="!searchStore.activeFilters.includes('from:drive')"
              class="filter-quick"
              @click="addFilter('from:drive')"
            >from:drive</button>
            <button
              v-if="!searchStore.activeFilters.includes('is:auto-update')"
              class="filter-quick"
              @click="addFilter('is:auto-update')"
            >is:auto-update</button>
          </div>
          <span v-if="searchStore.meta.total > 0" class="search-count">
            {{ searchStore.meta.total }} result{{ searchStore.meta.total === 1 ? '' : 's' }}
          </span>
        </div>
      </div>

      <div v-if="searchStore.loading" class="loading">Searching...</div>

      <div v-else-if="query && searchStore.results.length === 0" class="empty">
        <Search :size="32" />
        <p>No results for "{{ query }}"</p>
      </div>

      <div v-else class="search-results">
        <button
          v-for="result in searchStore.results"
          :key="result.id"
          class="result-card"
          @click="openNote(result.id)"
        >
          <div class="result-header">
            <span v-if="result.note_type === 'idea'" class="idea-chip" title="Idea">💡</span>
            <FileText v-else :size="16" />
            <span class="result-title">{{ result.title }}</span>
            <span v-if="result.auto_update" class="auto-update-chip" title="Auto-update enabled">
              <RefreshCw :size="11" /> auto
            </span>
          </div>
          <div class="result-snippet" v-html="result.snippet" />
        </button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.search-layout {
  display: flex;
  height: 100vh;
}

.search-main {
  flex: 1;
  padding: 24px 32px;
  overflow-y: auto;
}

.search-header {
  margin-bottom: 20px;
}

.search-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  color: var(--text-muted);
}

.search-input {
  flex: 1;
  background: none;
  border: none;
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  outline: none;
}
.search-input::placeholder { color: var(--text-muted); }

.search-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  gap: 8px;
}

.search-filters {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: rgba(58, 134, 255, 0.15);
  border: 1px solid rgba(58, 134, 255, 0.3);
  border-radius: 12px;
  color: var(--accent-primary);
  font-size: 11px;
  font-family: 'Inter', sans-serif;
}

.filter-chip-remove {
  display: inline-flex;
  align-items: center;
  background: none;
  border: none;
  color: var(--accent-primary);
  cursor: pointer;
  padding: 0;
  margin-left: 2px;
  opacity: 0.7;
}
.filter-chip-remove:hover { opacity: 1; }

.filter-quick {
  padding: 3px 8px;
  background: none;
  border: 1px dashed var(--border-subtle);
  border-radius: 12px;
  color: var(--text-muted);
  font-size: 11px;
  font-family: 'Inter', sans-serif;
  cursor: pointer;
  transition: all 0.1s;
}
.filter-quick:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  border-style: solid;
}

.search-count {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

.loading, .empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px;
  color: var(--text-muted);
  gap: 8px;
}

.search-results {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.result-card {
  display: block;
  width: 100%;
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.1s;
  font-family: 'Inter', sans-serif;
}
.result-card:hover { border-color: var(--accent-primary); }

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.result-title {
  font-size: 14px;
  font-weight: 500;
}
.idea-chip { font-size: 14px; line-height: 1; }

.auto-update-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;
  padding: 2px 6px;
  background: rgba(58, 134, 255, 0.12);
  border-radius: 4px;
  color: var(--accent-primary);
  font-size: 10px;
  font-weight: 500;
}

.result-snippet {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.result-snippet :deep(mark) {
  background: rgba(255, 159, 28, 0.3);
  color: var(--accent-warn);
  border-radius: 2px;
  padding: 0 2px;
}
</style>
