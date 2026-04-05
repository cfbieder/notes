<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useSearchStore } from '../stores/search.js';
import AppSidebar from '../components/sidebar/AppSidebar.vue';
import { Search, FileText } from 'lucide-vue-next';

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

function openNote(id) {
  router.push(`/notes/${id}`);
}
</script>

<template>
  <div class="search-layout">
    <AppSidebar />
    <main class="search-main">
      <div class="search-header">
        <div class="search-input-row">
          <Search :size="18" />
          <input
            v-model="query"
            class="search-input"
            placeholder="Search all notes..."
            @input="onInput"
            autofocus
          />
        </div>
        <span v-if="searchStore.meta.total > 0" class="search-count">
          {{ searchStore.meta.total }} result{{ searchStore.meta.total === 1 ? '' : 's' }}
        </span>
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
            <FileText :size="16" />
            <span class="result-title">{{ result.title }}</span>
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

.search-count {
  display: block;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-muted);
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
