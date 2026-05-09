<script setup>
import { ref, computed } from 'vue';
import { apiUpload } from '../../api/client.js';
import { useNotebooksStore } from '../../stores/notebooks.js';

const emit = defineEmits(['imported', 'cancel']);

const notebooksStore = useNotebooksStore();

const file = ref(null);
const title = ref('');
const notebookId = ref('');
const uploading = ref(false);
const errorMsg = ref('');

const ACCEPT = '.md,.markdown,.txt,.html,.htm,text/markdown,text/plain,text/html';

const detectedFormat = computed(() => {
  if (!file.value) return null;
  const name = file.value.name.toLowerCase();
  if (name.endsWith('.html') || name.endsWith('.htm')) return 'html';
  if (name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.txt')) return 'markdown';
  const t = (file.value.type || '').toLowerCase();
  if (t.includes('html')) return 'html';
  if (t.includes('markdown') || t.includes('plain')) return 'markdown';
  return null;
});

function onFileChange(e) {
  const f = e.target.files?.[0];
  if (!f) return;
  file.value = f;
  errorMsg.value = '';
  // Pre-fill title from filename (without extension) if user hasn't typed one
  if (!title.value) {
    const dot = f.name.lastIndexOf('.');
    title.value = dot > 0 ? f.name.slice(0, dot) : f.name;
  }
}

async function onImport() {
  if (!file.value) {
    errorMsg.value = 'Choose a file to import.';
    return;
  }
  if (!detectedFormat.value) {
    errorMsg.value = 'Unsupported file type. Use .md, .markdown, .txt, .html, or .htm.';
    return;
  }
  uploading.value = true;
  errorMsg.value = '';
  try {
    const extra = {};
    if (title.value.trim()) extra.title = title.value.trim();
    if (notebookId.value) extra.notebook_id = notebookId.value;
    const res = await apiUpload('/notes/import', file.value, extra);
    emit('imported', res.data.id);
  } catch (err) {
    errorMsg.value = err.body?.message || err.message || 'Upload failed.';
  } finally {
    uploading.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('cancel')">
      <div class="modal">
        <div class="modal-header">
          <h3>Import Note</h3>
          <p class="hint">Markdown (.md, .txt) or HTML (.html, .htm) files.</p>
        </div>
        <div class="modal-body">
          <label class="field">
            <span class="field-label">File</span>
            <input type="file" :accept="ACCEPT" @change="onFileChange" />
            <span v-if="file && detectedFormat" class="field-meta">
              Detected format: <strong>{{ detectedFormat === 'html' ? 'HTML' : 'Markdown' }}</strong>
            </span>
          </label>

          <label class="field">
            <span class="field-label">Title (optional)</span>
            <input
              type="text"
              v-model="title"
              maxlength="500"
              placeholder="Leave blank to use the file's <title> tag or filename"
            />
          </label>

          <label class="field">
            <span class="field-label">Notebook (optional)</span>
            <select v-model="notebookId">
              <option value="">Default</option>
              <option
                v-for="nb in notebooksStore.notebooks"
                :key="nb.id"
                :value="nb.id"
              >{{ nb.name }}</option>
            </select>
          </label>

          <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="$emit('cancel')" :disabled="uploading">Cancel</button>
          <button class="btn-action" @click="onImport" :disabled="uploading || !file">
            {{ uploading ? 'Importing…' : 'Import' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  width: 480px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.modal-header {
  padding: 16px 20px 4px;
}
.modal-header h3 {
  margin: 0;
  font-size: 16px;
}
.hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

.modal-body {
  padding: 12px 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field-label {
  font-size: 12px;
  color: var(--text-secondary);
}
.field input[type="text"],
.field select,
.field input[type="file"] {
  padding: 6px 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
}
.field-meta {
  font-size: 11px;
  color: var(--text-muted);
}

.error-msg {
  font-size: 12px;
  color: var(--accent-danger, #d44);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border-subtle);
}

.btn-cancel {
  padding: 7px 16px;
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  cursor: pointer;
}
.btn-cancel:hover:not(:disabled) {
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.btn-action {
  padding: 7px 16px;
  background: var(--accent-primary);
  border: none;
  border-radius: 6px;
  color: white;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.btn-action:hover:not(:disabled) { opacity: 0.88; }
.btn-action:disabled, .btn-cancel:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
