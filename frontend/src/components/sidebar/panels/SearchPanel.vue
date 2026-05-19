<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useSearchStore } from '../../../stores/search.js';
import { Search, Clock } from 'lucide-vue-next';

const LS_RECENT = 'noted.ui.recentSearches';

const router = useRouter();
const searchStore = useSearchStore();
const recent = ref([]);

function loadRecent() {
  try {
    const raw = localStorage.getItem(LS_RECENT);
    recent.value = raw ? JSON.parse(raw).slice(0, 10) : [];
  } catch {
    recent.value = [];
  }
}

onMounted(loadRecent);

// Recent searches are appended by the main SearchView via the same key.
// This panel just reads them — keeps the contract simple.
function runRecent(q) {
  searchStore.search(q);
  router.push('/search');
}
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <h3>Search</h3>
    </div>
    <div class="panel-body">
      <div class="search-hint">
        <Search :size="16" />
        <span>Use the search bar in the main view.</span>
      </div>
      <div v-if="recent.length > 0" class="recent-section">
        <div class="section-label">Recent</div>
        <button
          v-for="q in recent"
          :key="q"
          class="recent-item"
          @click="runRecent(q)"
        >
          <Clock :size="12" />
          <span>{{ q }}</span>
        </button>
      </div>
      <p v-else class="empty-note">Recent searches will appear here.</p>
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px 12px;
  box-sizing: border-box;
}
.panel-header {
  padding: 0 8px 12px;
}
.panel-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.panel-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
}
.search-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-muted);
  background: var(--hover-bg);
  border-radius: 6px;
}
.recent-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.section-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  padding: 0 8px 6px;
}
.recent-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  background: none;
  border: none;
  border-radius: 6px;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.recent-item:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}
.empty-note {
  font-size: 11px;
  color: var(--text-muted);
  padding: 0 8px;
  margin: 0;
}
</style>
