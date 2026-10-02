<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Library, AlertCircle, Inbox, Settings2 } from 'lucide-vue-next';
import { useResearchStore } from '../../../stores/research.js';
import { useToastsStore } from '../../../stores/toasts.js';

// CR039 A1 — Research contextual panel: active book, the fixed source lists,
// and the active book's chapters with their source counts.
const route = useRoute();
const router = useRouter();
const research = useResearchStore();
const toasts = useToastsStore();

const activeBookId = computed({
  get: () => research.activeBook?.id || '',
  set: (id) => {
    if (!id) return;
    research.updateBook(id, { is_active: true })
      .catch(err => toasts.addToast({ message: err.message || 'Could not switch books', type: 'error' }));
  }
});

function isActive(path, view) {
  if (route.path !== path) return false;
  return (route.query.view || '') === (view || '');
}

const lists = [
  { label: 'All sources', icon: Library, path: '/research/sources', view: '' },
  { label: 'Needs attention', icon: AlertCircle, path: '/research/sources', view: 'attention' },
  { label: 'Unassigned', icon: Inbox, path: '/research/sources', view: 'unassigned' }
];

function go(item) {
  router.push({ path: item.path, query: item.view ? { view: item.view } : {} });
}
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <h3>Research</h3>
      <select v-if="research.books.length > 1" v-model="activeBookId" class="book-select" title="Active book">
        <option v-for="b in research.books" :key="b.id" :value="b.id">{{ b.title }}</option>
      </select>
      <div v-else-if="research.activeBook" class="book-title">{{ research.activeBook.title }}</div>
    </div>

    <nav class="panel-list" aria-label="Research">
      <button
        v-for="item in lists"
        :key="item.label"
        class="panel-item"
        :class="{ active: isActive(item.path, item.view) }"
        :aria-current="isActive(item.path, item.view) ? 'page' : undefined"
        @click="go(item)"
      >
        <component :is="item.icon" :size="14" />
        <span>{{ item.label }}</span>
      </button>

      <div class="panel-section">Chapters</div>
      <button
        v-for="c in research.chapters"
        :key="c.id"
        class="panel-item chapter"
        :class="{ active: route.path === `/research/chapters/${c.id}` }"
        :aria-current="route.path === `/research/chapters/${c.id}` ? 'page' : undefined"
        :title="c.part ? `${c.part} — ${c.title}` : c.title"
        @click="router.push(`/research/chapters/${c.id}`)"
      >
        <span class="ch-label">{{ c.label }}</span>
        <span class="ch-title">{{ c.title }}</span>
        <span class="ch-count">{{ c.source_count }}</span>
      </button>
      <p v-if="research.chapters.length === 0" class="panel-hint">No chapters yet.</p>
    </nav>

    <button class="panel-footer-btn" @click="router.push({ path: '/settings', hash: '#research' })">
      <Settings2 :size="14" /> Manage books &amp; chapters
    </button>
  </div>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; height: 100%; padding: 16px 12px 8px; box-sizing: border-box; }
.panel-header { padding: 0 8px 12px; }
.panel-header h3 { margin: 0; font-size: 14px; font-weight: 600; color: var(--text-primary); }
.book-title { margin-top: 4px; font-size: 12px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.book-select {
  margin-top: 6px; width: 100%; background: var(--bg-main); color: var(--text-primary);
  border: 1px solid var(--border-subtle); border-radius: 6px; padding: 4px 6px; font-size: 12px;
}
.panel-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 1px; }
.panel-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  background: none; border: none; border-radius: 6px; padding: 6px 8px;
  color: var(--text-secondary); font-size: 13px; text-align: left; cursor: pointer;
}
.panel-item:hover { background: var(--hover-bg); color: var(--text-primary); }
.panel-item.active { background: var(--rail-active); color: var(--text-primary); }
.panel-section { margin: 14px 8px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
.ch-label { flex: 0 0 auto; min-width: 18px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.ch-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ch-count { flex: 0 0 auto; font-size: 11px; color: var(--text-muted); }
.panel-hint { margin: 4px 8px; font-size: 12px; color: var(--text-muted); }
.panel-footer-btn {
  display: flex; align-items: center; gap: 6px; margin-top: 8px;
  background: none; border: 1px solid var(--border-subtle); border-radius: 6px;
  color: var(--text-secondary); font-size: 12px; padding: 6px 8px; cursor: pointer;
}
.panel-footer-btn:hover { background: var(--hover-bg); color: var(--text-primary); }
</style>
