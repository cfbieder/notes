<script setup>
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useNotesStore } from '../stores/notes.js';
import { useIdeasStore } from '../stores/ideas.js';
import { useUIStore } from '../stores/ui.js';
import { api } from '../api/client.js';
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
import ConfirmModal from '../components/ui/ConfirmModal.vue';
import InsertTableModal from '../components/ui/InsertTableModal.vue';
import TableEditorModal from '../components/ui/TableEditorModal.vue';
import { FileText, X, Search } from 'lucide-vue-next';
import { useAttachmentsStore } from '../stores/attachments.js';
import { useNotebooksStore } from '../stores/notebooks.js';
import { useGraphStore } from '../stores/graph.js';
import { useAIAssistStore } from '../stores/aiAssist.js';
import { useToastsStore } from '../stores/toasts.js';
import { printNote } from '../lib/printNote.js';
import { sanitizeNoteHtml } from '../lib/htmlSanitize.js';

const attachmentsStore = useAttachmentsStore();
const notebooksStore = useNotebooksStore();
const graphStore = useGraphStore();
const aiAssistStore = useAIAssistStore();
const toastsStore = useToastsStore();

const route = useRoute();
const router = useRouter();
const notesStore = useNotesStore();
const ideasStore = useIdeasStore();
const uiStore = useUIStore();

// Idea toolbar actions: promote + merge modals
const promoteModal = ref({ show: false });
const mergeModal = ref({ show: false, query: '', results: [], loading: false });

// Translate modal (Phase 8.11) — calls POST /notes/:id/translate, which
// appends a translated block to the note content.
const TRANSLATE_LANGS = [
  ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'],
  ['it', 'Italian'], ['pt', 'Portuguese'], ['nl', 'Dutch'], ['pl', 'Polish'],
  ['ru', 'Russian'], ['uk', 'Ukrainian'], ['zh', 'Chinese'], ['ja', 'Japanese'],
  ['ko', 'Korean'], ['ar', 'Arabic'], ['hi', 'Hindi'], ['tr', 'Turkish'],
  ['sv', 'Swedish'], ['da', 'Danish'], ['no', 'Norwegian'], ['fi', 'Finnish'],
  ['cs', 'Czech'], ['el', 'Greek'], ['he', 'Hebrew'], ['id', 'Indonesian'],
  ['th', 'Thai'], ['vi', 'Vietnamese'], ['ro', 'Romanian'], ['hu', 'Hungarian']
];
const translateModal = ref({
  show: false,
  sourceLang: 'en',
  targetLang: 'es',
  loading: false,
  error: ''
});

function openPromoteModal() { promoteModal.value = { show: true }; }
function openMergeModal() { mergeModal.value = { show: true, query: '', results: [], loading: false }; }
function openTranslateModal() {
  translateModal.value = {
    show: true, sourceLang: 'en', targetLang: 'es', loading: false, error: ''
  };
}

async function setNoteReminder(value) {
  if (!notesStore.currentNote) return;
  await notesStore.updateNote(notesStore.currentNote.id, { reminder_at: value });
}

async function toggleAutoUpdate() {
  if (!notesStore.currentNote) return;
  const newVal = !notesStore.currentNote.auto_update;
  await notesStore.updateNote(notesStore.currentNote.id, { auto_update: newVal });
}

function handlePrint() {
  if (!notesStore.currentNote) return;
  printNote(noteTitle.value, editorContent.value, noteFormat.value);
}

function handleDownload() {
  if (!notesStore.currentNote) return;
  const title = noteTitle.value || 'Untitled';
  const isHtml = noteFormat.value === 'html';
  const ext = isHtml ? '.html' : '.md';
  const mime = isHtml ? 'text/html;charset=utf-8' : 'text/markdown;charset=utf-8';
  const filename = title.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_') + ext;
  const blob = new Blob([editorContent.value], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function confirmTranslate() {
  if (!notesStore.currentNote) return;
  const { sourceLang, targetLang } = translateModal.value;
  if (sourceLang === targetLang) {
    translateModal.value.error = 'Source and target language must differ';
    return;
  }
  translateModal.value.loading = true;
  translateModal.value.error = '';
  try {
    const id = notesStore.currentNote.id;
    const res = await api.post(`/notes/${id}/translate`, {
      source_lang: sourceLang,
      target_lang: targetLang
    });
    // Backend returns the updated note. Refresh local state.
    if (res.data?.content !== undefined) {
      editorContent.value = res.data.content;
      notesStore.currentNote.content = res.data.content;
      uiStore.setSaveStatus('saved');
    }
    translateModal.value.show = false;
  } catch (err) {
    translateModal.value.error = err?.message || 'Translation failed';
  } finally {
    translateModal.value.loading = false;
  }
}

async function confirmPromote(notebookId) {
  if (!notesStore.currentNote) return;
  const id = notesStore.currentNote.id;
  promoteModal.value.show = false;
  await ideasStore.promoteIdea(id, notebookId);
  await notesStore.fetchNote(id);
  router.push(`/notes/${id}`);
}

let mergeSearchTimer = null;
function onMergeSearchInput() {
  clearTimeout(mergeSearchTimer);
  mergeSearchTimer = setTimeout(async () => {
    const q = mergeModal.value.query.trim();
    if (!q) { mergeModal.value.results = []; return; }
    mergeModal.value.loading = true;
    try {
      const res = await api.get(`/notes?note_type=note&search=${encodeURIComponent(q)}&limit=20`);
      mergeModal.value.results = res.data;
    } catch {
      mergeModal.value.results = [];
    } finally {
      mergeModal.value.loading = false;
    }
  }, 200);
}

async function confirmMerge(targetNoteId) {
  if (!notesStore.currentNote) return;
  const id = notesStore.currentNote.id;
  mergeModal.value.show = false;
  await ideasStore.mergeIdea(id, targetNoteId);
  router.push(`/notes/${targetNoteId}`);
}

async function convertIdeaToTask() {
  if (!notesStore.currentNote) return;
  const id = notesStore.currentNote.id;
  try {
    await ideasStore.convertToTask(id);
    toastsStore.addToast({ message: 'Idea converted to task', type: 'success' });
    router.push('/tasks');
  } catch (e) {
    toastsStore.addToast({ message: e.message || 'Failed to convert idea', type: 'error' });
  }
}

function getMergePreview(content) {
  if (!content) return '';
  return content.replace(/\n/g, ' ').slice(0, 80);
}

const editorContent = ref('');
const noteTitle = ref('');
let saveTimer = null;

const isSourceMode = computed(() => uiStore.editorMode === 'source');

// HTML notes default to a sanitized read view; "Edit source" toggles to a
// plain-text CodeMirror surface. Resets when the loaded note changes.
const htmlEditMode = ref(false);
const noteFormat = computed(() => notesStore.currentNote?.format || 'markdown');
const isHtmlNote = computed(() => noteFormat.value === 'html');
const renderedHtml = computed(() =>
  isHtmlNote.value ? sanitizeNoteHtml(editorContent.value) : ''
);

const resetConfirm = ref({ open: false, count: 0 });
const insertTableOpen = ref(false);
const tableEditor = ref({ open: false, from: 0, to: 0, text: '' });
const editorRef = ref(null);

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
  if (route.name === 'IdeaDetail') {
    router.push(`/ideas/${noteId}`);
  } else {
    router.push(`/notes/${noteId}`);
  }
}

// Mobile detection
const isMobile = ref(window.innerWidth < 768);
const mobileSidebarOpen = ref(false);
const showMobileCapture = ref(false);

function onResize() {
  isMobile.value = window.innerWidth < 768;
  if (!isMobile.value) mobileSidebarOpen.value = false;
}

// Register the editor with the AI Assist store so the modal can offer
// "Insert at cursor" while a note is open. Watching `editorRef` because the
// CodeMirrorEditor mounts only when a note is loaded.
watch(editorRef, (handle, prev) => {
  if (prev) aiAssistStore.unregisterEditor(prev);
  if (handle) aiAssistStore.registerEditor(handle);
});

onMounted(async () => {
  window.addEventListener('resize', onResize);

  // For idea routes, scope the left list to ideas only
  if (route.name === 'IdeaDetail' || route.name === 'Ideas') {
    notesStore.clearFilters();
    notesStore.setFilter('note_type', 'idea');
    await notesStore.fetchNotes();
  } else if (notesStore.notes.length === 0) {
    if (route.params.id && route.name === 'NotebookNotes') {
      notesStore.setFilter('notebook_id', route.params.id);
    }
    await notesStore.fetchNotes();
  }

  // Load specific note if routed to one
  if (route.params.id && (route.name === 'NoteDetail' || route.name === 'IdeaDetail')) {
    await loadNote(route.params.id);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  if (saveTimer) clearTimeout(saveTimer);
  if (editorRef.value) aiAssistStore.unregisterEditor(editorRef.value);
});

// Watch route changes to load notes
watch(() => route.params.id, async (newId) => {
  if (newId && (route.name === 'NoteDetail' || route.name === 'IdeaDetail')) {
    if (saveTimer) {
      clearTimeout(saveTimer);
      await saveNote();
    }
    await loadNote(newId);
  }
});

// Mobile: detect if we're viewing a specific note
const mobileShowEditor = computed(() => {
  return isMobile.value && route.params.id && (route.name === 'NoteDetail' || route.name === 'IdeaDetail');
});

async function loadNote(id) {
  const note = await notesStore.fetchNote(id);
  if (note) {
    noteTitle.value = note.title;
    editorContent.value = note.content;
    htmlEditMode.value = false;
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
  resetConfirm.value = { open: true, count };
}

function openInsertTable() {
  insertTableOpen.value = true;
}

function onInsertTable(tableMarkdown) {
  insertTableOpen.value = false;
  if (editorRef.value && typeof editorRef.value.insertAtCursor === 'function') {
    editorRef.value.insertAtCursor(tableMarkdown);
  } else {
    editorContent.value = editorContent.value + '\n\n' + tableMarkdown + '\n';
  }
  scheduleSave();
}

function onEditTable({ from, to, text }) {
  tableEditor.value = { open: true, from, to, text };
}

function onSaveTable(newText) {
  const { from, to, text } = tableEditor.value;
  tableEditor.value = { open: false, from: 0, to: 0, text: '' };
  if (!editorRef.value) return;
  // Re-locate the original table text in case the doc shifted during edit
  // (e.g. autosave-triggered replacement or concurrent typing elsewhere).
  let targetFrom = from;
  let targetTo = to;
  if (typeof editorRef.value.findRange === 'function') {
    const located = editorRef.value.findRange(text);
    if (located) {
      targetFrom = located.from;
      targetTo = located.to;
    }
  }
  editorRef.value.replaceRange(targetFrom, targetTo, newText);
  scheduleSave();
}

function confirmResetCheckboxes() {
  editorContent.value = editorContent.value.replace(/- \[x\]/gi, '- [ ]');
  resetConfirm.value.open = false;
  scheduleSave();
}

function onInsertImage(attachment) {
  const markdownImg = `![${attachment.filename}](/api/v1/attachments/${attachment.id})`;
  editorContent.value = editorContent.value + '\n' + markdownImg + '\n';
  scheduleSave();
}

async function onPasteImage(file) {
  if (!notesStore.currentNote) return;
  try {
    const ext = (file.type.split('/')[1] || 'png').split('+')[0];
    const name = file.name && file.name !== 'image.png'
      ? file.name
      : `pasted-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
    const namedFile = new File([file], name, { type: file.type });
    const attachment = await attachmentsStore.uploadFile(notesStore.currentNote.id, namedFile);
    const markdownImg = `![${attachment.filename}](/api/v1/attachments/${attachment.id})`;
    if (editorRef.value && typeof editorRef.value.insertAtCursor === 'function') {
      editorRef.value.insertAtCursor(markdownImg);
      scheduleSave();
    } else {
      onInsertImage(attachment);
    }
  } catch (err) {
    console.error('Paste image upload failed', err);
  }
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
  const wasIdea = notesStore.currentNote.note_type === 'idea';
  await notesStore.trashNote(notesStore.currentNote.id);
  await notebooksStore.fetchNotebooks();
  router.push(wasIdea ? '/ideas' : '/notes');
}

function onMobileCapture() {
  // Trigger the global Alt+N handler in App.vue
  window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true, key: 'n' }));
}

function onMobileVoiceCapture() {
  // Trigger the global Alt+V handler in App.vue
  window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true, key: 'v' }));
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
      @open-voice-capture="onMobileVoiceCapture"
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
    <NoteListPanel v-if="!uiStore.noteListCollapsed" />
    <main class="editor-pane">
      <div v-if="!notesStore.currentNote" class="no-note">
        <FileText :size="48" />
        <p>Select a note or create a new one</p>
      </div>
      <template v-if="notesStore.currentNote">
        <EditorToolbar
          :noteTitle="noteTitle"
          :noteContent="editorContent"
          :noteType="notesStore.currentNote?.note_type"
          :reminderAt="notesStore.currentNote?.reminder_at"
          :driveImported="notesStore.currentNote?.drive_imported || false"
          :autoUpdate="notesStore.currentNote?.auto_update || false"
          @update:noteTitle="onTitleChange"
          @trash="trashCurrentNote"
          @reset-checkboxes="resetCheckboxes"
          @promote="openPromoteModal"
          @merge="openMergeModal"
          @convert-to-task="convertIdeaToTask"
          @translate="openTranslateModal"
          @insert-table="openInsertTable"
          @set-reminder="setNoteReminder"
          @print="handlePrint"
          @download="handleDownload"
          @toggle-auto-update="toggleAutoUpdate"
        />
        <div class="editor-body">
          <template v-if="isHtmlNote && !htmlEditMode">
            <div class="html-note-toolbar">
              <button class="btn-edit-source" @click="htmlEditMode = true">Edit source</button>
            </div>
            <article class="note-html" v-html="renderedHtml" />
          </template>
          <template v-else>
            <div v-if="isHtmlNote" class="html-note-toolbar">
              <button class="btn-edit-source" @click="htmlEditMode = false">Done editing</button>
            </div>
            <CodeMirrorEditor
              ref="editorRef"
              :modelValue="editorContent"
              :sourceMode="isSourceMode"
              :format="noteFormat"
              :noteTitles="noteTitles"
              :noteMap="noteMap"
              :onNavigateToNote="navigateToNote"
              @update:modelValue="onContentChange"
              @paste-image="onPasteImage"
              @edit-table="onEditTable"
            />
          </template>
        </div>
        <template v-if="!uiStore.contextPanelsCollapsed">
          <BacklinksPanel v-if="notesStore.currentNote" :noteId="notesStore.currentNote.id" />
          <LocalGraph v-if="notesStore.currentNote" :noteId="notesStore.currentNote.id" />
          <AttachmentZone @insert-image="onInsertImage" @remove-reference="onRemoveReference" />
        </template>
      </template>
      <ConfirmModal
        v-if="resetConfirm.open"
        title="Reset Checkboxes"
        :message="`Reset ${resetConfirm.count} checked item${resetConfirm.count === 1 ? '' : 's'} to unchecked?`"
        confirmText="Reset"
        @confirm="confirmResetCheckboxes"
        @cancel="resetConfirm.open = false"
      />
      <InsertTableModal
        v-if="insertTableOpen"
        @insert="onInsertTable"
        @cancel="insertTableOpen = false"
      />
      <TableEditorModal
        v-if="tableEditor.open"
        :initialText="tableEditor.text"
        @save="onSaveTable"
        @cancel="tableEditor = { open: false, from: 0, to: 0, text: '' }"
      />
    </main>

    <!-- Promote modal -->
    <Teleport to="body">
      <div v-if="promoteModal.show" class="modal-overlay" @click.self="promoteModal.show = false">
        <div class="picker-modal">
          <div class="picker-header">
            <span>Promote idea — pick a notebook</span>
            <button class="picker-close" @click="promoteModal.show = false"><X :size="16" /></button>
          </div>
          <div class="picker-list">
            <button
              v-for="nb in notebooksStore.notebooks"
              :key="nb.id"
              class="picker-item"
              @click="confirmPromote(nb.id)"
            >
              {{ nb.name }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Merge modal -->
    <Teleport to="body">
      <div v-if="mergeModal.show" class="modal-overlay" @click.self="mergeModal.show = false">
        <div class="picker-modal">
          <div class="picker-header">
            <span>Move idea to note — pick target</span>
            <button class="picker-close" @click="mergeModal.show = false"><X :size="16" /></button>
          </div>
          <div class="picker-search">
            <Search :size="14" />
            <input
              v-model="mergeModal.query"
              class="picker-search-input"
              type="text"
              placeholder="Search notes..."
              autofocus
              @input="onMergeSearchInput"
            />
          </div>
          <div class="picker-list">
            <div v-if="mergeModal.loading" class="picker-empty">Searching...</div>
            <button
              v-for="note in mergeModal.results"
              :key="note.id"
              class="picker-item"
              @click="confirmMerge(note.id)"
            >
              <div class="picker-item-title">{{ note.title }}</div>
              <div class="picker-item-preview">{{ getMergePreview(note.content) }}</div>
            </button>
            <div v-if="!mergeModal.loading && mergeModal.query && mergeModal.results.length === 0" class="picker-empty">No notes match</div>
            <div v-if="!mergeModal.query" class="picker-empty">Type to search notes</div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Translate modal -->
    <Teleport to="body">
      <div v-if="translateModal.show" class="modal-overlay" @click.self="!translateModal.loading && (translateModal.show = false)">
        <div class="picker-modal translate-modal">
          <div class="picker-header">
            <span>Translate note</span>
            <button class="picker-close" @click="translateModal.show = false" :disabled="translateModal.loading">
              <X :size="16" />
            </button>
          </div>
          <div class="translate-body">
            <div class="translate-row">
              <label>
                <span>From</span>
                <select v-model="translateModal.sourceLang" :disabled="translateModal.loading">
                  <option v-for="[code, name] in TRANSLATE_LANGS" :key="'s' + code" :value="code">{{ name }}</option>
                </select>
              </label>
              <label>
                <span>To</span>
                <select v-model="translateModal.targetLang" :disabled="translateModal.loading">
                  <option v-for="[code, name] in TRANSLATE_LANGS" :key="'t' + code" :value="code">{{ name }}</option>
                </select>
              </label>
            </div>
            <p class="translate-hint">
              The translated text will be appended below the original content.
              Long notes are truncated at 8000 characters. Translation runs on the
              local LLM gateway and may take 15–60 seconds.
            </p>
            <div v-if="translateModal.error" class="translate-error">{{ translateModal.error }}</div>
            <div class="translate-actions">
              <button class="translate-cancel" @click="translateModal.show = false" :disabled="translateModal.loading">
                Cancel
              </button>
              <button class="translate-confirm" @click="confirmTranslate" :disabled="translateModal.loading">
                {{ translateModal.loading ? 'Translating…' : 'Translate' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
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
  flex-direction: column;
}

.html-note-toolbar {
  display: flex;
  justify-content: flex-end;
  padding: 8px 0 4px;
}

.btn-edit-source {
  background: var(--bg-elevated, var(--bg-main));
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}

.btn-edit-source:hover {
  background: var(--bg-hover, var(--bg-elevated));
}

:deep(.note-html) {
  flex: 1;
  overflow: auto;
  max-width: 880px;
  margin: 0 auto;
  padding: 16px 0 32px;
  color: var(--text-primary);
  line-height: 1.6;
}

:deep(.note-html img),
:deep(.note-html svg) {
  max-width: 100%;
  height: auto;
}

:deep(.note-html table) {
  border-collapse: collapse;
}

:deep(.note-html pre) {
  white-space: pre-wrap;
  word-break: break-word;
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
/* Picker modals (Promote / Merge) — unscoped for Teleport */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-modal);
  display: flex;
  justify-content: center;
  padding-top: 15vh;
  z-index: 1500;
}
.picker-modal {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  width: 480px;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}
.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle);
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}
.picker-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
}
.picker-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-muted);
}
.picker-search-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
}
.picker-list {
  overflow-y: auto;
  padding: 4px;
  flex: 1;
}
.picker-item {
  display: block;
  width: 100%;
  padding: 10px 12px;
  background: none;
  border: none;
  border-radius: 6px;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.picker-item:hover {
  background: rgba(58, 134, 255, 0.1);
  color: var(--text-primary);
}
.picker-item-title { font-weight: 500; color: var(--text-primary); }
.picker-item-preview {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.picker-empty {
  padding: 16px;
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
}

/* Translate modal — unscoped for Teleport */
.translate-modal {
  max-height: none !important;
  width: 440px !important;
}
.translate-modal .translate-body {
  padding: 18px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.translate-modal .translate-row {
  display: flex;
  gap: 14px;
}
.translate-modal .translate-row label {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.translate-modal .translate-row span {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.04em;
}
.translate-modal select {
  background: var(--bg-main);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
}
.translate-modal .translate-hint {
  margin: 0;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.5;
}
.translate-modal .translate-error {
  background: var(--status-error-bg);
  border: 1px solid var(--status-error);
  border-radius: 6px;
  padding: 8px 10px;
  color: var(--status-error);
  font-size: 12px;
}
.translate-modal .translate-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}
.translate-modal .translate-cancel,
.translate-modal .translate-confirm {
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid var(--border-subtle);
  font-family: inherit;
}
.translate-modal .translate-cancel {
  background: none;
  color: var(--text-secondary);
}
.translate-modal .translate-cancel:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--text-muted);
}
.translate-modal .translate-confirm {
  background: var(--accent-primary);
  color: #fff;
  border-color: var(--accent-primary);
}
.translate-modal .translate-confirm:hover:not(:disabled) {
  filter: brightness(1.1);
}
.translate-modal button:disabled {
  opacity: 0.5;
  cursor: wait;
}

/* Mobile sidebar overlay — unscoped for Teleport */
.mobile-sidebar-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-modal);
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
