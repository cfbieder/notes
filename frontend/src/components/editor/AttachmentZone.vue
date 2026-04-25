<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useAttachmentsStore } from '../../stores/attachments.js';
import { useNotesStore } from '../../stores/notes.js';
import { Paperclip, Upload, Trash2, FileText, Image, File } from 'lucide-vue-next';

const attachmentsStore = useAttachmentsStore();
const notesStore = useNotesStore();

const dragging = ref(false);
const fileInput = ref(null);
const expanded = ref(false);

const imageAttachments = computed(() =>
  attachmentsStore.attachments.filter(a => a.mime_type.startsWith('image/'))
);

const emit = defineEmits(['insert-image', 'remove-reference']);

watch(() => notesStore.currentNote?.id, async (noteId) => {
  if (noteId) {
    await attachmentsStore.fetchAttachments(noteId);
  } else {
    attachmentsStore.clear();
  }
}, { immediate: true });

function onDragOver(e) {
  e.preventDefault();
  dragging.value = true;
}

function onDragLeave() {
  dragging.value = false;
}

async function onDrop(e) {
  e.preventDefault();
  dragging.value = false;
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    await uploadFiles(files);
  }
}

function triggerFileInput() {
  const el = fileInput.value;
  if (el) {
    el.click();
  }
}

async function onFileSelected(e) {
  const files = e.target.files;
  if (files && files.length > 0) {
    await uploadFiles(files);
  }
  e.target.value = '';
}

async function uploadFiles(files) {
  const noteId = notesStore.currentNote?.id;
  if (!noteId) return;

  for (const file of files) {
    try {
      const attachment = await attachmentsStore.uploadFile(noteId, file);
      // Auto-insert image reference into editor
      if (attachment.mime_type.startsWith('image/')) {
        emit('insert-image', attachment);
      }
    } catch (err) {
      console.error('Upload failed:', err.message);
    }
  }
}

async function handleDelete(id) {
  emit('remove-reference', id);
  await attachmentsStore.deleteAttachment(id);
}

function getIcon(mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'file';
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
</script>

<template>
  <div
    class="attachment-zone"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div class="attachment-header" @click="expanded = !expanded">
      <Paperclip :size="14" />
      <span>Attachments ({{ attachmentsStore.attachments.length }})</span>
      <button class="upload-btn" @click.stop="triggerFileInput" type="button" title="Upload file">
        <Upload :size="14" />
        <span>Upload</span>
      </button>
    </div>

    <input
      ref="fileInput"
      type="file"
      class="hidden-input"
      multiple
      @change="onFileSelected"
    />

    <div v-if="dragging" class="drop-overlay">
      <Upload :size="32" />
      <span>Drop files here</span>
    </div>

    <div v-if="attachmentsStore.uploading" class="upload-progress">
      Uploading...
    </div>

    <div v-if="imageAttachments.length > 0" class="preview-grid">
      <a
        v-for="att in imageAttachments"
        :key="att.id"
        :href="attachmentsStore.getUrl(att.id)"
        target="_blank"
        rel="noopener"
        class="preview-item"
        :class="{ 'is-svg': att.mime_type === 'image/svg+xml' }"
        :title="att.filename"
      >
        <img :src="attachmentsStore.getUrl(att.id)" :alt="att.filename" loading="lazy" />
      </a>
    </div>

    <div v-if="expanded && attachmentsStore.attachments.length > 0" class="attachment-list">
      <div
        v-for="att in attachmentsStore.attachments"
        :key="att.id"
        class="attachment-item"
      >
        <Image v-if="getIcon(att.mime_type) === 'image'" :size="14" class="att-icon" />
        <FileText v-else-if="getIcon(att.mime_type) === 'pdf'" :size="14" class="att-icon" />
        <File v-else :size="14" class="att-icon" />

        <a
          :href="attachmentsStore.getUrl(att.id)"
          target="_blank"
          class="att-name"
          :title="att.filename"
        >
          {{ att.filename }}
        </a>
        <span class="att-size">{{ formatSize(att.size_bytes) }}</span>
        <button class="att-delete" @click="handleDelete(att.id)" title="Delete attachment">
          <Trash2 :size="12" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.attachment-zone {
  position: relative;
  border-top: 1px solid var(--border-subtle);
  padding: 8px 24px;
}

.attachment-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px 0;
}
.attachment-header:hover { color: var(--text-secondary); }

.upload-btn {
  margin-left: auto;
  background: rgba(58, 134, 255, 0.1);
  border: 1px solid var(--accent-primary);
  border-radius: 4px;
  color: var(--accent-primary);
  padding: 4px 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 500;
  flex-shrink: 0;
}
.upload-btn:hover {
  color: var(--text-primary);
  background: rgba(58, 134, 255, 0.2);
}

.hidden-input {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

.drop-overlay {
  position: absolute;
  inset: 0;
  background: rgba(58, 134, 255, 0.15);
  border: 2px dashed var(--accent-primary);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--accent-primary);
  font-size: 14px;
  font-weight: 500;
  z-index: 10;
}

.upload-progress {
  font-size: 12px;
  color: var(--accent-warn);
  padding: 4px 0;
}

.attachment-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  max-height: 160px;
  overflow-y: auto;
}

.attachment-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}
.attachment-item:hover { background: var(--hover-bg); }

.att-icon { color: var(--text-muted); flex-shrink: 0; }

.att-name {
  color: var(--accent-primary);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.att-name:hover { text-decoration: underline; }

.att-size {
  color: var(--text-muted);
  font-size: 11px;
  flex-shrink: 0;
}

.att-delete {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px;
  flex-shrink: 0;
}
.att-delete:hover { color: var(--status-error); }

.preview-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.preview-item {
  display: block;
  max-width: 240px;
  max-height: 180px;
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-card);
}
.preview-item.is-svg {
  background: #ffffff;
  padding: 4px;
}
.preview-item:hover { border-color: var(--accent-primary); }

.preview-item img {
  display: block;
  max-width: 100%;
  max-height: 180px;
  width: auto;
  height: auto;
  object-fit: contain;
}
</style>
