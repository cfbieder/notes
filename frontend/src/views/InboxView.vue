<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useNotesStore } from '../stores/notes.js';
import { useNotebooksStore } from '../stores/notebooks.js';
import AppSidebar from '../components/sidebar/AppSidebar.vue';
import MobileLayout from '../components/mobile/MobileLayout.vue';
import { useMobile } from '../composables/useMobile.js';
import { Inbox, ArrowRight, Trash2, FileText, CloudDownload } from 'lucide-vue-next';
import { cachedNoteIds, dirtyNoteIds } from '../lib/checkouts.js';

const { isMobile } = useMobile();

const router = useRouter();
const notesStore = useNotesStore();
const notebooksStore = useNotebooksStore();

const openMenuId = ref(null);

onMounted(async () => {
  notesStore.clearFilters();
  notesStore.setFilter('in_inbox', 'true');
  await notesStore.fetchNotes();
  if (notebooksStore.notebooks.length === 0) {
    await notebooksStore.fetchNotebooks();
  }
});

function toggleMoveMenu(noteId) {
  openMenuId.value = openMenuId.value === noteId ? null : noteId;
}

async function moveToNotebook(noteId, notebookId) {
  openMenuId.value = null;
  await notesStore.updateNote(noteId, { notebook_id: notebookId });
  await notesStore.fetchNotes();
  await notebooksStore.fetchNotebooks();
}

async function convertToNote(noteId) {
  const defaultNb = notebooksStore.getDefaultNotebook();
  if (defaultNb) {
    await moveToNotebook(noteId, defaultNb.id);
  }
}

async function discardNote(noteId) {
  await notesStore.trashNote(noteId);
}

function openNote(noteId) {
  router.push(`/notes/${noteId}`);
}
</script>

<template>
  <MobileLayout v-if="isMobile" title="Inbox">
    <main class="inbox-main" style="padding: 16px;">
      <div v-if="notesStore.loading" class="loading">Loading...</div>
      <div v-else-if="notesStore.notes.length === 0" class="empty">
        <Inbox :size="48" /><p>Inbox is clear</p>
      </div>
      <div v-else class="inbox-list">
        <div v-for="note in notesStore.notes" :key="note.id" class="inbox-item">
          <div class="inbox-content" @click="openNote(note.id)">
            <div class="inbox-title">
              <span>{{ note.title }}</span>
              <CloudDownload
                v-if="cachedNoteIds.has(note.id)"
                :size="12"
                class="offline-icon"
                :class="{ dirty: dirtyNoteIds.has(note.id) }"
                :title="dirtyNoteIds.has(note.id) ? 'Available offline · unsaved changes' : 'Available offline'"
              />
            </div>
            <div class="inbox-preview">{{ note.content?.slice(0, 120) }}</div>
            <div class="inbox-time">{{ new Date(note.created_at).toLocaleString() }}</div>
          </div>
          <div class="inbox-actions">
            <button class="action-btn" @click="convertToNote(note.id)" title="Convert to note"><FileText :size="14" /></button>
            <button class="action-btn delete-btn" @click="discardNote(note.id)" title="Discard"><Trash2 :size="14" /></button>
          </div>
        </div>
      </div>
    </main>
  </MobileLayout>

  <div v-else class="inbox-layout">
    <AppSidebar />
    <main class="inbox-main">
      <div class="inbox-header">
        <Inbox :size="20" />
        <h2>Inbox</h2>
        <span class="inbox-count">{{ notesStore.meta.total }} items</span>
      </div>

      <div v-if="notesStore.loading" class="loading">Loading...</div>

      <div v-else-if="notesStore.notes.length === 0" class="empty">
        <Inbox :size="48" />
        <p>Inbox is clear</p>
        <span>Use Alt+N to capture ideas quickly</span>
      </div>

      <div v-else class="inbox-list">
        <div v-for="note in notesStore.notes" :key="note.id" class="inbox-item">
          <div class="inbox-content" @click="openNote(note.id)">
            <div class="inbox-title">
              <span>{{ note.title }}</span>
              <CloudDownload
                v-if="cachedNoteIds.has(note.id)"
                :size="12"
                class="offline-icon"
                :class="{ dirty: dirtyNoteIds.has(note.id) }"
                :title="dirtyNoteIds.has(note.id) ? 'Available offline · unsaved changes' : 'Available offline'"
              />
            </div>
            <div class="inbox-preview">{{ note.content?.slice(0, 120) }}</div>
            <div class="inbox-time">{{ new Date(note.created_at).toLocaleString() }}</div>
          </div>
          <div class="inbox-actions">
            <div class="move-dropdown">
              <button class="action-btn move-btn" @click="toggleMoveMenu(note.id)" title="Move to notebook">
                <ArrowRight :size="14" />
                Move
              </button>
              <div v-if="openMenuId === note.id" class="dropdown-menu">
                <button
                  v-for="nb in notebooksStore.notebooks.filter(n => !n.is_default)"
                  :key="nb.id"
                  class="dropdown-item"
                  @click="moveToNotebook(note.id, nb.id)"
                >
                  {{ nb.name }}
                </button>
              </div>
            </div>
            <button class="action-btn" @click="convertToNote(note.id)" title="Convert to note">
              <FileText :size="14" />
            </button>
            <button class="action-btn delete-btn" @click="discardNote(note.id)" title="Discard">
              <Trash2 :size="14" />
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.inbox-layout {
  display: flex;
  height: 100vh;
}

.inbox-main {
  flex: 1;
  padding: 24px 32px;
  overflow-y: auto;
}

.inbox-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}

.inbox-header h2 { margin: 0; }

.inbox-count {
  font-size: 12px;
  color: var(--text-muted);
  margin-left: auto;
}

.loading, .empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  color: var(--text-muted);
  gap: 8px;
}
.empty span { font-size: 12px; }

.inbox-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.inbox-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
}

.inbox-content {
  flex: 1;
  cursor: pointer;
  min-width: 0;
}

.inbox-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.offline-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}
.offline-icon.dirty {
  color: var(--accent-warn, #ffb800);
}

.inbox-preview {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inbox-time {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}

.inbox-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  color: var(--text-muted);
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  cursor: pointer;
}
.action-btn:hover {
  border-color: var(--accent-primary);
  color: var(--text-primary);
}
.delete-btn:hover {
  border-color: var(--status-error);
  color: var(--status-error);
}

.move-dropdown {
  position: relative;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 4px;
  min-width: 140px;
  box-shadow: var(--shadow-sm);
  z-index: 50;
}

.dropdown-item {
  display: block;
  width: 100%;
  padding: 6px 10px;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}
.dropdown-item:hover {
  background: rgba(58, 134, 255, 0.1);
  color: var(--text-primary);
}
</style>
