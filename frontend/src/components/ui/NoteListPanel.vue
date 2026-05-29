<script setup>
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useNotesStore } from '../../stores/notes.js';
import { useNotebooksStore } from '../../stores/notebooks.js';
import { FileText, Pin, Trash2, FolderOpen, ChevronRight, ChevronUp, ChevronDown, CloudDownload } from 'lucide-vue-next';
import { cachedNoteIds, dirtyNoteIds } from '../../lib/checkouts.js';

defineProps({
  // When true, the panel stretches to fill remaining width (used when no
  // note is open so the list reads like Inbox instead of leaving an empty
  // editor pane to the right).
  expanded: { type: Boolean, default: false }
});

const router = useRouter();
const route = useRoute();
const notesStore = useNotesStore();
const notebooksStore = useNotebooksStore();

// Sort state — applies to the expanded layout only (narrow sidebar keeps
// the backend's pinned+updated order). Default mirrors the server order so
// the first paint matches what the user had before CR030.
const sortKey = ref('updated_at');
const sortDir = ref('desc');

function setSort(key) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortDir.value = key === 'title' ? 'asc' : 'desc';
  }
}

const sortedNotes = computed(() => {
  const arr = notesStore.notes.slice();
  const dir = sortDir.value === 'asc' ? 1 : -1;
  const cmp = (a, b) => {
    if (sortKey.value === 'title') {
      return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }) * dir;
    }
    // updated_at: missing values sort to the bottom regardless of direction.
    const av = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const bv = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    return (av - bv) * dir;
  };
  const pinned = arr.filter(n => n.pinned).sort(cmp);
  const rest = arr.filter(n => !n.pinned).sort(cmp);
  return [...pinned, ...rest];
});

// Context menu state
const contextMenu = ref({ show: false, x: 0, y: 0, noteId: null });

function selectNote(note) {
  notesStore.fetchNote(note.id);
  router.push(`/notes/${note.id}`);
}

function isActive(note) {
  return route.params.id === note.id;
}

function onDragStart(e, note) {
  e.dataTransfer.setData('text/plain', note.id);
  e.dataTransfer.effectAllowed = 'move';
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
  await notesStore.updateNote(id, { notebook_id: notebookId });
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

function getPreview(content, format) {
  if (!content) return '';
  if (format === 'html') {
    // Coarse tag strip — good enough for an 80-char preview without pulling
    // DOMPurify into the list panel just to render text.
    const stripped = content
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return stripped.slice(0, 80);
  }
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
  <section class="note-list-panel" :class="{ 'note-list-panel--expanded': expanded }" @click="closeContextMenu">
    <div class="list-header">
      <span class="list-count">{{ notesStore.meta.total }} notes</span>
      <span v-if="notesStore.offlineFallback" class="offline-fallback-chip" title="You're offline — showing notes you've taken offline. The full list will return when you're back online.">
        <CloudDownload :size="11" /> offline cache only
      </span>
    </div>

    <div v-if="notesStore.loading" class="loading">Loading...</div>

    <div v-else-if="sortedNotes.length === 0" class="empty-state">
      <FileText :size="32" />
      <p>No notes yet</p>
    </div>

    <div v-else-if="expanded" class="note-list note-list--columns">
      <div class="column-header" role="row">
        <button class="col-header col-title" :class="{ active: sortKey === 'title' }" @click="setSort('title')">
          <span>Title</span>
          <ChevronUp v-if="sortKey === 'title' && sortDir === 'asc'" :size="12" />
          <ChevronDown v-if="sortKey === 'title' && sortDir === 'desc'" :size="12" />
        </button>
        <button class="col-header col-date" :class="{ active: sortKey === 'updated_at' }" @click="setSort('updated_at')">
          <span>Last used</span>
          <ChevronUp v-if="sortKey === 'updated_at' && sortDir === 'asc'" :size="12" />
          <ChevronDown v-if="sortKey === 'updated_at' && sortDir === 'desc'" :size="12" />
        </button>
      </div>
      <button
        v-for="note in sortedNotes"
        :key="note.id"
        class="note-item note-item--row"
        :class="{ active: isActive(note) }"
        draggable="true"
        @dragstart="onDragStart($event, note)"
        @click="selectNote(note)"
        @contextmenu="onContextMenu($event, note)"
      >
        <div class="note-title-row col-title">
          <span v-if="note.note_type === 'idea'" class="idea-chip" title="Idea">💡</span>
          <span class="note-title">{{ note.title }}</span>
          <span v-if="note.format === 'html'" class="format-badge" title="HTML note">HTML</span>
          <CloudDownload
            v-if="cachedNoteIds.has(note.id)"
            :size="12"
            class="offline-icon"
            :class="{ dirty: dirtyNoteIds.has(note.id) }"
            :title="dirtyNoteIds.has(note.id) ? 'Available offline · unsaved changes' : 'Available offline'"
          />
          <Pin v-if="note.pinned" :size="12" class="pin-icon" />
        </div>
        <div class="note-meta col-date">{{ formatDate(note.updated_at) }}</div>
      </button>
    </div>

    <div v-else class="note-list">
      <button
        v-for="note in sortedNotes"
        :key="note.id"
        class="note-item"
        :class="{ active: isActive(note) }"
        draggable="true"
        @dragstart="onDragStart($event, note)"
        @click="selectNote(note)"
        @contextmenu="onContextMenu($event, note)"
      >
        <div class="note-title-row">
          <span v-if="note.note_type === 'idea'" class="idea-chip" title="Idea">💡</span>
          <span class="note-title">{{ note.title }}</span>
          <span v-if="note.format === 'html'" class="format-badge" title="HTML note">HTML</span>
          <CloudDownload
            v-if="cachedNoteIds.has(note.id)"
            :size="12"
            class="offline-icon"
            :class="{ dirty: dirtyNoteIds.has(note.id) }"
            :title="dirtyNoteIds.has(note.id) ? 'Available offline · unsaved changes' : 'Available offline'"
          />
          <Pin v-if="note.pinned" :size="12" class="pin-icon" />
        </div>
        <div class="note-preview">{{ getPreview(note.content, note.format) }}</div>
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

.note-list-panel--expanded {
  width: auto;
  min-width: 0;
  flex: 1;
  border-right: none;
}

.list-header {
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.list-count {
  font-size: 12px;
  color: var(--text-muted);
}

.offline-fallback-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--accent-warn, #ffb800);
  background: var(--accent-warn-bg, rgba(255, 184, 0, 0.12));
  padding: 2px 8px;
  border-radius: 10px;
  border: 1px solid var(--accent-warn, #ffb800);
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
.note-item:hover { background-color: var(--hover-bg); }
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
.idea-chip { font-size: 13px; line-height: 1; }

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

/* Expanded two-column layout (CR030) */
.column-header {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-main);
  position: sticky;
  top: 0;
  z-index: 1;
}

.col-header {
  background: none;
  border: none;
  padding: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
  cursor: pointer;
}
.col-header:hover { color: var(--text-primary); }
.col-header.active { color: var(--text-primary); }

.col-title { flex: 1; min-width: 0; }
.col-date {
  width: 110px;
  flex-shrink: 0;
  text-align: right;
  justify-content: flex-end;
}

.note-item--row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.note-item--row .col-title {
  overflow: hidden;
}
.note-item--row .col-date {
  margin-top: 0;
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
  background: var(--hover-bg);
  color: var(--text-primary);
}
.context-item.trash:hover {
  background: var(--status-error-bg);
  color: var(--status-error);
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
