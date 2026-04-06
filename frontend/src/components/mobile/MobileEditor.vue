<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useNotesStore } from '../../stores/notes.js';
import { useUIStore } from '../../stores/ui.js';
import CodeMirrorEditor from '../editor/CodeMirrorEditor.vue';
import AttachmentZone from '../editor/AttachmentZone.vue';
import { ArrowLeft, Code, Eye } from 'lucide-vue-next';

const props = defineProps({
  noteId: { type: String, required: true }
});

const router = useRouter();
const notesStore = useNotesStore();
const uiStore = useUIStore();

const noteTitle = ref('');
const editorContent = ref('');
let saveTimer = null;

watch(() => props.noteId, async (id) => {
  if (id) await loadNote(id);
}, { immediate: true });

onBeforeUnmount(() => {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveNote();
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

function goBack() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveNote();
  }
  router.back();
}

function onInsertImage(attachment) {
  const markdownImg = `![${attachment.filename}](/api/v1/attachments/${attachment.id})`;
  editorContent.value = editorContent.value + '\n' + markdownImg + '\n';
  scheduleSave();
}

function onRemoveReference(attachmentId) {
  const pattern = new RegExp(`\\n?!\\[[^\\]]*\\]\\(/api/v1/attachments/${attachmentId}\\)\\n?`, 'g');
  editorContent.value = editorContent.value.replace(pattern, '\n');
  scheduleSave();
}
</script>

<template>
  <div class="mobile-editor">
    <header class="mobile-editor-header">
      <button class="back-btn" @click="goBack">
        <ArrowLeft :size="20" />
      </button>
      <input
        class="mobile-title-input"
        :value="noteTitle"
        @input="noteTitle = $event.target.value; scheduleSave()"
        placeholder="Untitled"
      />
      <button
        class="mode-toggle"
        :class="{ active: uiStore.editorMode === 'source' }"
        @click="uiStore.toggleEditorMode()"
      >
        <Code v-if="uiStore.editorMode === 'normal'" :size="18" />
        <Eye v-else :size="18" />
      </button>
    </header>

    <div class="mobile-editor-body">
      <CodeMirrorEditor
        :modelValue="editorContent"
        :sourceMode="uiStore.editorMode === 'source'"
        @update:modelValue="onContentChange"
      />
    </div>

    <AttachmentZone @insert-image="onInsertImage" @remove-reference="onRemoveReference" />
  </div>
</template>

<style scoped>
.mobile-editor {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-main);
}

.mobile-editor-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.back-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  padding: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
}
.back-btn:hover { color: var(--text-primary); }

.mobile-title-input {
  flex: 1;
  background: none;
  border: none;
  color: var(--text-primary);
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 16px;
  font-weight: 600;
  padding: 0;
  outline: none;
  min-width: 0;
}
.mobile-title-input::placeholder { color: var(--text-muted); }

.mode-toggle {
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  color: var(--text-secondary);
  padding: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
}
.mode-toggle:hover { border-color: var(--accent-primary); color: var(--text-primary); }
.mode-toggle.active {
  background: rgba(58, 134, 255, 0.12);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.mobile-editor-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  padding: 0 8px;
}
</style>
