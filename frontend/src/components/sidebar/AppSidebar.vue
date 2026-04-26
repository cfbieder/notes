<script setup>
import { onMounted, computed, reactive, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useNotebooksStore } from '../../stores/notebooks.js';
import { useNotesStore } from '../../stores/notes.js';
import { useTagsStore } from '../../stores/tags.js';
import { useIdeasStore } from '../../stores/ideas.js';
import { useAuthStore } from '../../stores/auth.js';
import { api } from '../../api/client.js';
import ConfirmModal from '../ui/ConfirmModal.vue';
import RemindersPanel from '../ui/RemindersPanel.vue';
import AIAssistPendingPill from '../ai/AIAssistPendingPill.vue';
import { useRemindersStore } from '../../stores/reminders.js';
import {
  FileText, Inbox, CheckSquare, Search, Network, Trash2, Bell,
  ChevronRight, ChevronDown, Plus, LogOut, FolderOpen, Tag, Settings, HelpCircle, Maximize2, Minimize2,
  Sparkles
} from 'lucide-vue-next';
import { useUIStore } from '../../stores/ui.js';
import { useAIAssistStore } from '../../stores/aiAssist.js';
import { useMobile } from '../../composables/useMobile.js';

const aiAssistStore = useAIAssistStore();
const { isMobile } = useMobile();

const uiStore = useUIStore();

const remindersStore = useRemindersStore();

const router = useRouter();
const route = useRoute();
const notebooksStore = useNotebooksStore();
const notesStore = useNotesStore();
const tagsStore = useTagsStore();
const ideasStore = useIdeasStore();
const authStore = useAuthStore();

const version = import.meta.env.VITE_APP_VERSION || 'dev';
const envLabel = import.meta.env.VITE_ENV_LABEL;

const showReminders = ref(false);
const expanded = reactive({ stacks: new Set(), tags: false });

function getNotebookCount(nbId) {
  const nb = notebooksStore.notebooks.find(n => n.id === nbId);
  return nb ? nb.note_count : 0;
}

onMounted(async () => {
  await Promise.all([
    notebooksStore.fetchNotebooks(),
    notebooksStore.fetchStacks(),
    tagsStore.fetchTags(),
    remindersStore.fetchReminders(),
    ideasStore.fetchIdeas()
  ]);
  remindersStore.startPolling(60000);
  // Initial due check after a short delay (auth is already complete at this point)
  setTimeout(() => remindersStore.checkDue(), 3000);
  // Same cadence for AI Assist deep-think jobs — sidebar pill + completion toasts.
  aiAssistStore.startJobsPolling(60000);
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

function goToIdeas() {
  router.push('/ideas');
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

// Drag-and-drop notes to notebooks
const dragOverNotebook = ref(null);

function onNotebookDragOver(e, nbId) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  dragOverNotebook.value = nbId;
}

function onNotebookDragLeave() {
  dragOverNotebook.value = null;
}

async function onNotebookDrop(e, nbId) {
  e.preventDefault();
  dragOverNotebook.value = null;
  const noteId = e.dataTransfer.getData('text/plain');
  if (!noteId) return;
  const targetNb = notebooksStore.notebooks.find(n => n.id === nbId);
  await notesStore.updateNote(noteId, {
    notebook_id: nbId,
    is_inbox: !!targetNb?.is_default
  });
  await notesStore.fetchNotes();
  await notebooksStore.fetchNotebooks();
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

// Notebook/Stack creation
const showNewForm = ref(false);
const newFormType = ref('notebook'); // 'notebook' | 'stack'
const newNotebookName = ref('');
const newNotebookStackId = ref('');

async function createNotebook() {
  const name = newNotebookName.value.trim();
  if (!name) return;
  if (newFormType.value === 'stack') {
    await notebooksStore.createStack(name);
  } else {
    await notebooksStore.createNotebook(name, newNotebookStackId.value || undefined);
  }
  await notebooksStore.fetchStacks();
  await notebooksStore.fetchNotebooks();
  cancelNewForm();
}

function cancelNewForm() {
  newNotebookName.value = '';
  newNotebookStackId.value = '';
  newFormType.value = 'notebook';
  showNewForm.value = false;
}

// Notebook context menu
const nbContextMenu = ref({ show: false, x: 0, y: 0, notebookId: null, notebookName: '' });

function onNotebookContextMenu(e, nb) {
  e.preventDefault();
  if (nb.is_default) return;
  nbContextMenu.value = {
    show: true,
    x: e.clientX,
    y: e.clientY,
    notebookId: nb.id,
    notebookName: nb.name
  };
}

const showMoveToStack = ref(false);

function closeNbContextMenu() {
  nbContextMenu.value.show = false;
  showMoveToStack.value = false;
}

async function moveNotebookToStack(stackId) {
  const id = nbContextMenu.value.notebookId;
  closeNbContextMenu();
  await notebooksStore.updateNotebook(id, { stack_id: stackId });
  await notebooksStore.fetchStacks();
  await notebooksStore.fetchNotebooks();
}

// Notebook rename
const renameNotebook = ref({ show: false, id: null, name: '' });

async function startRenameNotebook() {
  renameNotebook.value = {
    show: true,
    id: nbContextMenu.value.notebookId,
    name: nbContextMenu.value.notebookName
  };
  closeNbContextMenu();
}

async function submitRenameNotebook() {
  const name = renameNotebook.value.name.trim();
  if (!name) return;
  await notebooksStore.updateNotebook(renameNotebook.value.id, { name });
  await notebooksStore.fetchStacks();
  renameNotebook.value.show = false;
}

// Stack context menu
const stackContextMenu = ref({ show: false, x: 0, y: 0, stackId: null, stackName: '' });

function onStackContextMenu(e, stack) {
  e.preventDefault();
  e.stopPropagation();
  stackContextMenu.value = {
    show: true,
    x: e.clientX,
    y: e.clientY,
    stackId: stack.id,
    stackName: stack.name
  };
}

function closeStackContextMenu() {
  stackContextMenu.value.show = false;
}

// Stack rename
const renameStack = ref({ show: false, id: null, name: '' });

function startRenameStack() {
  renameStack.value = {
    show: true,
    id: stackContextMenu.value.stackId,
    name: stackContextMenu.value.stackName
  };
  closeStackContextMenu();
}

async function submitRenameStack() {
  const name = renameStack.value.name.trim();
  if (!name) return;
  await api.put(`/stacks/${renameStack.value.id}`, { name });
  await notebooksStore.fetchStacks();
  renameStack.value.show = false;
}

async function deleteStack() {
  const id = stackContextMenu.value.stackId;
  const name = stackContextMenu.value.stackName;
  const stack = notebooksStore.stacks.find(s => s.id === id);
  const nbCount = stack?.notebooks?.length || 0;
  closeStackContextMenu();

  let message = `This will delete the stack "${name}".`;
  if (nbCount > 0) {
    message += `\n\n${nbCount} notebook${nbCount === 1 ? '' : 's'} will become unstacked (notes are not affected).`;
  }

  const confirmed = await showConfirm({ title: 'Delete Stack', message, danger: true });
  if (!confirmed) return;

  await notebooksStore.deleteStack(id);
  await notebooksStore.fetchStacks();
  await notebooksStore.fetchNotebooks();
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
      <button class="nav-item" :class="{ active: route.path === '/ideas' }" @click="goToIdeas">
        <span class="nav-emoji">💡</span>
        <span>Ideas</span>
        <span v-if="ideasStore.count > 0" class="idea-badge">{{ ideasStore.count }}</span>
      </button>
      <button class="nav-item" :class="{ active: route.path === '/search' }" @click="goToSearch">
        <Search :size="16" />
        <span>Search</span>
      </button>
      <button class="nav-item" :class="{ active: route.path === '/graph' }" @click="goToGraph">
        <Network :size="16" />
        <span>Graph</span>
      </button>
      <button v-if="!isMobile" class="nav-item" @click="aiAssistStore.open()" title="AI Assist (⌘/Ctrl+Shift+A)">
        <Sparkles :size="16" />
        <span>AI Assist</span>
        <AIAssistPendingPill />
      </button>
      <button class="nav-item" @click="showReminders = true">
        <Bell :size="16" />
        <span>Reminders</span>
        <span v-if="remindersStore.overdueCount > 0" class="reminder-badge">{{ remindersStore.overdueCount }}</span>
      </button>
      <button class="nav-item" :class="{ active: route.path === '/trash' }" @click="goToTrash">
        <Trash2 :size="16" />
        <span>Trash</span>
      </button>
      <button class="nav-item" :class="{ active: route.path === '/settings' }" @click="router.push('/settings')">
        <Settings :size="16" />
        <span>Settings</span>
      </button>
    </nav>

    <div class="sidebar-section">
      <div class="section-label-row">
        <span class="section-label">Notebooks</span>
        <button class="section-add-btn" @click="showNewForm = !showNewForm" title="New notebook or stack">
          <Plus :size="12" />
        </button>
      </div>

      <!-- Inline create form -->
      <div v-if="showNewForm" class="new-notebook-form">
        <div class="form-type-tabs">
          <button :class="{ active: newFormType === 'notebook' }" @click="newFormType = 'notebook'">Notebook</button>
          <button :class="{ active: newFormType === 'stack' }" @click="newFormType = 'stack'">Stack</button>
        </div>
        <input
          v-model="newNotebookName"
          class="new-notebook-input"
          :placeholder="newFormType === 'stack' ? 'Stack name...' : 'Notebook name...'"
          @keydown.enter="createNotebook"
          @keydown.escape="cancelNewForm"
          autofocus
        />
        <select v-if="newFormType === 'notebook'" v-model="newNotebookStackId" class="new-notebook-select">
          <option value="">No stack</option>
          <option v-for="stack in notebooksStore.stacks" :key="stack.id" :value="stack.id">
            {{ stack.name }}
          </option>
        </select>
        <div class="new-notebook-actions">
          <button class="nb-create-btn" @click="createNotebook" :disabled="!newNotebookName.trim()">Create</button>
          <button class="nb-cancel-btn" @click="cancelNewForm">Cancel</button>
        </div>
      </div>

      <!-- Rename notebook inline -->
      <div v-if="renameNotebook.show" class="new-notebook-form">
        <input
          v-model="renameNotebook.name"
          class="new-notebook-input"
          placeholder="New name..."
          @keydown.enter="submitRenameNotebook"
          @keydown.escape="renameNotebook.show = false"
          autofocus
        />
        <div class="new-notebook-actions">
          <button class="nb-create-btn" @click="submitRenameNotebook" :disabled="!renameNotebook.name.trim()">Rename</button>
          <button class="nb-cancel-btn" @click="renameNotebook.show = false">Cancel</button>
        </div>
      </div>

      <!-- Rename stack inline -->
      <div v-if="renameStack.show" class="new-notebook-form">
        <input
          v-model="renameStack.name"
          class="new-notebook-input"
          placeholder="New stack name..."
          @keydown.enter="submitRenameStack"
          @keydown.escape="renameStack.show = false"
          autofocus
        />
        <div class="new-notebook-actions">
          <button class="nb-create-btn" @click="submitRenameStack" :disabled="!renameStack.name.trim()">Rename</button>
          <button class="nb-cancel-btn" @click="renameStack.show = false">Cancel</button>
        </div>
      </div>

      <div v-for="stack in notebooksStore.stacks" :key="stack.id" class="stack-group">
        <button class="stack-header" @click="toggleStack(stack.id)" @contextmenu="onStackContextMenu($event, stack)">
          <ChevronDown v-if="expanded.stacks.has(stack.id)" :size="14" />
          <ChevronRight v-else :size="14" />
          <span>{{ stack.name }}</span>
        </button>
        <div v-if="expanded.stacks.has(stack.id) && stack.notebooks" class="stack-notebooks">
          <button
            v-for="nb in stack.notebooks"
            :key="nb.id"
            class="nav-item notebook-item"
            :class="{ active: route.params.id === nb.id, 'drop-target': dragOverNotebook === nb.id }"
            @click="selectNotebook(nb.id)"
            @contextmenu="onNotebookContextMenu($event, nb)"
            @dragover="onNotebookDragOver($event, nb.id)"
            @dragleave="onNotebookDragLeave"
            @drop="onNotebookDrop($event, nb.id)"
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
        :class="{ active: route.params.id === nb.id, 'drop-target': dragOverNotebook === nb.id }"
        @click="selectNotebook(nb.id)"
        @contextmenu="onNotebookContextMenu($event, nb)"
        @dragover="onNotebookDragOver($event, nb.id)"
        @dragleave="onNotebookDragLeave"
        @drop="onNotebookDrop($event, nb.id)"
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
      <div class="footer-actions">
        <button
          class="footer-btn"
          :class="{ active: uiStore.noteListCollapsed && uiStore.contextPanelsCollapsed }"
          @click="uiStore.toggleFocusMode()"
          :title="(uiStore.noteListCollapsed && uiStore.contextPanelsCollapsed) ? 'Exit focus mode (Alt+\\)' : 'Focus mode — collapse panels (Alt+\\)'"
        >
          <Minimize2 v-if="!(uiStore.noteListCollapsed && uiStore.contextPanelsCollapsed)" :size="14" />
          <Maximize2 v-else :size="14" />
          <span>Focus</span>
        </button>
        <button class="footer-btn" @click="uiStore.toggleHelp()" title="Keyboard shortcuts (Alt+/)">
          <HelpCircle :size="14" />
          <span>Help</span>
        </button>
        <button class="footer-btn" @click="handleLogout" title="Sign out">
          <LogOut :size="14" />
          <span>Sign out</span>
        </button>
      </div>
      <div class="footer-user">
        <span class="user-name">{{ authStore.user?.username }}</span>
        <span class="version">v{{ version }}</span>
      </div>
    </div>

    <!-- Notebook context menu -->
    <Teleport to="body">
      <div
        v-if="nbContextMenu.show"
        class="nb-context-menu"
        :style="{ left: nbContextMenu.x + 'px', top: nbContextMenu.y + 'px' }"
      >
        <button class="nb-context-item" @click="startRenameNotebook">
          <span>Rename</span>
        </button>
        <div class="nb-context-submenu-wrapper">
          <button class="nb-context-item" @click="showMoveToStack = !showMoveToStack">
            <span>Move to stack...</span>
          </button>
          <div v-if="showMoveToStack" class="nb-context-submenu">
            <button class="nb-context-item" @click="moveNotebookToStack(null)">
              No stack
            </button>
            <button
              v-for="stack in notebooksStore.stacks"
              :key="stack.id"
              class="nb-context-item"
              @click="moveNotebookToStack(stack.id)"
            >
              {{ stack.name }}
            </button>
          </div>
        </div>
        <button class="nb-context-item delete" @click="deleteNotebook">
          <Trash2 :size="14" />
          Delete notebook
        </button>
      </div>
      <div v-if="nbContextMenu.show" class="nb-context-overlay" @click="closeNbContextMenu" />
    </Teleport>

    <!-- Stack context menu -->
    <Teleport to="body">
      <div
        v-if="stackContextMenu.show"
        class="nb-context-menu"
        :style="{ left: stackContextMenu.x + 'px', top: stackContextMenu.y + 'px' }"
      >
        <button class="nb-context-item" @click="startRenameStack">
          <span>Rename</span>
        </button>
        <button class="nb-context-item delete" @click="deleteStack">
          <Trash2 :size="14" />
          Delete stack
        </button>
      </div>
      <div v-if="stackContextMenu.show" class="nb-context-overlay" @click="closeStackContextMenu" />
    </Teleport>

    <RemindersPanel v-if="showReminders" @close="showReminders = false" />

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
  background: var(--hover-bg);
  color: var(--text-primary);
}
.nb-context-item.delete:hover {
  background: var(--status-error-bg);
  color: var(--status-error);
}

.nb-context-submenu-wrapper {
  position: relative;
}

.nb-context-submenu {
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
.nav-item:hover { background-color: var(--hover-bg); }
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

.form-type-tabs {
  display: flex;
  gap: 4px;
}

.form-type-tabs button {
  flex: 1;
  padding: 4px;
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  color: var(--text-muted);
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  cursor: pointer;
}
.form-type-tabs button:hover { border-color: var(--accent-primary); }
.form-type-tabs button.active {
  background: rgba(58, 134, 255, 0.12);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
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

.notebook-item.drop-target {
  background-color: rgba(58, 134, 255, 0.2);
  border: 1px dashed var(--accent-primary);
  border-radius: 6px;
}

.note-count {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-muted);
}

.nav-emoji {
  font-size: 14px;
  width: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.idea-badge {
  margin-left: auto;
  background: rgba(255, 159, 28, 0.25);
  color: var(--accent-warn);
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
  min-width: 16px;
  text-align: center;
}

.reminder-badge {
  margin-left: auto;
  background: var(--status-error);
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
  min-width: 16px;
  text-align: center;
}

.sidebar-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  margin-top: 8px;
  border-top: 1px solid var(--border-subtle);
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.footer-user {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 0 2px;
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

.footer-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  cursor: pointer;
  padding: 5px 8px;
  border-radius: 6px;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  white-space: nowrap;
}
.footer-btn:hover {
  color: var(--text-primary);
  border-color: var(--border-strong);
}
.footer-btn.active {
  background-color: rgba(58, 134, 255, 0.12);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}
</style>
