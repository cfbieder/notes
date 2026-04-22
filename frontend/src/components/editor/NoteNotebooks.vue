<script setup>
import { ref, computed, onMounted } from 'vue';
import { useNotebooksStore } from '../../stores/notebooks.js';
import { useNotesStore } from '../../stores/notes.js';
import { Notebook, Plus, ChevronDown } from 'lucide-vue-next';

const notebooksStore = useNotebooksStore();
const notesStore = useNotesStore();

const showDropdown = ref(false);
const filterText = ref('');
const creating = ref(false);
const newNotebookName = ref('');

onMounted(() => {
  if (!notebooksStore.notebooks.length) notebooksStore.fetchNotebooks();
});

const currentNotebook = computed(() => {
  const id = notesStore.currentNote?.notebook_id;
  if (!id) return null;
  return notebooksStore.notebooks.find(n => n.id === id) || null;
});

const buttonLabel = computed(() => currentNotebook.value?.name || 'No notebook');

const filteredNotebooks = computed(() => {
  const q = filterText.value.trim().toLowerCase();
  const list = notebooksStore.notebooks;
  if (!q) return list;
  return list.filter(n => n.name.toLowerCase().includes(q));
});

function toggleDropdown() {
  showDropdown.value = !showDropdown.value;
  if (showDropdown.value) {
    filterText.value = '';
    creating.value = false;
    newNotebookName.value = '';
  }
}

async function selectNotebook(notebook) {
  if (!notesStore.currentNote) return;
  await notesStore.updateNote(notesStore.currentNote.id, {
    notebook_id: notebook.id,
    is_inbox: false
  });
  await Promise.all([
    notesStore.fetchNote(notesStore.currentNote.id),
    notesStore.fetchNotes(),
    notebooksStore.fetchNotebooks()
  ]);
  showDropdown.value = false;
}

function startCreate() {
  creating.value = true;
  newNotebookName.value = filterText.value;
}

async function createAndSelect() {
  const name = newNotebookName.value.trim();
  if (!name) return;
  const notebook = await notebooksStore.createNotebook(name, null);
  await selectNotebook(notebook);
}
</script>

<template>
  <div class="note-notebook">
    <div class="picker-wrapper">
      <button class="notebook-btn" @click="toggleDropdown">
        <Notebook :size="12" />
        <span>{{ buttonLabel }}</span>
        <ChevronDown :size="10" />
      </button>

      <div v-if="showDropdown" class="notebook-dropdown">
        <input
          v-if="!creating"
          v-model="filterText"
          class="notebook-input"
          placeholder="Filter notebooks..."
          @keydown.escape="showDropdown = false"
          autofocus
        />
        <input
          v-else
          v-model="newNotebookName"
          class="notebook-input"
          placeholder="New notebook name..."
          @keydown.enter="createAndSelect"
          @keydown.escape="creating = false"
          autofocus
        />

        <template v-if="!creating">
          <button
            v-for="nb in filteredNotebooks"
            :key="nb.id"
            class="notebook-option"
            :class="{ active: currentNotebook && currentNotebook.id === nb.id }"
            @click="selectNotebook(nb)"
          >
            <Notebook :size="12" />
            {{ nb.name }}
          </button>
          <div v-if="filteredNotebooks.length === 0" class="notebook-empty">
            No matching notebooks
          </div>
          <button class="notebook-create" @click="startCreate">
            <Plus :size="12" />
            New notebook…
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.note-notebook {
  display: flex;
  align-items: center;
}

.picker-wrapper {
  position: relative;
}

.notebook-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  cursor: pointer;
}
.notebook-btn:hover {
  border-color: var(--accent-primary);
  color: var(--text-primary);
}

.notebook-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 4px;
  min-width: 200px;
  max-height: 320px;
  overflow-y: auto;
  box-shadow: var(--shadow-sm);
  z-index: 100;
}

.notebook-input {
  width: 100%;
  padding: 6px 8px;
  background: var(--bg-main);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  margin-bottom: 4px;
  box-sizing: border-box;
}
.notebook-input:focus { outline: none; border-color: var(--accent-primary); }

.notebook-option {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 8px;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}
.notebook-option:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}
.notebook-option.active {
  color: var(--accent-primary);
}

.notebook-empty {
  padding: 6px 8px;
  color: var(--text-muted);
  font-size: 11px;
}

.notebook-create {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 8px;
  margin-top: 4px;
  border-top: 1px solid var(--border-subtle);
  background: none;
  border-left: none;
  border-right: none;
  border-bottom: none;
  color: var(--accent-primary);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}
.notebook-create:hover {
  background: rgba(58, 134, 255, 0.08);
}
</style>
