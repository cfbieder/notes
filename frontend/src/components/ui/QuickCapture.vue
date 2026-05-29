<script setup>
import { ref, computed, onBeforeUnmount } from 'vue';
import { useNotesStore } from '../../stores/notes.js';
import { useTasksStore } from '../../stores/tasks.js';
import { useIdeasStore } from '../../stores/ideas.js';
import { api, apiUpload, OfflineError } from '../../api/client.js';
import { enqueue, KIND_NOTE, KIND_TASK } from '../../lib/offlineOutbox.js';
import { X, FileText, CheckSquare, Mic, Square, Loader } from 'lucide-vue-next';

const props = defineProps({
  initialType: { type: String, default: 'note' }
});
const emit = defineEmits(['close']);
const notesStore = useNotesStore();
const tasksStore = useTasksStore();
const ideasStore = useIdeasStore();

const content = ref('');
const captureType = ref(props.initialType); // 'note' | 'task' | 'idea' | 'voice'
const loading = ref(false);
const status = ref(null); // null | 'saved-offline'
const inputRef = ref(null);

// --- Voice recording state ---
const MAX_RECORDING_SECONDS = 300; // 5 minutes
const isRecording = ref(false);
const recordingSeconds = ref(0);
const voiceStatus = ref(null); // null | 'recording' | 'transcribing' | 'done' | 'error'
const voiceError = ref('');
let mediaRecorder = null;
let audioChunks = [];
let recordingTimer = null;

const hasMediaRecorder = typeof window !== 'undefined' && !!window.MediaRecorder;

const formattedTime = computed(() => {
  const m = Math.floor(recordingSeconds.value / 60);
  const s = recordingSeconds.value % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
});

const remainingTime = computed(() => {
  const left = MAX_RECORDING_SECONDS - recordingSeconds.value;
  const m = Math.floor(left / 60);
  const s = left % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
});

async function startRecording() {
  voiceError.value = '';
  voiceStatus.value = null;
  audioChunks = [];
  recordingSeconds.value = 0;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Prefer webm/opus, fall back to whatever the browser supports
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';
    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      // Stop all tracks to release the microphone
      stream.getTracks().forEach(t => t.stop());
      clearInterval(recordingTimer);
      recordingTimer = null;
    };

    mediaRecorder.start(1000); // collect chunks every second
    isRecording.value = true;
    voiceStatus.value = 'recording';

    recordingTimer = setInterval(() => {
      recordingSeconds.value++;
      if (recordingSeconds.value >= MAX_RECORDING_SECONDS) {
        stopRecording();
      }
    }, 1000);
  } catch (err) {
    voiceError.value = err.name === 'NotAllowedError'
      ? 'Microphone access denied. Please allow microphone access and try again.'
      : 'Could not access microphone: ' + (err.message || 'unknown error');
    voiceStatus.value = 'error';
  }
}

async function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;

  return new Promise((resolve) => {
    const prevOnStop = mediaRecorder.onstop;
    mediaRecorder.onstop = (e) => {
      if (prevOnStop) prevOnStop(e);
      resolve();
      handleVoiceUpload();
    };
    mediaRecorder.stop();
    isRecording.value = false;
  });
}

function cancelRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    const stream = mediaRecorder.stream;
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      clearInterval(recordingTimer);
      recordingTimer = null;
    };
    mediaRecorder.stop();
  }
  isRecording.value = false;
  voiceStatus.value = null;
  audioChunks = [];
  recordingSeconds.value = 0;
}

async function handleVoiceUpload() {
  if (audioChunks.length === 0) return;

  voiceStatus.value = 'transcribing';
  loading.value = true;

  const mimeType = mediaRecorder?.mimeType || 'audio/webm';
  const ext = mimeType.includes('webm') ? '.webm' : mimeType.includes('ogg') ? '.ogg' : '.webm';
  const blob = new Blob(audioChunks, { type: mimeType });
  const file = new File([blob], `voice_recording${ext}`, { type: mimeType });

  try {
    const result = await apiUpload('/notes/voice', file);
    voiceStatus.value = 'done';
    ideasStore.fetchIdeas?.().catch(() => {});
    emit('close');
  } catch (err) {
    voiceStatus.value = 'error';
    voiceError.value = err.message || 'Failed to transcribe voice note';
    loading.value = false;
  }
}

// Cleanup on unmount
onBeforeUnmount(() => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
    mediaRecorder.stop();
  }
  clearInterval(recordingTimer);
});

// --- Text capture (existing) ---

function buildNotePayload(text, type) {
  const title = text.split('\n')[0].slice(0, 80);
  if (type === 'idea') {
    return {
      title: title || 'Untitled idea',
      content: text,
      note_type: 'idea'
    };
  }
  // notebook_id omitted → backend assigns the user's default notebook, which
  // surfaces the note in /inbox for triage.
  return {
    title: title || 'Untitled',
    content: text
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
        <button
          v-if="hasMediaRecorder"
          class="type-btn"
          :class="{ active: captureType === 'voice' }"
          @click="captureType = 'voice'"
        >
          <Mic :size="14" /> Voice
        </button>
      </div>

      <!-- Text capture (Note / Task / Idea) -->
      <template v-if="captureType !== 'voice'">
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
      </template>

      <!-- Voice capture -->
      <template v-else>
        <div class="voice-capture">
          <!-- Idle state -->
          <div v-if="!voiceStatus" class="voice-idle">
            <button class="voice-record-btn" @click="startRecording">
              <Mic :size="28" />
            </button>
            <p class="voice-hint">Tap to start recording (max 5 min)</p>
          </div>

          <!-- Recording state -->
          <div v-else-if="voiceStatus === 'recording'" class="voice-recording">
            <div class="voice-pulse-ring">
              <div class="voice-pulse-dot"></div>
            </div>
            <div class="voice-timer">{{ formattedTime }}</div>
            <div class="voice-remaining">{{ remainingTime }} remaining</div>
            <div class="voice-recording-actions">
              <button class="voice-cancel-btn" @click="cancelRecording" title="Cancel">
                <X :size="18" />
              </button>
              <button class="voice-stop-btn" @click="stopRecording" title="Stop & transcribe">
                <Square :size="18" />
              </button>
            </div>
          </div>

          <!-- Transcribing state -->
          <div v-else-if="voiceStatus === 'transcribing'" class="voice-transcribing">
            <Loader :size="28" class="voice-spinner" />
            <p class="voice-hint">Transcribing your voice note...</p>
          </div>

          <!-- Error state -->
          <div v-else-if="voiceStatus === 'error'" class="voice-error">
            <p class="voice-error-text">{{ voiceError }}</p>
            <button class="voice-retry-btn" @click="voiceStatus = null; voiceError = ''">
              Try again
            </button>
          </div>
        </div>

        <div class="capture-footer">
          <span class="capture-hint">Voice → transcribed to text → saved as idea</span>
          <span></span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.capture-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-modal);
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

/* Voice capture styles */
.voice-capture {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  min-height: 120px;
}

.voice-idle {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.voice-record-btn {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 2px solid var(--accent-warn);
  background: rgba(255, 152, 0, 0.1);
  color: var(--accent-warn);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.voice-record-btn:hover {
  background: rgba(255, 152, 0, 0.2);
  transform: scale(1.05);
}

.voice-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}

.voice-recording {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.voice-pulse-ring {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: pulse-ring 1.5s ease-in-out infinite;
}

.voice-pulse-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ef4444;
  animation: pulse-dot 1.5s ease-in-out infinite;
}

@keyframes pulse-ring {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.3); }
  50% { box-shadow: 0 0 0 16px rgba(239, 68, 68, 0); }
}

@keyframes pulse-dot {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.15); }
}

.voice-timer {
  font-size: 28px;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-primary);
}

.voice-remaining {
  font-size: 11px;
  color: var(--text-muted);
}

.voice-recording-actions {
  display: flex;
  gap: 16px;
  margin-top: 8px;
}

.voice-cancel-btn,
.voice-stop-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--border-subtle);
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.voice-cancel-btn:hover {
  border-color: #ef4444;
  color: #ef4444;
  background: rgba(239, 68, 68, 0.08);
}
.voice-stop-btn {
  border-color: var(--accent-warn);
  color: var(--accent-warn);
  background: rgba(255, 152, 0, 0.08);
}
.voice-stop-btn:hover {
  background: rgba(255, 152, 0, 0.18);
}

.voice-transcribing {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.voice-spinner {
  animation: spin 1s linear infinite;
  color: var(--accent-primary);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.voice-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.voice-error-text {
  font-size: 13px;
  color: #ef4444;
  margin: 0;
  text-align: center;
  max-width: 320px;
}

.voice-retry-btn {
  padding: 6px 16px;
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  cursor: pointer;
}
.voice-retry-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}
</style>
