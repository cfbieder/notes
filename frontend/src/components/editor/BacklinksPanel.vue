<script setup>
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useGraphStore } from '../../stores/graph.js';
import { ChevronRight, ChevronDown, Link, Unlink } from 'lucide-vue-next';

const props = defineProps({
  noteId: { type: String, required: true }
});

const router = useRouter();
const graphStore = useGraphStore();
const expanded = ref(false);

watch(() => props.noteId, () => {
  graphStore.fetchBacklinks(props.noteId);
  graphStore.fetchUnlinkedMentions(props.noteId);
});

function navigate(id) {
  router.push(`/notes/${id}`);
}

const totalCount = () => graphStore.backlinks.length + graphStore.unlinkedMentions.length;
</script>

<template>
  <div class="backlinks-panel">
    <button class="backlinks-toggle" @click="expanded = !expanded">
      <ChevronDown v-if="expanded" :size="14" />
      <ChevronRight v-else :size="14" />
      <span>Backlinks ({{ totalCount() }})</span>
    </button>

    <div v-if="expanded" class="backlinks-content">
      <!-- Linked mentions -->
      <div v-if="graphStore.backlinks.length > 0" class="backlinks-section">
        <h4><Link :size="12" /> Linked mentions</h4>
        <div
          v-for="bl in graphStore.backlinks"
          :key="bl.id"
          class="backlink-item"
          @click="navigate(bl.id)"
        >
          <span class="backlink-title">{{ bl.title }}</span>
          <span class="backlink-snippet">{{ bl.context_snippet }}</span>
        </div>
      </div>

      <!-- Unlinked mentions -->
      <div v-if="graphStore.unlinkedMentions.length > 0" class="backlinks-section">
        <h4><Unlink :size="12" /> Unlinked mentions</h4>
        <div
          v-for="um in graphStore.unlinkedMentions"
          :key="um.id"
          class="backlink-item"
          @click="navigate(um.id)"
        >
          <span class="backlink-title">{{ um.title }}</span>
          <span class="backlink-snippet">{{ um.context_snippet }}</span>
        </div>
      </div>

      <div v-if="graphStore.backlinks.length === 0 && graphStore.unlinkedMentions.length === 0" class="backlinks-empty">
        No backlinks or mentions found
      </div>
    </div>
  </div>
</template>

<style scoped>
.backlinks-panel {
  border-top: 1px solid var(--border-subtle);
  padding: 8px 16px;
}

.backlinks-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.backlinks-toggle:hover {
  color: var(--text-primary);
}

.backlinks-content {
  padding: 8px 0;
}

.backlinks-section {
  margin-bottom: 12px;
}

.backlinks-section h4 {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0 0 6px 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.backlink-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}

.backlink-item:hover {
  background: rgba(58, 134, 255, 0.08);
}

.backlink-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--accent-primary);
}

.backlink-snippet {
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.backlinks-empty {
  font-size: 12px;
  color: var(--text-muted);
  padding: 8px 0;
}
</style>
