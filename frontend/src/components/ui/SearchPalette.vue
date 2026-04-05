<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useSearchStore } from '../../stores/search.js';
import { Search, FileText, X } from 'lucide-vue-next';

const emit = defineEmits(['close']);
const router = useRouter();
const searchStore = useSearchStore();

const query = ref('');
const selectedIndex = ref(0);
const inputRef = ref(null);
let debounceTimer = null;

onMounted(() => {
  inputRef.value?.focus();
});

watch(query, (val) => {
  selectedIndex.value = 0;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    searchStore.search(val);
  }, 250);
});

function onKeydown(e) {
  if (e.key === 'Escape') {
    emit('close');
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (selectedIndex.value < searchStore.results.length - 1) {
      selectedIndex.value++;
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (selectedIndex.value > 0) {
      selectedIndex.value--;
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const result = searchStore.results[selectedIndex.value];
    if (result) selectResult(result);
  }
}

function selectResult(result) {
  router.push(`/notes/${result.id}`);
  emit('close');
}

onBeforeUnmount(() => {
  clearTimeout(debounceTimer);
});
</script>

<template>
  <div class="palette-overlay" @click.self="$emit('close')">
    <div class="palette">
      <div class="palette-input-row">
        <Search :size="18" class="palette-icon" />
        <input
          ref="inputRef"
          v-model="query"
          class="palette-input"
          placeholder="Search notes..."
          @keydown="onKeydown"
        />
        <button class="palette-close" @click="$emit('close')">
          <X :size="16" />
        </button>
      </div>

      <div v-if="searchStore.loading" class="palette-loading">Searching...</div>

      <div v-else-if="query && searchStore.results.length === 0" class="palette-empty">
        No results for "{{ query }}"
      </div>

      <div v-else class="palette-results">
        <button
          v-for="(result, i) in searchStore.results"
          :key="result.id"
          class="palette-result"
          :class="{ selected: i === selectedIndex }"
          @click="selectResult(result)"
          @mouseenter="selectedIndex = i"
        >
          <FileText :size="16" />
          <div class="result-content">
            <div class="result-title">{{ result.title }}</div>
            <div class="result-snippet" v-html="result.snippet" />
          </div>
        </button>
      </div>

      <div v-if="searchStore.meta.total > 0" class="palette-footer">
        {{ searchStore.meta.total }} result{{ searchStore.meta.total === 1 ? '' : 's' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.palette-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  padding-top: 15vh;
  z-index: 1000;
}

.palette {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  width: 560px;
  max-height: 420px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.palette-input-row {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  gap: 10px;
  border-bottom: 1px solid var(--border-subtle);
}

.palette-icon { color: var(--text-muted); }

.palette-input {
  flex: 1;
  background: none;
  border: none;
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  outline: none;
}
.palette-input::placeholder { color: var(--text-muted); }

.palette-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
}
.palette-close:hover { color: var(--text-primary); }

.palette-loading, .palette-empty {
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.palette-results {
  overflow-y: auto;
  flex: 1;
}

.palette-result {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 10px 16px;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  transition: background 0.05s;
}
.palette-result:hover,
.palette-result.selected {
  background: rgba(58, 134, 255, 0.1);
}

.palette-result svg {
  margin-top: 2px;
  flex-shrink: 0;
}

.result-content {
  min-width: 0;
}

.result-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.result-snippet {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.result-snippet :deep(mark) {
  background: rgba(255, 159, 28, 0.3);
  color: var(--accent-warn);
  border-radius: 2px;
  padding: 0 2px;
}

.palette-footer {
  padding: 8px 16px;
  border-top: 1px solid var(--border-subtle);
  font-size: 11px;
  color: var(--text-muted);
}
</style>
