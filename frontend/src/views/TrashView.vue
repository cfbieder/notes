<script setup>
import { ref, onMounted } from 'vue';
import { useNotesStore } from '../stores/notes.js';
import AppSidebar from '../components/sidebar/AppSidebar.vue';
import MobileLayout from '../components/mobile/MobileLayout.vue';
import ConfirmModal from '../components/ui/ConfirmModal.vue';
import { useMobile } from '../composables/useMobile.js';
import { Trash2, RotateCcw, AlertTriangle } from 'lucide-vue-next';

const { isMobile } = useMobile();

const notesStore = useNotesStore();
const showEmptyConfirm = ref(false);
const deleteConfirm = ref({ show: false, id: null, title: '' });

onMounted(() => {
  notesStore.fetchTrash();
});

async function restore(id) {
  await notesStore.restoreNote(id);
}

function confirmPermanentDelete(note) {
  deleteConfirm.value = { show: true, id: note.id, title: note.title };
}

async function permanentDelete() {
  const id = deleteConfirm.value.id;
  deleteConfirm.value.show = false;
  await notesStore.permanentlyDeleteNote(id);
}

async function emptyAll() {
  showEmptyConfirm.value = false;
  await notesStore.emptyTrash();
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString();
}
</script>

<template>
  <MobileLayout v-if="isMobile" title="Trash">
    <main class="trash-main" style="padding: 16px;">
      <div v-if="notesStore.trashedNotes.length === 0" class="empty">
        <Trash2 :size="48" /><p>Trash is empty</p>
      </div>
      <div v-else>
        <button v-if="notesStore.trashedNotes.length > 0" class="empty-btn" style="margin-bottom: 12px;" @click="showEmptyConfirm = true">
          <AlertTriangle :size="14" /> Empty Trash
        </button>
        <div class="trash-list">
          <div v-for="note in notesStore.trashedNotes" :key="note.id" class="trash-item">
            <div class="trash-content">
              <div class="trash-title">{{ note.title }}</div>
              <div class="trash-meta">Deleted {{ formatDate(note.deleted_at) }}</div>
            </div>
            <div class="trash-actions">
              <button class="action-btn restore-btn" @click="restore(note.id)"><RotateCcw :size="14" /></button>
              <button class="action-btn delete-btn" @click="confirmPermanentDelete(note)"><Trash2 :size="14" /></button>
            </div>
          </div>
        </div>
      </div>
    </main>

    <ConfirmModal v-if="showEmptyConfirm" title="Empty Trash" message="Permanently delete all trashed notes? This cannot be undone." confirm-text="Empty Trash" :danger="true" @confirm="emptyAll" @cancel="showEmptyConfirm = false" />
    <ConfirmModal v-if="deleteConfirm.show" title="Delete Permanently" :message="`Permanently delete &quot;${deleteConfirm.title}&quot;? This cannot be undone.`" confirm-text="Delete" :danger="true" @confirm="permanentDelete" @cancel="deleteConfirm.show = false" />
  </MobileLayout>

  <div v-else class="trash-layout">
    <AppSidebar />
    <main class="trash-main">
      <div class="trash-header">
        <Trash2 :size="20" />
        <h2>Trash</h2>
        <button
          v-if="notesStore.trashedNotes.length > 0"
          class="empty-btn"
          @click="showEmptyConfirm = true"
        >
          <AlertTriangle :size="14" />
          Empty Trash
        </button>
      </div>

      <div v-if="notesStore.trashedNotes.length === 0" class="empty">
        <Trash2 :size="48" />
        <p>Trash is empty</p>
      </div>

      <div v-else class="trash-list">
        <div v-for="note in notesStore.trashedNotes" :key="note.id" class="trash-item">
          <div class="trash-content">
            <div class="trash-title">{{ note.title }}</div>
            <div class="trash-preview">{{ note.content?.slice(0, 120) }}</div>
            <div class="trash-meta">Deleted {{ formatDate(note.deleted_at) }}</div>
          </div>
          <div class="trash-actions">
            <button class="action-btn restore-btn" @click="restore(note.id)" title="Restore">
              <RotateCcw :size="14" />
              Restore
            </button>
            <button class="action-btn delete-btn" @click="confirmPermanentDelete(note)" title="Delete permanently">
              <Trash2 :size="14" />
              Delete
            </button>
          </div>
        </div>
      </div>
    </main>

    <ConfirmModal
      v-if="showEmptyConfirm"
      title="Empty Trash"
      message="Permanently delete all trashed notes? This cannot be undone."
      confirm-text="Empty Trash"
      :danger="true"
      @confirm="emptyAll"
      @cancel="showEmptyConfirm = false"
    />

    <ConfirmModal
      v-if="deleteConfirm.show"
      title="Delete Permanently"
      :message="`Permanently delete &quot;${deleteConfirm.title}&quot;? This cannot be undone.`"
      confirm-text="Delete"
      :danger="true"
      @confirm="permanentDelete"
      @cancel="deleteConfirm.show = false"
    />
  </div>
</template>

<style scoped>
.trash-layout {
  display: flex;
  height: 100vh;
}

.trash-main {
  flex: 1;
  padding: 24px 32px;
  overflow-y: auto;
}

.trash-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}

.trash-header h2 { margin: 0; }

.empty-btn {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: none;
  border: 1px solid #ff6b6b;
  border-radius: 6px;
  color: #ff6b6b;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.empty-btn:hover {
  background: rgba(255, 107, 107, 0.1);
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  color: var(--text-muted);
  gap: 8px;
}

.trash-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.trash-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
}

.trash-content {
  flex: 1;
  min-width: 0;
}

.trash-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.trash-preview {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trash-meta {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}

.trash-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  cursor: pointer;
}

.restore-btn {
  color: var(--accent-success);
  border-color: var(--accent-success);
}
.restore-btn:hover {
  background: rgba(76, 201, 240, 0.1);
}

.delete-btn {
  color: #ff6b6b;
  border-color: #ff6b6b;
}
.delete-btn:hover {
  background: rgba(255, 107, 107, 0.1);
}
</style>
