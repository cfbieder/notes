<script setup>
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useNotesStore } from '../stores/notes.js';
import { useNotebooksStore } from '../stores/notebooks.js';
import AppSidebar from '../components/sidebar/AppSidebar.vue';
import NoteListPanel from '../components/ui/NoteListPanel.vue';
import { Inbox, ArrowRight, Trash2, FileText } from 'lucide-vue-next';

const router = useRouter();
const notesStore = useNotesStore();
const notebooksStore = useNotebooksStore();

onMounted(async () => {
  notesStore.clearFilters();
  notesStore.setFilter('is_inbox', 'true');
  await notesStore.fetchNotes();
  if (notebooksStore.notebooks.length === 0) {
    await notebooksStore.fetchNotebooks();
  }
});

async function moveToNotebook(noteId, notebookId) {
  await notesStore.updateNote(noteId, {
    notebook_id: notebookId,
    is_inbox: false
  });
  await notesStore.fetchNotes();
}

async function convertToNote(noteId) {
  const defaultNb = notebooksStore.getDefaultNotebook();
  if (defaultNb) {
    await moveToNotebook(noteId, defaultNb.id);
  }
}

async function discardNote(noteId) {
  await notesStore.deleteNote(noteId);
}

function openNote(noteId) {
  router.push(`/notes/${noteId}`);
}
</script>

<template>
  <div class="inbox-layout">
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
        <span>Use Ctrl+Shift+N to capture ideas quickly</span>
      </div>

      <div v-else class="inbox-list">
        <div v-for="note in notesStore.notes" :key="note.id" class="inbox-item">
          <div class="inbox-content" @click="openNote(note.id)">
            <div class="inbox-title">{{ note.title }}</div>
            <div class="inbox-preview">{{ note.content?.slice(0, 120) }}</div>
            <div class="inbox-time">{{ new Date(note.created_at).toLocaleString() }}</div>
          </div>
          <div class="inbox-actions">
            <div class="move-dropdown">
              <button class="action-btn move-btn" title="Move to notebook">
                <ArrowRight :size="14" />
                Move
              </button>
              <div class="dropdown-menu">
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
  border-color: #ff6b6b;
  color: #ff6b6b;
}

.move-dropdown {
  position: relative;
}

.dropdown-menu {
  display: none;
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

.move-dropdown:hover .dropdown-menu {
  display: block;
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
