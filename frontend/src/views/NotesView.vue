<script setup>
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useNotesStore } from '../stores/notes.js';
import { useUIStore } from '../stores/ui.js';
import AppSidebar from '../components/sidebar/AppSidebar.vue';
import NoteListPanel from '../components/ui/NoteListPanel.vue';
import EditorToolbar from '../components/editor/EditorToolbar.vue';
import CodeMirrorEditor from '../components/editor/CodeMirrorEditor.vue';
import { FileText } from 'lucide-vue-next';

const route = useRoute();
const router = useRouter();
const notesStore = useNotesStore();
const uiStore = useUIStore();

const editorContent = ref('');
const noteTitle = ref('');
let saveTimer = null;

const isSourceMode = computed(() => uiStore.editorMode === 'source');

onMounted(async () => {
  // Load notes if not already loaded
  if (notesStore.notes.length === 0) {
    // Check if we're on a notebook route
    if (route.params.id && route.name === 'NotebookNotes') {
      notesStore.setFilter('notebook_id', route.params.id);
    }
    await notesStore.fetchNotes();
  }

  // Load specific note if routed to one
  if (route.params.id && route.name === 'NoteDetail') {
    await loadNote(route.params.id);
  }
});

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer);
});

// Watch route changes to load notes
watch(() => route.params.id, async (newId) => {
  if (newId && route.name === 'NoteDetail') {
    // Save any pending changes before switching
    if (saveTimer) {
      clearTimeout(saveTimer);
      await saveNote();
    }
    await loadNote(newId);
  }
});

async function loadNote(id) {
  const note = await notesStore.fetchNote(id);
  if (note) {
    noteTitle.value = note.title;
    editorContent.value = note.content;
    uiStore.setSaveStatus('saved');
  }
}

function onContentChange(newContent) {
  editorContent.value = newContent;
  scheduleSave();
}

function onTitleChange(newTitle) {
  noteTitle.value = newTitle;
  scheduleSave();
}

function scheduleSave() {
  uiStore.setSaveStatus('unsaved');
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNote, 500);
}

async function saveNote() {
  if (!notesStore.currentNote) return;

  uiStore.setSaveStatus('saving');
  try {
    await notesStore.updateNote(notesStore.currentNote.id, {
      title: noteTitle.value,
      content: editorContent.value
    });
    uiStore.setSaveStatus('saved');
  } catch {
    uiStore.setSaveStatus('unsaved');
  }
}
</script>

<template>
  <div class="notes-layout">
    <AppSidebar />
    <NoteListPanel />
    <main class="editor-pane">
      <template v-if="notesStore.currentNote">
        <EditorToolbar
          :noteTitle="noteTitle"
          @update:noteTitle="onTitleChange"
        />
        <div class="editor-body">
          <CodeMirrorEditor
            :modelValue="editorContent"
            :sourceMode="isSourceMode"
            @update:modelValue="onContentChange"
          />
        </div>
      </template>
      <div v-else class="no-note">
        <FileText :size="48" />
        <p>Select a note or create a new one</p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.notes-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.editor-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-main);
  overflow: hidden;
}

.editor-body {
  flex: 1;
  padding: 0 24px;
  overflow: hidden;
  display: flex;
}

.no-note {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  gap: 12px;
  font-size: 15px;
}
</style>
