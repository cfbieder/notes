<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useNotesStore } from '../../stores/notes.js';
import { FileText, Menu, Pin, CloudDownload, Home } from 'lucide-vue-next';
import { cachedNoteIds, dirtyNoteIds } from '../../lib/checkouts.js';

const props = defineProps({
  title: { type: String, default: 'Notes' }
});

defineEmits(['open-sidebar']);

const router = useRouter();
const notesStore = useNotesStore();

const sortedNotes = computed(() => notesStore.notes);

function openNote(note) {
  router.push(`/notes/${note.id}`);
}

function goHome() {
  router.push('/home');
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

function getPreview(content, format) {
  if (!content) return '';
  if (format === 'html') {
    const stripped = content
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return stripped.slice(0, 100);
  }
  const plain = content
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~`]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n/g, ' ')
    .trim();
  return plain.slice(0, 100);
}
</script>

<template>
  <div class="mobile-notes-list">
    <header class="list-header">
      <button class="home-btn" @click="goHome" aria-label="Home">
        <Home :size="20" />
      </button>
      <h2 class="list-title">{{ title }}</h2>
      <span class="list-count">{{ notesStore.meta.total ?? sortedNotes.length }}</span>
      <span v-if="notesStore.offlineFallback" class="offline-fallback-chip">
        <CloudDownload :size="11" /> offline
      </span>
      <button class="menu-btn" @click="$emit('open-sidebar')" aria-label="Menu">
        <Menu :size="20" />
      </button>
    </header>

    <div v-if="notesStore.loading" class="loading">Loading…</div>

    <div v-else-if="sortedNotes.length === 0" class="empty">
      <FileText :size="40" />
      <p>No notes here yet</p>
    </div>

    <div v-else class="note-list">
      <button
        v-for="note in sortedNotes"
        :key="note.id"
        class="note-item"
        @click="openNote(note)"
      >
        <div class="note-title-row">
          <span v-if="note.note_type === 'idea'" class="idea-chip">💡</span>
          <span class="note-title">{{ note.title }}</span>
          <span v-if="note.format === 'html'" class="format-badge">HTML</span>
          <CloudDownload
            v-if="cachedNoteIds.has(note.id)"
            :size="12"
            class="offline-icon"
            :class="{ dirty: dirtyNoteIds.has(note.id) }"
          />
          <Pin v-if="note.pinned" :size="12" class="pin-icon" />
        </div>
        <div class="note-preview">{{ getPreview(note.content, note.format) }}</div>
        <div class="note-meta">{{ formatDate(note.updated_at) }}</div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.mobile-notes-list {
  min-height: 100dvh;
  background: var(--bg-main);
  display: flex;
  flex-direction: column;
}

.list-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.list-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-count {
  font-size: 12px;
  color: var(--text-muted);
  background: var(--hover-bg);
  padding: 2px 8px;
  border-radius: 10px;
}

.offline-fallback-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--accent-warn, #ffb800);
  background: var(--accent-warn-bg, rgba(255, 184, 0, 0.12));
  padding: 2px 8px;
  border-radius: 10px;
  border: 1px solid var(--accent-warn, #ffb800);
}

.menu-btn,
.home-btn {
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  color: var(--text-secondary);
  padding: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
}
.menu-btn { margin-left: auto; }

.loading, .empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 16px;
  color: var(--text-muted);
  gap: 8px;
  font-size: 14px;
}

.note-list {
  flex: 1;
  overflow-y: auto;
}

.note-item {
  display: block;
  width: 100%;
  padding: 14px 16px;
  background: none;
  border: none;
  border-bottom: 1px solid var(--border-subtle);
  text-align: left;
  cursor: pointer;
  font-family: 'Inter', sans-serif;
  color: var(--text-primary);
}
.note-item:active { background-color: var(--hover-bg); }

.note-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.note-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.pin-icon { color: var(--accent-warn); }
.idea-chip { font-size: 14px; line-height: 1; }

.offline-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}
.offline-icon.dirty {
  color: var(--accent-warn, #ffb800);
}

.format-badge {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.5px;
  padding: 1px 4px;
  background: var(--accent-info, var(--accent-primary));
  color: white;
  border-radius: 3px;
  line-height: 1;
}

.note-preview {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.note-meta {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 6px;
}
</style>
