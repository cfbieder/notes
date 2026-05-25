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
import MobileNotesList from '../components/mobile/MobileNotesList.vue';
import MobileFAB from '../components/mobile/MobileFAB.vue';
import ConfirmModal from '../components/ui/ConfirmModal.vue';
import InsertTableModal from '../components/ui/InsertTableModal.vue';
import TableEditorModal from '../components/ui/TableEditorModal.vue';
import CheckoutBanner from '../components/ui/CheckoutBanner.vue';
import { FileText, X, Search } from 'lucide-vue-next';
import { getCheckout } from '../lib/checkouts.js';
import { flush as flushCheckouts } from '../lib/checkoutSync.js';
import { useAttachmentsStore } from '../stores/attachments.js';
import { useNotebooksStore } from '../stores/notebooks.js';
import { useGraphStore } from '../stores/graph.js';
import { useAIAssistStore } from '../stores/aiAssist.js';
import { useToastsStore } from '../stores/toasts.js';
import { printNote } from '../lib/printNote.js';
import { sanitizeNoteHtml, sanitizeNoteHtmlSplit } from '../lib/htmlSanitize.js';

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

// True when the route addresses a specific note (NoteDetail / IdeaDetail).
// On list-only routes (Notes, NotebookNotes, TagNotes, Ideas) we hide the
// editor pane entirely and let the note list expand — mirroring Inbox.
const isDetailRoute = computed(() =>
  route.name === 'NoteDetail' || route.name === 'IdeaDetail'
);

// HTML notes default to a sanitized read view; "Edit source" toggles to a
// plain-text CodeMirror surface. Resets when the loaded note changes.
const htmlEditMode = ref(false);
const noteFormat = computed(() => notesStore.currentNote?.format || 'markdown');
const isHtmlNote = computed(() => noteFormat.value === 'html');
// Belt-and-braces approach: the sanitized output keeps the <style> tag
// inside the article (works in most browsers), AND we mount the same CSS in
// a real <style> element appended to <head>. The duplication is harmless
// (two identical rule sets, same specificity) and rules out either path
// being the problem.
const renderedHtml = computed(() =>
  isHtmlNote.value ? sanitizeNoteHtml(editorContent.value) : ''
);
const renderedSplit = computed(() =>
  isHtmlNote.value ? sanitizeNoteHtmlSplit(editorContent.value) : { html: '', css: '' }
);

let injectedStyleEl = null;
function syncInjectedStyles() {
  if (!isHtmlNote.value) {
    if (injectedStyleEl) {
      injectedStyleEl.remove();
      injectedStyleEl = null;
    }
    return;
  }
  if (!injectedStyleEl) {
    injectedStyleEl = document.createElement('style');
    injectedStyleEl.setAttribute('data-noted-html-note', '');
    document.head.appendChild(injectedStyleEl);
  }
  injectedStyleEl.textContent = renderedSplit.value.css;
  // eslint-disable-next-line no-console
  console.log('[noted] injected html-note styles, css length =', renderedSplit.value.css.length, 'rules contain c-teal =', /\.c-teal/.test(renderedSplit.value.css));
}
watch([isHtmlNote, renderedSplit], syncInjectedStyles, { immediate: true });

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

// Attachment embed support: filename → { id, mime_type } for ![[file.pdf]] resolution
const attachmentMap = computed(() => {
  const map = new Map();
  for (const a of attachmentsStore.attachments) {
    if (a.filename) {
      map.set(a.filename.toLowerCase(), { id: a.id, mime_type: a.mime_type });
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
  } else if (route.name === 'Notes' || route.name === 'Home') {
    // Direct landing on All Notes or Home — clear any stale notebook/tag
    // filter so the list (or Recent panel on MobileHome) reads fresh.
    notesStore.clearFilters();
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
  if (injectedStyleEl) {
    injectedStyleEl.remove();
    injectedStyleEl = null;
  }
});

// Watch route changes — load a note for detail routes, clear the selected
// note for list-only routes (All Notes, Notebook, Tag, Ideas). Without this,
// navigating away from /notes/:id leaves currentNote populated and the editor
// pane (toolbar, backlinks, attachments) stays visible for the previous note.
watch(() => [route.name, route.params.id], async ([newName, newId]) => {
  const isDetailView = newName === 'NoteDetail' || newName === 'IdeaDetail';
  if (saveTimer) {
    clearTimeout(saveTimer);
    if (notesStore.currentNote) await saveNote();
  }
  if (isDetailView && newId) {
    await loadNote(newId);
  } else if (notesStore.currentNote) {
    notesStore.currentNote = null;
    noteTitle.value = '';
    editorContent.value = '';
    uiStore.setSaveStatus('saved');
  }
});

// Mobile: detect if we're viewing a specific note
const mobileShowEditor = computed(() => {
  return isMobile.value && route.params.id && (route.name === 'NoteDetail' || route.name === 'IdeaDetail');
});

// Mobile: detect a list scope (All Notes, a notebook, or a tag). Without
// this, picking these from the drawer routes to a NotesView variant and the
// user just sees the home dashboard again — a dead view.
const mobileShowList = computed(() => {
  if (!isMobile.value) return false;
  return route.name === 'Notes'
    || route.name === 'NotebookNotes'
    || route.name === 'TagNotes';
});

// Mobile: dashboard. /home explicitly renders it; other mobile routes
// (Settings/Tasks/etc.) use their own views.
const mobileShowHome = computed(() => isMobile.value && route.name === 'Home');

const mobileListTitle = computed(() => {
  if (route.name === 'TagNotes') return `#${route.params.name}`;
  if (route.name === 'NotebookNotes') {
    const nb = notebooksStore.notebooks.find(n => n.id === route.params.id);
    return nb?.name || 'Notebook';
  }
  return 'All Notes';
});

// Close the drawer when the route changes — e.g. after the user taps a
// notebook or tag from inside the open sidebar.
watch(() => route.fullPath, () => { mobileSidebarOpen.value = false; });

async function loadNote(id) {
  try {
    const note = await notesStore.fetchNote(id);
    if (note && !note._unavailableOffline) {
      noteTitle.value = note.title || '';
      editorContent.value = note.content || '';
      htmlEditMode.value = false;
      uiStore.setSaveStatus('saved');
      // Best-effort: don't await — these silently fail when offline.
      graphStore.fetchBacklinks(id).catch(() => {});
      graphStore.fetchUnlinkedMentions(id).catch(() => {});
      graphStore.fetchLocalGraph(id).catch(() => {});
      return;
    }
    // Fall back to direct checkout read.
    const row = await getCheckout(id);
    if (row) {
      noteTitle.value = row.localTitle || '';
      editorContent.value = row.localContent || '';
      htmlEditMode.value = false;
      uiStore.setSaveStatus('saved');
      return;
    }
    noteTitle.value = '';
    editorContent.value = '_Not available offline. Reconnect to load this note._';
    htmlEditMode.value = false;
    uiStore.setSaveStatus('saved');
  } catch (err) {
    const row = await getCheckout(id).catch(() => null);
    if (row) {
      noteTitle.value = row.localTitle || '';
      editorContent.value = row.localContent || '';
      htmlEditMode.value = false;
      uiStore.setSaveStatus('saved');
    } else {
      noteTitle.value = '';
      editorContent.value = '_Failed to load note: ' + (err?.message || 'unknown error') + '_';
      htmlEditMode.value = false;
      uiStore.setSaveStatus('saved');
    }
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

function onInsertAttachment(attachment) {
  // Build the right markdown for the attachment type:
  //   image → standard image embed (existing pattern)
  //   pdf   → ![[filename]] embed picked up by pdfEmbedRenderPlugin
  //   other → plain markdown link
  let snippet;
  if (attachment.mime_type.startsWith('image/')) {
    snippet = `![${attachment.filename}](/api/v1/attachments/${attachment.id})`;
  } else if (attachment.mime_type === 'application/pdf') {
    snippet = `![[${attachment.filename}]]`;
  } else {
    snippet = `[${attachment.filename}](/api/v1/attachments/${attachment.id})`;
  }
  if (editorRef.value && typeof editorRef.value.insertAtCursor === 'function') {
    editorRef.value.insertAtCursor(snippet);
    scheduleSave();
  } else {
    editorContent.value = editorContent.value + '\n' + snippet + '\n';
    scheduleSave();
  }
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

const appVersion = import.meta.env.VITE_APP_VERSION || 'dev';

// ===== CR027 — offline checkout =====
// Tracked via a local poll so toolbar button state stays in sync with IDB
// even when edits arrive from outside this component (e.g. background sync).
const checkoutState = ref({ checkedOut: false, dirty: false });

async function refreshCheckoutState() {
  if (!notesStore.currentNote) {
    checkoutState.value = { checkedOut: false, dirty: false };
    return;
  }
  const row = await getCheckout(notesStore.currentNote.id);
  checkoutState.value = {
    checkedOut: !!row,
    dirty: row?.dirty === 1
  };
}

watch(() => notesStore.currentNote?.id, refreshCheckoutState, { immediate: true });
watch(editorContent, refreshCheckoutState);
let checkoutPoll = null;
onMounted(() => { checkoutPoll = setInterval(refreshCheckoutState, 1500); });
onBeforeUnmount(() => { if (checkoutPoll) clearInterval(checkoutPoll); });

async function handleCheckout() {
  if (!notesStore.currentNote) return;
  try {
    if (saveTimer) { clearTimeout(saveTimer); await saveNote(); }
    await notesStore.checkoutNote(notesStore.currentNote.id);
    // Request persistent storage on first checkout — best-effort.
    if (navigator.storage?.persist) {
      try { await navigator.storage.persist(); } catch { /* ignore */ }
    }
    await refreshCheckoutState();
    toastsStore.addToast({ message: 'Note saved for offline use', type: 'success' });
  } catch (err) {
    toastsStore.addToast({ message: err?.message || 'Failed to make available offline', type: 'error' });
  }
}

async function handleCheckIn() {
  if (!notesStore.currentNote) return;
  if (saveTimer) { clearTimeout(saveTimer); await saveNote(); }
  const result = await flushCheckouts();
  await refreshCheckoutState();
  if (result.synced > 0) {
    toastsStore.addToast({ message: 'Checked in to server', type: 'success' });
  } else if (result.conflicts > 0) {
    // Conflict modal opens automatically via the sync event bus.
  } else if (result.offline) {
    toastsStore.addToast({ message: "You're offline — will sync when you're back online", type: 'info' });
  } else {
    toastsStore.addToast({ message: 'Nothing to check in', type: 'info' });
  }
}

const discardOfflineConfirm = ref({ open: false });

function handleDiscardOffline() {
  if (!notesStore.currentNote) return;
  if (checkoutState.value.dirty) {
    discardOfflineConfirm.value.open = true;
  } else {
    doDiscardOffline();
  }
}

async function doDiscardOffline() {
  discardOfflineConfirm.value.open = false;
  if (!notesStore.currentNote) return;
  await notesStore.discardOfflineCopy(notesStore.currentNote.id);
  // Re-sync the editor view from the (refreshed) currentNote.
  if (notesStore.currentNote) {
    noteTitle.value = notesStore.currentNote.title;
    editorContent.value = notesStore.currentNote.content;
  }
  await refreshCheckoutState();
  toastsStore.addToast({ message: 'Offline copy discarded', type: 'info' });
}

async function handleRefreshOffline() {
  if (!notesStore.currentNote) return;
  try {
    const fresh = await notesStore.refreshOfflineCopy(notesStore.currentNote.id);
    noteTitle.value = fresh.title;
    editorContent.value = fresh.content;
    await refreshCheckoutState();
    toastsStore.addToast({ message: 'Offline copy refreshed from server', type: 'success' });
  } catch (err) {
    toastsStore.addToast({ message: err?.message || 'Refresh failed', type: 'error' });
  }
}
</script>

<template>
  <!-- Mobile: Full-screen editor -->
  <MobileEditor
    v-if="mobileShowEditor"
    :noteId="route.params.id"
  />

  <!-- Mobile: All Notes / Notebook / Tag list (drawer-driven) -->
  <template v-else-if="mobileShowList">
    <MobileNotesList
      :title="mobileListTitle"
      @open-sidebar="mobileSidebarOpen = true"
    />

    <Teleport to="body">
      <div v-if="mobileSidebarOpen" class="mobile-sidebar-overlay" @click="mobileSidebarOpen = false" />
      <div v-if="mobileSidebarOpen" class="mobile-sidebar-drawer">
        <AppSidebar />
      </div>
    </Teleport>
  </template>

  <!-- Mobile: Home screen (only on the /home route now that /notes shows the list) -->
  <template v-else-if="mobileShowHome">
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
    <NoteListPanel v-if="!uiStore.noteListCollapsed" :expanded="!isDetailRoute" />
    <main v-if="isDetailRoute" class="editor-pane">
      <div v-if="!notesStore.currentNote" class="no-note">
        <FileText :size="48" />
        <p>Loading…</p>
        <p class="no-note-version">Noted v{{ appVersion }}</p>
      </div>
      <template v-if="notesStore.currentNote">
        <CheckoutBanner
          :noteId="notesStore.currentNote.id"
          @check-in="handleCheckIn"
          @discard="handleDiscardOffline"
        />
        <EditorToolbar
          :noteTitle="noteTitle"
          :noteContent="editorContent"
          :noteType="notesStore.currentNote?.note_type"
          :reminderAt="notesStore.currentNote?.reminder_at"
          :driveImported="notesStore.currentNote?.drive_imported || false"
          :autoUpdate="notesStore.currentNote?.auto_update || false"
          :checkedOut="checkoutState.checkedOut"
          :dirtyOffline="checkoutState.dirty"
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
          @checkout="handleCheckout"
          @check-in="handleCheckIn"
          @refresh-offline="handleRefreshOffline"
          @discard-offline="handleDiscardOffline"
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
              :attachmentMap="attachmentMap"
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
          <AttachmentZone
            @insert-image="onInsertImage"
            @insert-attachment="onInsertAttachment"
            @remove-reference="onRemoveReference"
          />
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
      <ConfirmModal
        v-if="discardOfflineConfirm.open"
        title="Discard offline copy"
        message="You have unsaved local changes. Discard them and revert to the server version?"
        confirmText="Discard"
        :danger="true"
        @confirm="doDiscardOffline"
        @cancel="discardOfflineConfirm.open = false"
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

.no-note .no-note-version {
  margin-top: 32px;
  font-size: 11px;
  letter-spacing: 0.04em;
  opacity: 0.8;
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
