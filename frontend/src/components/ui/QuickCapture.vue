<script setup>
import { ref } from 'vue';
import { useNotesStore } from '../../stores/notes.js';
import { useTasksStore } from '../../stores/tasks.js';
import { useIdeasStore } from '../../stores/ideas.js';
import { api, OfflineError } from '../../api/client.js';
import { enqueue, KIND_NOTE, KIND_TASK } from '../../lib/offlineOutbox.js';
import { X, FileText, CheckSquare } from 'lucide-vue-next';

const props = defineProps({
  initialType: { type: String, default: 'note' }
});
const emit = defineEmits(['close']);
const notesStore = useNotesStore();
const tasksStore = useTasksStore();
const ideasStore = useIdeasStore();

const content = ref('');
const captureType = ref(props.initialType); // 'note' | 'task' | 'idea'
const loading = ref(false);
const status = ref(null); // null | 'saved-offline'
const inputRef = ref(null);

function buildNotePayload(text, type) {
  const title = text.split('\n')[0].slice(0, 80);
  if (type === 'idea') {
    return {
      title: title || 'Untitled idea',
      content: text,
      note_type: 'idea',
      is_inbox: false
    };
  }
  return {
    title: title || 'Untitled',
    content: text,
    is_inbox: true
  };
}

async function handleCapture() {
  const text = content.value.trim();
  if (!text) return;

  loading.value = true;
  status.value = null;

  const isTask = captureType.value === 'task';
  const payload = isTask
    ? { content: text }
    : buildNotePayload(text, captureType.value);
  const kind = isTask ? KIND_TASK : KIND_NOTE;

  try {
    try {
      if (isTask) {
        await tasksStore.createTask(payload);
      } else {
        await api.post('/notes', payload);
        if (captureType.value === 'idea') {
          ideasStore.fetchIdeas?.().catch(() => {});
        } else {
          notesStore.fetchNotes?.().catch(() => {});
        }
      }
    } catch (err) {
      if (!(err instanceof OfflineError)) throw err;
      await enqueue(kind, payload);
      status.value = 'saved-offline';
    }
    content.value = '';
    if (status.value === 'saved-offline') {
      setTimeout(() => emit('close'), 900);
    } else {
      emit('close');
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="capture-overlay" @click.self="$emit('close')">
    <div class="capture-modal">
      <div class="capture-header">
        <span class="capture-title">Quick Capture</span>
        <button class="capture-close" @click="$emit('close')">
          <X :size="16" />
        </button>
      </div>

      <div class="capture-types">
        <button
          class="type-btn"
          :class="{ active: captureType === 'note' }"
          @click="captureType = 'note'"
        >
          <FileText :size="14" /> Note
        </button>
        <button
          class="type-btn"
          :class="{ active: captureType === 'task' }"
          @click="captureType = 'task'"
        >
          <CheckSquare :size="14" /> Task
        </button>
        <button
          class="type-btn"
          :class="{ active: captureType === 'idea' }"
          @click="captureType = 'idea'"
        >
          <span class="idea-emoji">💡</span> Idea
        </button>
      </div>

      <textarea
        ref="inputRef"
        v-model="content"
        class="capture-input"
        :placeholder="captureType === 'task' ? 'What needs to be done?' : 'Capture a thought...'"
        rows="4"
        autofocus
        @keydown.meta.enter="handleCapture"
        @keydown.ctrl.enter="handleCapture"
        @keydown.escape="$emit('close')"
      />

      <div v-if="status === 'saved-offline'" class="capture-offline-toast">
        Saved offline — will sync when online.
      </div>

      <div class="capture-footer">
        <span class="capture-hint">Ctrl+Enter to save</span>
        <button class="capture-save" @click="handleCapture" :disabled="loading || !content.trim()">
          {{ loading ? 'Saving...' : 'Capture' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.capture-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  padding-top: 20vh;
  z-index: 1000;
}

.capture-modal {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  width: 480px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.capture-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.capture-title {
  font-weight: 600;
  font-size: 14px;
}

.capture-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
}
.capture-close:hover { color: var(--text-primary); }

.capture-types {
  display: flex;
  gap: 6px;
  padding: 12px 16px 0;
}

.type-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  cursor: pointer;
}
.idea-emoji { font-size: 13px; line-height: 1; }
.type-btn:hover { border-color: var(--accent-primary); }
.type-btn.active {
  background: rgba(58, 134, 255, 0.12);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.capture-input {
  width: 100%;
  padding: 12px 16px;
  background: none;
  border: none;
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  resize: vertical;
  min-height: 80px;
  outline: none;
  box-sizing: border-box;
}
.capture-input::placeholder { color: var(--text-muted); }

.capture-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-top: 1px solid var(--border-subtle);
}

.capture-hint {
  font-size: 11px;
  color: var(--text-muted);
}

.capture-save {
  padding: 6px 16px;
  background-color: var(--accent-warn);
  color: #1a1a1a;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  cursor: pointer;
}
.capture-save:hover { opacity: 0.88; }
.capture-save:disabled { opacity: 0.4; cursor: not-allowed; }

.capture-offline-toast {
  margin: 0 16px 10px;
  padding: 8px 12px;
  background: rgba(255, 193, 7, 0.12);
  border: 1px solid rgba(255, 193, 7, 0.35);
  border-radius: 6px;
  color: var(--accent-warn);
  font-size: 12px;
}
</style>
