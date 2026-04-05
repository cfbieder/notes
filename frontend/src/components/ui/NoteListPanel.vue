<script setup>
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useNotesStore } from '../../stores/notes.js';
import { FileText, Pin } from 'lucide-vue-next';

const router = useRouter();
const route = useRoute();
const notesStore = useNotesStore();

const sortedNotes = computed(() => notesStore.notes);

function selectNote(note) {
  notesStore.fetchNote(note.id);
  router.push(`/notes/${note.id}`);
}

function isActive(note) {
  return route.params.id === note.id;
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getPreview(content) {
  if (!content) return '';
  // Strip markdown syntax for preview
  const plain = content
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~`]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n/g, ' ')
    .trim();
  return plain.slice(0, 80);
}
</script>

<template>
  <section class="note-list-panel">
    <div class="list-header">
      <span class="list-count">{{ notesStore.meta.total }} notes</span>
    </div>

    <div v-if="notesStore.loading" class="loading">Loading...</div>

    <div v-else-if="sortedNotes.length === 0" class="empty-state">
      <FileText :size="32" />
      <p>No notes yet</p>
    </div>

    <div v-else class="note-list">
      <button
        v-for="note in sortedNotes"
        :key="note.id"
        class="note-item"
        :class="{ active: isActive(note) }"
        @click="selectNote(note)"
      >
        <div class="note-title-row">
          <span class="note-title">{{ note.title }}</span>
          <Pin v-if="note.pinned" :size="12" class="pin-icon" />
        </div>
        <div class="note-preview">{{ getPreview(note.content) }}</div>
        <div class="note-meta">{{ formatDate(note.updated_at) }}</div>
      </button>
    </div>
  </section>
</template>

<style scoped>
.note-list-panel {
  width: 280px;
  min-width: 280px;
  height: 100vh;
  background-color: var(--bg-main);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.list-header {
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.list-count {
  font-size: 12px;
  color: var(--text-muted);
}

.loading, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--text-muted);
  font-size: 14px;
  gap: 8px;
}

.note-list {
  flex: 1;
  overflow-y: auto;
}

.note-item {
  display: block;
  width: 100%;
  padding: 12px 16px;
  background: none;
  border: none;
  border-bottom: 1px solid var(--border-subtle);
  text-align: left;
  cursor: pointer;
  transition: background-color 0.1s;
  font-family: 'Inter', sans-serif;
}
.note-item:hover { background-color: rgba(255, 255, 255, 0.04); }
.note-item.active { background-color: rgba(58, 134, 255, 0.12); }

.note-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.note-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pin-icon { color: var(--accent-warn); }

.note-preview {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-meta {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}
</style>
