<script setup>
import { onMounted, computed, reactive, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useNotebooksStore } from '../../stores/notebooks.js';
import { useNotesStore } from '../../stores/notes.js';
import { useTagsStore } from '../../stores/tags.js';
import { useAuthStore } from '../../stores/auth.js';
import { api } from '../../api/client.js';
import ConfirmModal from '../ui/ConfirmModal.vue';
import {
  FileText, Inbox, CheckSquare, Search, Network, Trash2,
  ChevronRight, ChevronDown, Plus, LogOut, FolderOpen, Tag
} from 'lucide-vue-next';

const router = useRouter();
const route = useRoute();
const notebooksStore = useNotebooksStore();
const notesStore = useNotesStore();
const tagsStore = useTagsStore();
const authStore = useAuthStore();

const version = import.meta.env.VITE_APP_VERSION || 'dev';
const envLabel = import.meta.env.VITE_ENV_LABEL;

const expanded = reactive({ stacks: new Set(), tags: false });

function getNotebookCount(nbId) {
  const nb = notebooksStore.notebooks.find(n => n.id === nbId);
  return nb ? nb.note_count : 0;
}

onMounted(async () => {
  await Promise.all([
    notebooksStore.fetchNotebooks(),
    notebooksStore.fetchStacks(),
    tagsStore.fetchTags()
  ]);
});

const unstackedNotebooks = computed(() =>
  notebooksStore.notebooks.filter(n => !n.stack_id)
);

function selectNotebook(id) {
  notesStore.clearFilters();
  notesStore.setFilter('notebook_id', id);
  notesStore.fetchNotes();
  router.push(`/notebooks/${id}`);
}

function selectTag(tag) {
  notesStore.clearFilters();
  notesStore.setFilter('tag_id', tag.id);
  notesStore.fetchNotes();
  router.push(`/tags/${tag.name}`);
}

function goToInbox() {
  notesStore.clearFilters();
  notesStore.setFilter('is_inbox', 'true');
  notesStore.fetchNotes();
  router.push('/inbox');
}

function goToTasks() {
  router.push('/tasks');
}

function goToAllNotes() {
  notesStore.clearFilters();
  notesStore.fetchNotes();
  router.push('/notes');
}

function goToSearch() {
  router.push('/search');
}

function goToGraph() {
  router.push('/graph');
}

function goToTrash() {
  router.push('/trash');
}

async function handleLogout() {
  await authStore.logout();
  router.push('/login');
}

async function handleNewNote() {
  const note = await notesStore.createNote({
    title: 'Untitled',
    content: ''
  });
  router.push(`/notes/${note.id}`);
}

function toggleStack(id) {
  if (expanded.stacks.has(id)) {
    expanded.stacks.delete(id);
  } else {
    expanded.stacks.add(id);
  }
}

// Notebook creation
const showNewNotebook = ref(false);
const newNotebookName = ref('');
const newNotebookStackId = ref('');

async function createNotebook() {
  const name = newNotebookName.value.trim();
  if (!name) return;
  await notebooksStore.createNotebook(name, newNotebookStackId.value || undefined);
  await notebooksStore.fetchStacks();
  newNotebookName.value = '';
  newNotebookStackId.value = '';
  showNewNotebook.value = false;
}

function cancelNewNotebook() {
  newNotebookName.value = '';
  newNotebookStackId.value = '';
  showNewNotebook.value = false;
}

// Notebook context menu
const nbContextMenu = ref({ show: false, x: 0, y: 0, notebookId: null, notebookName: '' });

function onNotebookContextMenu(e, nb) {
  e.preventDefault();
  // Don't allow context menu on default (Inbox) notebook
  if (nb.is_default) return;
  nbContextMenu.value = {
    show: true,
    x: e.clientX,
    y: e.clientY,
    notebookId: nb.id,
    notebookName: nb.name
  };
}

function closeNbContextMenu() {
  nbContextMenu.value.show = false;
}

// Confirm modal state
const confirmModal = ref({ show: false, title: '', message: '', danger: false, onConfirm: null });

function showConfirm({ title, message, danger = false }) {
  return new Promise((resolve) => {
    confirmModal.value = {
      show: true, title, message, danger,
      onConfirm: () => { confirmModal.value.show = false; resolve(true); }
    };
    // Also handle cancel
    confirmModal.value.onCancel = () => { confirmModal.value.show = false; resolve(false); };
  });
}

async function deleteNotebook() {
  const id = nbContextMenu.value.notebookId;
  const name = nbContextMenu.value.notebookName;
  closeNbContextMenu();

  try {
    const res = await api.get(`/notebooks/${id}/info`);
    const noteCount = res.data.note_count;

    let message = `This will permanently delete the notebook "${name}".`;
    if (noteCount > 0) {
      message += `\n\n${noteCount} note${noteCount === 1 ? '' : 's'} will be moved to Inbox.`;
    }

    const confirmed = await showConfirm({
      title: 'Delete Notebook',
      message,
      danger: true
    });
    if (!confirmed) return;

    await notebooksStore.deleteNotebook(id);
    await notebooksStore.fetchStacks();
    if (route.params.id === id) {
      notesStore.clearFilters();
      notesStore.fetchNotes();
      router.push('/notes');
    }
  } catch (err) {
    console.error('Failed to delete notebook:', err);
  }
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <h2>Noted</h2>
      <span v-if="envLabel" class="env-badge">{{ envLabel }}</span>
    </div>

    <button class="new-note-btn" @click="handleNewNote">
      <Plus :size="16" />
      New Note
    </button>

    <nav class="sidebar-nav">
      <button class="nav-item" :class="{ active: route.path === '/notes' }" @click="goToAllNotes">
        <FileText :size="16" />
        <span>All Notes</span>
      </button>
      <button class="nav-item" :class="{ active: route.path === '/inbox' }" @click="goToInbox">
        <Inbox :size="16" />
        <span>Inbox</span>
      </button>
      <button class="nav-item" :class="{ active: route.path === '/tasks' }" @click="goToTasks">
        <CheckSquare :size="16" />
        <span>Tasks</span>
      </button>
      <button class="nav-item" :class="{ active: route.path === '/search' }" @click="goToSearch">
        <Search :size="16" />
        <span>Search</span>
      </button>
      <button class="nav-item" :class="{ active: route.path === '/graph' }" @click="goToGraph">
        <Network :size="16" />
        <span>Graph</span>
      </button>
      <button class="nav-item" :class="{ active: route.path === '/trash' }" @click="goToTrash">
        <Trash2 :size="16" />
        <span>Trash</span>
      </button>
    </nav>

    <div class="sidebar-section">
      <div class="section-label-row">
        <span class="section-label">Notebooks</span>
        <button class="section-add-btn" @click="showNewNotebook = !showNewNotebook" title="New notebook">
          <Plus :size="12" />
        </button>
      </div>

      <!-- Inline new notebook form -->
      <div v-if="showNewNotebook" class="new-notebook-form">
        <input
          v-model="newNotebookName"
          class="new-notebook-input"
          placeholder="Notebook name..."
          @keydown.enter="createNotebook"
          @keydown.escape="cancelNewNotebook"
          autofocus
        />
        <select v-model="newNotebookStackId" class="new-notebook-select">
          <option value="">No stack</option>
          <option v-for="stack in notebooksStore.stacks" :key="stack.id" :value="stack.id">
            {{ stack.name }}
          </option>
        </select>
        <div class="new-notebook-actions">
          <button class="nb-create-btn" @click="createNotebook" :disabled="!newNotebookName.trim()">Create</button>
          <button class="nb-cancel-btn" @click="cancelNewNotebook">Cancel</button>
        </div>
      </div>

      <div v-for="stack in notebooksStore.stacks" :key="stack.id" class="stack-group">
        <button class="stack-header" @click="toggleStack(stack.id)">
          <ChevronDown v-if="expanded.stacks.has(stack.id)" :size="14" />
          <ChevronRight v-else :size="14" />
          <span>{{ stack.name }}</span>
        </button>
        <div v-if="expanded.stacks.has(stack.id) && stack.notebooks" class="stack-notebooks">
          <button
            v-for="nb in stack.notebooks"
            :key="nb.id"
            class="nav-item notebook-item"
            :class="{ active: route.params.id === nb.id }"
            @click="selectNotebook(nb.id)"
            @contextmenu="onNotebookContextMenu($event, nb)"
          >
            <FolderOpen :size="14" />
            <span>{{ nb.name }}</span>
            <span class="note-count">{{ getNotebookCount(nb.id) }}</span>
          </button>
        </div>
      </div>

      <button
        v-for="nb in unstackedNotebooks"
        :key="nb.id"
        class="nav-item notebook-item"
        :class="{ active: route.params.id === nb.id }"
        @click="selectNotebook(nb.id)"
        @contextmenu="onNotebookContextMenu($event, nb)"
      >
        <FolderOpen :size="14" />
        <span>{{ nb.name }}</span>
        <span class="note-count">{{ nb.note_count }}</span>
      </button>
    </div>

    <!-- Tags section -->
    <div class="sidebar-section tags-section">
      <button class="section-label clickable" @click="expanded.tags = !expanded.tags">
        <ChevronDown v-if="expanded.tags" :size="12" />
        <ChevronRight v-else :size="12" />
        Tags
      </button>
      <div v-if="expanded.tags" class="tag-list">
        <button
          v-for="tag in tagsStore.tags"
          :key="tag.id"
          class="nav-item tag-item"
          :class="{ active: route.params.name === tag.name }"
          @click="selectTag(tag)"
        >
          <Tag :size="14" :style="{ color: tag.color || 'var(--text-muted)' }" />
          <span>{{ tag.name }}</span>
          <span class="note-count">{{ tag.note_count }}</span>
        </button>
      </div>
    </div>

    <div class="sidebar-footer">
      <div class="footer-user">
        <span class="user-name">{{ authStore.user?.username }}</span>
        <span class="version">v{{ version }}</span>
      </div>
      <button class="logout-btn" @click="handleLogout" title="Sign out">
        <LogOut :size="16" />
        <span>Sign out</span>
      </button>
    </div>

    <!-- Notebook context menu -->
    <Teleport to="body">
      <div
        v-if="nbContextMenu.show"
        class="nb-context-menu"
        :style="{ left: nbContextMenu.x + 'px', top: nbContextMenu.y + 'px' }"
      >
        <button class="nb-context-item delete" @click="deleteNotebook">
          <Trash2 :size="14" />
          Delete notebook
        </button>
      </div>
      <div v-if="nbContextMenu.show" class="nb-context-overlay" @click="closeNbContextMenu" />
    </Teleport>

    <ConfirmModal
      v-if="confirmModal.show"
      :title="confirmModal.title"
      :message="confirmModal.message"
      :danger="confirmModal.danger"
      confirm-text="Delete"
      @confirm="confirmModal.onConfirm"
      @cancel="confirmModal.onCancel"
    />
  </aside>
</template>

<style>
/* Notebook context menu — unscoped for Teleport */
.nb-context-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
}

.nb-context-menu {
  position: fixed;
  z-index: 1000;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 4px;
  min-width: 170px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.nb-context-item {
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
.nb-context-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
}
.nb-context-item.delete:hover {
  background: rgba(255, 107, 107, 0.1);
  color: #ff6b6b;
}
</style>

<style scoped>
.sidebar {
  width: 260px;
  min-width: 260px;
  height: 100vh;
  background-color: var(--bg-sidebar);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  padding: 20px 12px;
  box-sizing: border-box;
}

.sidebar-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 0 8px;
  margin-bottom: 16px;
}

.sidebar-header h2 {
  margin: 0;
  font-size: 20px;
}

.env-badge {
  background: rgba(255, 159, 28, 0.25);
  color: var(--accent-warn);
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
}

.new-note-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  margin-bottom: 16px;
  background-color: var(--accent-warn);
  color: #1a1a1a;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  cursor: pointer;
  transition: opacity 0.15s;
}
.new-note-btn:hover { opacity: 0.88; }

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 20px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 12px;
  background: none;
  border: none;
  border-radius: 6px;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.1s;
  text-align: left;
}
.nav-item:hover { background-color: rgba(255, 255, 255, 0.06); }
.nav-item.active {
  background-color: rgba(58, 134, 255, 0.15);
  color: var(--text-primary);
}

.sidebar-section {
  overflow-y: auto;
}

.sidebar-section:first-of-type {
  flex: 1;
}

.tags-section {
  max-height: 200px;
  margin-bottom: 8px;
}

.section-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  margin-bottom: 8px;
}

.section-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.section-add-btn {
  display: flex;
  align-items: center;
  padding: 2px;
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
}
.section-add-btn:hover {
  color: var(--text-primary);
  border-color: var(--accent-primary);
}

.new-notebook-form {
  padding: 6px 12px;
  margin-bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.new-notebook-input, .new-notebook-select {
  width: 100%;
  padding: 5px 8px;
  background: var(--bg-main);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  box-sizing: border-box;
}
.new-notebook-input:focus, .new-notebook-select:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.new-notebook-actions {
  display: flex;
  gap: 6px;
}

.nb-create-btn {
  flex: 1;
  padding: 4px;
  background: var(--accent-primary);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 11px;
  font-family: 'Inter', sans-serif;
  cursor: pointer;
}
.nb-create-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.nb-cancel-btn {
  flex: 1;
  padding: 4px;
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 11px;
  font-family: 'Inter', sans-serif;
  cursor: pointer;
}

.section-label.clickable {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  background: none;
  border: none;
  font-family: 'Inter', sans-serif;
  width: 100%;
  text-align: left;
}
.section-label.clickable:hover { color: var(--text-secondary); }

.stack-group {
  margin-bottom: 2px;
}

.stack-header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 12px;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}
.stack-header:hover { color: var(--text-primary); }

.stack-notebooks {
  padding-left: 12px;
}

.notebook-item, .tag-item {
  font-size: 12px;
  padding: 5px 12px;
}

.note-count {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-muted);
}

.sidebar-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  margin-top: 8px;
  border-top: 1px solid var(--border-subtle);
}

.footer-user {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.version {
  font-size: 10px;
  color: var(--text-muted);
}

.logout-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  cursor: pointer;
  padding: 5px 10px;
  border-radius: 6px;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
}
.logout-btn:hover {
  color: var(--text-primary);
  border-color: rgba(255, 255, 255, 0.2);
}
</style>
