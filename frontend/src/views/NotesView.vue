<script setup>
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useNotesStore } from '../stores/notes.js';
import { useUIStore } from '../stores/ui.js';
import AppSidebar from '../components/sidebar/AppSidebar.vue';
import NoteListPanel from '../components/ui/NoteListPanel.vue';
import EditorToolbar from '../components/editor/EditorToolbar.vue';
import CodeMirrorEditor from '../components/editor/CodeMirrorEditor.vue';
import AttachmentZone from '../components/editor/AttachmentZone.vue';
import BacklinksPanel from '../components/editor/BacklinksPanel.vue';
import LocalGraph from '../components/editor/LocalGraph.vue';
import MobileHome from '../components/mobile/MobileHome.vue';
import MobileEditor from '../components/mobile/MobileEditor.vue';
import MobileFAB from '../components/mobile/MobileFAB.vue';
import { FileText } from 'lucide-vue-next';
import { useAttachmentsStore } from '../stores/attachments.js';
import { useNotebooksStore } from '../stores/notebooks.js';
import { useGraphStore } from '../stores/graph.js';

const attachmentsStore = useAttachmentsStore();
const notebooksStore = useNotebooksStore();
const graphStore = useGraphStore();

const route = useRoute();
const router = useRouter();
const notesStore = useNotesStore();
const uiStore = useUIStore();

const editorContent = ref('');
const noteTitle = ref('');
let saveTimer = null;

const isSourceMode = computed(() => uiStore.editorMode === 'source');

// Wikilink support: note titles for autocomplete, note map for link resolution
const noteTitles = computed(() => notesStore.notes.map(n => n.title).filter(Boolean));
const noteMap = computed(() => {
  const map = new Map();
  for (const n of notesStore.notes) {
    if (n.title) {
      map.set(n.title.toLowerCase(), { id: n.id, deleted_at: null });
    }
  }
  return map;
});

function navigateToNote(noteId) {
  router.push(`/notes/${noteId}`);
}

// Mobile detection
const isMobile = ref(window.innerWidth < 768);
const mobileSidebarOpen = ref(false);
const showMobileCapture = ref(false);

function onResize() {
  isMobile.value = window.innerWidth < 768;
  if (!isMobile.value) mobileSidebarOpen.value = false;
}

onMounted(async () => {
  window.addEventListener('resize', onResize);

  // Load notes if not already loaded
  if (notesStore.notes.length === 0) {
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
  window.removeEventListener('resize', onResize);
  if (saveTimer) clearTimeout(saveTimer);
});

// Watch route changes to load notes
watch(() => route.params.id, async (newId) => {
  if (newId && route.name === 'NoteDetail') {
    if (saveTimer) {
      clearTimeout(saveTimer);
      await saveNote();
    }
    await loadNote(newId);
  }
});

// Mobile: detect if we're viewing a specific note
const mobileShowEditor = computed(() => {
  return isMobile.value && route.params.id && route.name === 'NoteDetail';
});

async function loadNote(id) {
  const note = await notesStore.fetchNote(id);
  if (note) {
    noteTitle.value = note.title;
    editorContent.value = note.content;
    uiStore.setSaveStatus('saved');
    // Fetch backlinks and local graph in background
    graphStore.fetchBacklinks(id);
    graphStore.fetchUnlinkedMentions(id);
    graphStore.fetchLocalGraph(id);
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

function resetCheckboxes() {
  if (!editorContent.value) return;
  const count = (editorContent.value.match(/- \[x\]/gi) || []).length;
  if (count === 0) return;
  if (!confirm(`Reset ${count} checked item${count === 1 ? '' : 's'} to unchecked?`)) return;
  editorContent.value = editorContent.value.replace(/- \[x\]/gi, '- [ ]');
  scheduleSave();
}

function onInsertImage(attachment) {
  const markdownImg = `![${attachment.filename}](/api/v1/attachments/${attachment.id})`;
  editorContent.value = editorContent.value + '\n' + markdownImg + '\n';
  scheduleSave();
}

function onRemoveReference(attachmentId) {
  // Remove any ![...](/api/v1/attachments/{id}) references from editor content
  const pattern = new RegExp(`\\n?!\\[[^\\]]*\\]\\(/api/v1/attachments/${attachmentId}\\)\\n?`, 'g');
  editorContent.value = editorContent.value.replace(pattern, '\n');
  scheduleSave();
}

async function trashCurrentNote() {
  if (!notesStore.currentNote) return;
  if (saveTimer) clearTimeout(saveTimer);
  await notesStore.trashNote(notesStore.currentNote.id);
  await notebooksStore.fetchNotebooks();
  router.push('/notes');
}

function onMobileCapture() {
  // Trigger the global Alt+N handler in App.vue
  window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true, key: 'n' }));
}
</script>

<template>
  <!-- Mobile: Full-screen editor -->
  <MobileEditor
    v-if="mobileShowEditor"
    :noteId="route.params.id"
  />

  <!-- Mobile: Home screen -->
  <template v-else-if="isMobile">
    <MobileHome
      @open-sidebar="mobileSidebarOpen = true"
      @open-capture="onMobileCapture"
    />

    <!-- Mobile sidebar overlay -->
    <Teleport to="body">
      <div v-if="mobileSidebarOpen" class="mobile-sidebar-overlay" @click="mobileSidebarOpen = false" />
      <div v-if="mobileSidebarOpen" class="mobile-sidebar-drawer">
        <AppSidebar />
      </div>
    </Teleport>

    <!-- FAB (not on home screen since hero card covers it) -->
  </template>

  <!-- Desktop: Three-pane layout -->
  <div v-else class="notes-layout">
    <AppSidebar />
    <NoteListPanel />
    <main class="editor-pane">
      <template v-if="notesStore.currentNote">
        <EditorToolbar
          :noteTitle="noteTitle"
          :noteContent="editorContent"
          @update:noteTitle="onTitleChange"
          @trash="trashCurrentNote"
          @reset-checkboxes="resetCheckboxes"
        />
        <div class="editor-body">
          <CodeMirrorEditor
            :modelValue="editorContent"
            :sourceMode="isSourceMode"
            :noteTitles="noteTitles"
            :noteMap="noteMap"
            :onNavigateToNote="navigateToNote"
            @update:modelValue="onContentChange"
          />
        </div>
        <BacklinksPanel v-if="notesStore.currentNote" :noteId="notesStore.currentNote.id" />
        <LocalGraph v-if="notesStore.currentNote" :noteId="notesStore.currentNote.id" />
        <AttachmentZone @insert-image="onInsertImage" @remove-reference="onRemoveReference" />
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

<style>
/* Mobile sidebar overlay — unscoped for Teleport */
.mobile-sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
}

.mobile-sidebar-drawer {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 1001;
  width: 280px;
  max-width: 80vw;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.3);
}

.mobile-sidebar-drawer .sidebar {
  width: 100%;
  min-width: auto;
}
</style>
