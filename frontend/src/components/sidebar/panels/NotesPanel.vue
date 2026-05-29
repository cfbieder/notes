<script setup>
import { onMounted, computed, reactive, ref, watch, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useNotebooksStore } from '../../../stores/notebooks.js';
import { useNotesStore } from '../../../stores/notes.js';
import { useTagsStore } from '../../../stores/tags.js';
import { api } from '../../../api/client.js';
import ConfirmModal from '../../ui/ConfirmModal.vue';
import ImportNoteModal from '../../ui/ImportNoteModal.vue';
import {
  FileText, Inbox, ChevronRight, ChevronDown, Plus,
  FolderOpen, Tag, Trash2, Upload, CloudDownload
} from 'lucide-vue-next';
import { checkoutCount, dirtyCount } from '../../../lib/checkouts.js';

const router = useRouter();
const route = useRoute();
const notebooksStore = useNotebooksStore();
const notesStore = useNotesStore();
const tagsStore = useTagsStore();

const expanded = reactive({ stacks: new Set(), tags: false });

function getNotebookCount(nbId) {
  const nb = notebooksStore.notebooks.find(n => n.id === nbId);
  return nb ? nb.note_count : 0;
}

onMounted(async () => {
  // Ensure the trees are populated when this panel mounts. Other panels
  // also fetch what they need; duplicate calls are cheap thanks to store caching.
  await Promise.all([
    notebooksStore.fetchNotebooks(),
    notebooksStore.fetchStacks(),
    tagsStore.fetchTags()
  ]);
});

const unstackedNotebooks = computed(() =>
  notebooksStore.notebooks.filter(n => !n.stack_id && !n.is_default)
);

function visibleStackNotebooks(stack) {
  return (stack.notebooks || []).filter(n => !n.is_default);
}

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
  notesStore.setFilter('in_inbox', 'true');
  notesStore.fetchNotes();
  router.push('/inbox');
}

function goToAllNotes() {
  notesStore.clearFilters();
  notesStore.fetchNotes();
  router.push('/notes');
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
  await notesStore.updateNote(noteId, { notebook_id: nbId });
  await notesStore.fetchNotes();
  await notebooksStore.fetchNotebooks();
}

// Split-button new note: main click uses last-used format (defaults to markdown);
// the dropdown caret offers an explicit Markdown / HTML choice. The chosen
// format is remembered for the session only — a reload resets to markdown.
const lastUsedFormat = ref('markdown');
const newNoteMenuOpen = ref(false);
const showImportModal = ref(false);
const newNoteGroupRef = ref(null);

function handleDocClick(e) {
  if (!newNoteMenuOpen.value) return;
  if (newNoteGroupRef.value && !newNoteGroupRef.value.contains(e.target)) {
    newNoteMenuOpen.value = false;
  }
}

watch(newNoteMenuOpen, (open) => {
  if (open) {
    document.addEventListener('click', handleDocClick);
  } else {
    document.removeEventListener('click', handleDocClick);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocClick);
});

async function handleNewNote(format) {
  const fmt = format || lastUsedFormat.value;
  lastUsedFormat.value = fmt;
  newNoteMenuOpen.value = false;

  const payload = { title: 'Untitled', content: '', format: fmt };
  if (route.name === 'NotebookNotes' && route.params.id) {
    payload.notebook_id = route.params.id;
  }
  const note = await notesStore.createNote(payload);
  router.push(`/notes/${note.id}`);
}

function openImportModal() {
  newNoteMenuOpen.value = false;
  showImportModal.value = true;
}

async function onImportComplete(noteId) {
  showImportModal.value = false;
  await notesStore.fetchNotes();
  router.push(`/notes/${noteId}`);
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

function startRenameNotebook() {
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
  <div class="notes-panel">
    <div class="panel-header">
      <h3>Notes</h3>
    </div>

    <div class="new-note-group" ref="newNoteGroupRef">
      <button class="new-note-btn split-main" @click="handleNewNote()">
        <Plus :size="16" />
        New Note
      </button>
      <button
        class="new-note-btn split-caret"
        :class="{ open: newNoteMenuOpen }"
        @click="newNoteMenuOpen = !newNoteMenuOpen"
        aria-label="New note options"
      >
        <ChevronDown :size="14" />
      </button>
      <div v-if="newNoteMenuOpen" class="new-note-menu">
        <button class="menu-item" @click="handleNewNote('markdown')">
          <FileText :size="14" /> Markdown
        </button>
        <button class="menu-item" @click="handleNewNote('html')">
          <FileText :size="14" /> HTML
        </button>
        <div class="menu-sep" />
        <button class="menu-item" @click="openImportModal">
          <Upload :size="14" /> Import file…
        </button>
      </div>
    </div>
    <ImportNoteModal v-if="showImportModal" @imported="onImportComplete" @cancel="showImportModal = false" />

    <nav class="panel-nav">
      <button class="nav-item" :class="{ active: route.path === '/inbox' }" @click="goToInbox">
        <Inbox :size="16" />
        <span>Inbox</span>
      </button>
      <button class="nav-item" :class="{ active: route.path === '/notes' }" @click="goToAllNotes">
        <FileText :size="16" />
        <span>All Notes</span>
      </button>
      <button
        v-if="checkoutCount > 0"
        class="nav-item"
        :class="{ active: route.path === '/offline' }"
        @click="router.push('/offline')"
        title="Notes available offline"
      >
        <CloudDownload :size="16" />
        <span>Offline ({{ checkoutCount }})</span>
        <span v-if="dirtyCount > 0" class="nav-badge" :title="`${dirtyCount} with unsaved changes`">{{ dirtyCount }}</span>
      </button>
    </nav>

    <div class="panel-section">
      <div class="section-label-row">
        <span class="section-label">Notebooks</span>
        <button class="section-add-btn" @click="showNewForm = !showNewForm" title="New notebook or stack">
          <Plus :size="12" />
        </button>
      </div>

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
            v-for="nb in visibleStackNotebooks(stack)"
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

    <div class="panel-section tags-section">
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

    <ConfirmModal
      v-if="confirmModal.show"
      :title="confirmModal.title"
      :message="confirmModal.message"
      :danger="confirmModal.danger"
      confirm-text="Delete"
      @confirm="confirmModal.onConfirm"
      @cancel="confirmModal.onCancel"
    />
  </div>
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
.notes-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px 12px 8px;
  box-sizing: border-box;
  overflow: hidden;
}

.panel-header {
  padding: 0 8px 12px;
}

.panel-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  text-transform: none;
  letter-spacing: 0;
}

.new-note-group {
  position: relative;
  display: flex;
  margin-bottom: 14px;
}

.new-note-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: var(--accent-warn);
  color: var(--on-accent-warn);
  border: none;
  font-weight: 600;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  cursor: pointer;
  transition: opacity 0.15s;
}
.new-note-btn:hover { opacity: 0.88; }

.new-note-btn.split-main {
  flex: 1;
  border-radius: 8px 0 0 8px;
  justify-content: flex-start;
}

.new-note-btn.split-caret {
  padding: 8px 8px;
  border-radius: 0 8px 8px 0;
  border-left: 1px solid rgba(0, 0, 0, 0.15);
  justify-content: center;
}
.new-note-btn.split-caret.open { background-color: var(--accent-warn-hover, var(--accent-warn)); }

.new-note-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 4px;
  z-index: 30;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.new-note-menu .menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  background: none;
  color: var(--text-primary);
  border: none;
  border-radius: 4px;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.new-note-menu .menu-item:hover {
  background: var(--hover-bg);
}

.new-note-menu .menu-sep {
  height: 1px;
  background: var(--border-subtle);
  margin: 4px 6px;
}

.panel-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 14px;
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

.nav-badge {
  margin-left: auto;
  background: var(--accent-warn, #ffb800);
  color: var(--on-accent-warn, #1a1a1a);
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 8px;
  min-width: 16px;
  text-align: center;
}

.nav-item.active {
  background-color: var(--rail-active);
  color: var(--text-primary);
}

.panel-section {
  overflow-y: auto;
}

.panel-section:first-of-type {
  flex: 1;
}

.tags-section {
  max-height: 220px;
  margin-top: 8px;
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
  padding: 0 12px;
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
</style>
