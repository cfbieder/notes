<script setup>
import { X } from 'lucide-vue-next';

defineProps({
  tabs: { type: Array, default: () => [] },
  activeId: { type: [String, null], default: null }
});

const emit = defineEmits(['select', 'close']);
</script>

<template>
  <div v-if="tabs.length" class="editor-tabs" role="tablist">
    <div
      v-for="tab in tabs"
      :key="tab.id"
      class="editor-tab"
      :class="{ active: tab.id === activeId }"
      role="tab"
      :aria-selected="tab.id === activeId"
      :title="tab.title || 'Untitled'"
      @click="emit('select', tab.id)"
    >
      <span class="editor-tab-title">{{ tab.title || 'Untitled' }}</span>
      <button
        class="editor-tab-close"
        type="button"
        aria-label="Close tab"
        @click.stop="emit('close', tab.id)"
      >
        <X :size="13" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.editor-tabs {
  display: flex;
  align-items: stretch;
  gap: 2px;
  overflow-x: auto;
  overflow-y: hidden;
  background: var(--bg-sidebar);
  border-bottom: 1px solid var(--border-subtle);
  scrollbar-width: thin;
}

.editor-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 220px;
  padding: 6px 8px 6px 12px;
  cursor: pointer;
  color: var(--text-secondary);
  background: transparent;
  border-right: 1px solid var(--border-subtle);
  border-top: 2px solid transparent;
  white-space: nowrap;
  user-select: none;
  flex: 0 0 auto;
}

.editor-tab:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.editor-tab.active {
  background: var(--bg-main);
  color: var(--text-primary);
  border-top-color: var(--accent-primary);
}

.editor-tab-title {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
}

.editor-tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0.5;
}

.editor-tab-close:hover {
  opacity: 1;
  background: var(--border-strong);
}
</style>
