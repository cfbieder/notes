<script setup>
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useNotesStore } from '../../stores/notes.js';
import { useNotebooksStore } from '../../stores/notebooks.js';
import { FileText, Pin, Trash2, FolderOpen, ChevronRight } from 'lucide-vue-next';

const router = useRouter();
const route = useRoute();
const notesStore = useNotesStore();
const notebooksStore = useNotebooksStore();

const sortedNotes = computed(() => notesStore.notes);

// Context menu state
const contextMenu = ref({ show: false, x: 0, y: 0, noteId: null });

function selectNote(note) {
  notesStore.fetchNote(note.id);
  router.push(`/notes/${note.id}`);
}

function isActive(note) {
  return route.params.id === note.id;
}

function onContextMenu(e, note) {
  e.preventDefault();
  contextMenu.value = {
    show: true,
    x: e.clientX,
    y: e.clientY,
    noteId: note.id
  };
}

const showMoveSubmenu = ref(false);

function closeContextMenu() {
  contextMenu.value.show = false;
  showMoveSubmenu.value = false;
}

async function trashNote() {
  if (!contextMenu.value.noteId) return;
  const id = contextMenu.value.noteId;
  closeContextMenu();
  if (notesStore.currentNote && notesStore.currentNote.id === id) {
    notesStore.currentNote = null;
    router.push('/notes');
  }
  await notesStore.trashNote(id);
  await notebooksStore.fetchNotebooks();
}

async function moveToNotebook(notebookId) {
  if (!contextMenu.value.noteId) return;
  const id = contextMenu.value.noteId;
  closeContextMenu();
  await notesStore.updateNote(id, { notebook_id: notebookId, is_inbox: false });
  await notesStore.fetchNotes();
  await notebooksStore.fetchNotebooks();
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
  <section class="note-list-panel" @click="closeContextMenu">
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
        @contextmenu="onContextMenu($event, note)"
      >
        <div class="note-title-row">
          <span class="note-title">{{ note.title }}</span>
          <Pin v-if="note.pinned" :size="12" class="pin-icon" />
        </div>
        <div class="note-preview">{{ getPreview(note.content) }}</div>
        <div class="note-meta">{{ formatDate(note.updated_at) }}</div>
      </button>
    </div>

    <!-- Context menu -->
    <Teleport to="body">
      <div
        v-if="contextMenu.show"
        class="context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      >
        <div class="context-submenu-wrapper">
          <button class="context-item" @click="showMoveSubmenu = !showMoveSubmenu">
            <FolderOpen :size="14" />
            Move to...
            <ChevronRight :size="12" class="submenu-arrow" />
          </button>
          <div v-if="showMoveSubmenu" class="context-submenu">
            <button
              v-for="nb in notebooksStore.notebooks"
              :key="nb.id"
              class="context-item"
              @click="moveToNotebook(nb.id)"
            >
              {{ nb.name }}
            </button>
          </div>
        </div>
        <button class="context-item trash" @click="trashNote">
          <Trash2 :size="14" />
          Move to Trash
        </button>
      </div>
      <div v-if="contextMenu.show" class="context-overlay" @click="closeContextMenu" />
    </Teleport>
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

<style>
/* Context menu — unscoped so Teleport works */
.context-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
}

.context-menu {
  position: fixed;
  z-index: 1000;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 4px;
  min-width: 160px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.context-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}
.context-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
}
.context-item.trash:hover {
  background: rgba(255, 107, 107, 0.1);
  color: #ff6b6b;
}

.context-submenu-wrapper {
  position: relative;
}

.submenu-arrow {
  margin-left: auto;
  color: var(--text-muted);
}

.context-submenu {
  position: absolute;
  left: 100%;
  top: 0;
  margin-left: 4px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 4px;
  min-width: 140px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}
</style>
