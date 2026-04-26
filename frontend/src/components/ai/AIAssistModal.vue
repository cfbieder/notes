<script setup>
import { ref, computed, onMounted, watch, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { aiAssistApi } from '../../api/aiAssist.js';
import { api } from '../../api/client.js';
import { useAIAssistStore } from '../../stores/aiAssist.js';
import { useNotesStore } from '../../stores/notes.js';
import { useToastsStore } from '../../stores/toasts.js';
import NoteMultiPicker from './NoteMultiPicker.vue';
import { Sparkles, Loader2, ArrowLeft, History, FilePlus, ClipboardEdit, Zap, Brain } from 'lucide-vue-next';

const emit = defineEmits(['close']);
const router = useRouter();
const aiStore = useAIAssistStore();
const notesStore = useNotesStore();
const toasts = useToastsStore();

// Stage: 'compose' | 'preview' (preview only used by quick mode)
const stage = ref('compose');

const prompt = ref(aiStore.lastPrompt || '');
const selectedNotes = ref([]); // [{ id, title }]
const promptRef = ref(null);

const config = ref(null);
const mode = ref(aiStore.mode || 'quick');
const condense = ref(aiStore.condense);

const generating = ref(false);
const submitting = ref(false);
const saving = ref(false);
const showHistory = ref(false);
const submitError = ref('');

// Whether an editor is currently registered — drives "Insert at cursor"
// availability in quick mode. Captured at modal open so the Insert button
// is shown consistently throughout the session even if the editor unmounts
// mid-stream.
const editorAvailableAtOpen = ref(false);

// Preview state (quick mode only)
const previewTitle = ref('');
const previewBody = ref('');
const previewSources = ref([]);
const previewModel = ref('');
const streamingOutput = ref('');
const streamSourcesPending = ref([]);

const estimate = ref({ tokens: 0, characters: 0 });
let estimateTimer = null;
let streamAbort = null;

const contextWindow = computed(() => config.value?.contextWindow || 32000);
const warnTokens = computed(() => config.value?.warnTokens || Math.floor(contextWindow.value * 0.85));

const tokenPercent = computed(() => Math.min(100, Math.round((estimate.value.tokens / contextWindow.value) * 100)));
const tokenLevel = computed(() => {
  if (estimate.value.tokens >= contextWindow.value) return 'over';
  if (estimate.value.tokens >= warnTokens.value) return 'warn';
  return 'ok';
});

const canGenerate = computed(() =>
  prompt.value.trim().length > 0 && !generating.value && !submitting.value
);
const enabled = computed(() => config.value?.enabled !== false);

async function loadConfig() {
  try {
    const cfgRes = await aiAssistApi.config();
    config.value = cfgRes.data;
  } catch {
    config.value = { enabled: false, contextWindow: 32000, warnTokens: 27000 };
  }
}

function scheduleEstimate() {
  clearTimeout(estimateTimer);
  estimateTimer = setTimeout(async () => {
    try {
      const res = await aiAssistApi.estimate({
        prompt: prompt.value,
        noteIds: selectedNotes.value.map(n => n.id)
      });
      estimate.value = {
        tokens: res.data.estimatedTokens,
        characters: res.data.characters
      };
    } catch {
      // best-effort; keep last value
    }
  }, 250);
}

watch(prompt, scheduleEstimate);
watch(selectedNotes, scheduleEstimate, { deep: true });
watch(mode, (v) => aiStore.setMode(v));
watch(condense, (v) => aiStore.setCondense(v));

onMounted(async () => {
  editorAvailableAtOpen.value = !!aiStore.editor;
  await loadConfig();
  scheduleEstimate();
  setTimeout(() => promptRef.value?.focus(), 50);
});

onBeforeUnmount(() => {
  clearTimeout(estimateTimer);
  if (streamAbort) streamAbort.abort();
});

function close() {
  if (streamAbort) streamAbort.abort();
  aiStore.close();
  emit('close');
}

function onKeydown(e) {
  // Modal is dismissable only via the Cancel / Generate / Discard / Save buttons.
  // Escape and click-outside are intentionally inert so accidental dismissals
  // don't lose a typed prompt or in-flight generation.
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && stage.value === 'compose' && canGenerate.value) {
    e.preventDefault();
    submit();
  }
}

function suggestTitle(p) {
  const trimmed = (p || '').trim().split('\n')[0];
  if (!trimmed) return 'AI Note';
  const short = trimmed.length > 60 ? trimmed.slice(0, 57).trim() + '…' : trimmed;
  return `AI: ${short}`;
}

function buildSourcesBlock(sources) {
  if (!sources || sources.length === 0) return '';
  const lines = sources.map(s => `- [[${(s.title || 'Untitled').replace(/[\[\]]/g, '')}]]`);
  return `\n\n## Sources\n\n${lines.join('\n')}`;
}

function submit() {
  submitError.value = '';
  if (mode.value === 'deep') return submitDeepThink();
  return generateQuick();
}

async function submitDeepThink() {
  if (!canGenerate.value) return;
  submitting.value = true;
  aiStore.setLastPrompt(prompt.value);
  aiStore.addToHistory(prompt.value);
  showHistory.value = false;
  try {
    await aiAssistApi.submitJob({
      prompt: prompt.value,
      noteIds: selectedNotes.value.map(n => n.id),
      condense: condense.value
    });
    // Refresh the pending pill immediately and show a confirmation toast.
    aiStore.pollJobs();
    toasts.addToast({
      message: 'Deep-think started — you can close this window. The result will land in your inbox.',
      type: 'info',
      duration: 6000
    });
    close();
  } catch (err) {
    if (err?.body?.code === 'job_in_progress') {
      submitError.value = 'Another deep-think is already running. Cancel it from the sidebar pill or wait for it to finish.';
    } else {
      submitError.value = err?.body?.message || err?.message || 'Failed to start deep-think';
    }
  } finally {
    submitting.value = false;
  }
}

async function generateQuick() {
  if (!canGenerate.value) return;
  generating.value = true;
  aiStore.setLastPrompt(prompt.value);
  aiStore.addToHistory(prompt.value);
  showHistory.value = false;

  // Switch to preview immediately so the user sees tokens stream in.
  previewTitle.value = suggestTitle(prompt.value);
  streamingOutput.value = '';
  previewBody.value = '';
  previewSources.value = [];
  previewModel.value = '';
  streamSourcesPending.value = selectedNotes.value.map(n => ({ id: n.id, title: n.title }));
  stage.value = 'preview';

  streamAbort = new AbortController();
  try {
    const meta = await aiAssistApi.generateStream(
      {
        prompt: prompt.value,
        noteIds: selectedNotes.value.map(n => n.id),
        condense: condense.value
      },
      {
        signal: streamAbort.signal,
        onChunk: (text) => { streamingOutput.value += text; }
      }
    );
    const sources = meta?.sources || streamSourcesPending.value;
    previewSources.value = sources;
    previewModel.value = meta?.model || previewModel.value;
    previewBody.value = streamingOutput.value.trim() + buildSourcesBlock(sources);
  } catch (err) {
    if (err.name === 'AbortError') {
      previewBody.value = streamingOutput.value.trim() + buildSourcesBlock(streamSourcesPending.value);
      previewSources.value = streamSourcesPending.value;
    } else {
      const msg = err?.body?.message || err?.message || 'Generation failed';
      toasts.addToast({ message: msg, type: 'error' });
      stage.value = 'compose';
    }
  } finally {
    generating.value = false;
    streamAbort = null;
  }
}

function cancelStream() {
  if (streamAbort) streamAbort.abort();
}

function backToCompose() {
  if (streamAbort) streamAbort.abort();
  stage.value = 'compose';
  setTimeout(() => promptRef.value?.focus(), 50);
}

function pickFromHistory(entry) {
  prompt.value = entry.text;
  showHistory.value = false;
  setTimeout(() => promptRef.value?.focus(), 30);
}

function onClearHistory() {
  aiStore.clearHistory();
  showHistory.value = false;
}

async function saveAsNote() {
  if (!previewTitle.value.trim() || !previewBody.value.trim()) return;
  saving.value = true;
  try {
    const res = await api.post('/notes', {
      title: previewTitle.value.trim(),
      content: previewBody.value,
      is_ai_generated: true,
      ai_prompt: prompt.value
    });
    const note = res.data;
    toasts.addToast({ message: 'AI note saved', type: 'success' });
    notesStore.fetchNotes();
    close();
    router.push(`/notes/${note.id}`);
  } catch (err) {
    const msg = err?.body?.message || err?.message || 'Save failed';
    toasts.addToast({ message: msg, type: 'error' });
  } finally {
    saving.value = false;
  }
}

function insertAtCursor() {
  const handle = aiStore.editor;
  if (!handle || typeof handle.insertAtCursor !== 'function') {
    toasts.addToast({ message: 'No active editor — open a note first', type: 'error' });
    return;
  }
  const text = previewBody.value.trim();
  if (!text) return;
  handle.insertAtCursor(text);
  toasts.addToast({ message: 'Inserted into note', type: 'success' });
  close();
}

const submitLabel = computed(() => {
  if (mode.value === 'deep') return submitting.value ? 'Sending…' : 'Send to deep think';
  return 'Generate';
});
</script>

<template>
  <div class="ai-overlay" @keydown="onKeydown" tabindex="-1">
    <div class="ai-modal">
      <header class="ai-header">
        <div class="ai-title">
          <Sparkles :size="18" class="ai-spark" />
          <h2>AI Assist</h2>
        </div>
        <div class="ai-header-right">
          <div
            v-if="enabled && stage === 'compose'"
            class="mode-toggle"
            role="tablist"
            aria-label="Generation mode"
          >
            <button
              class="mode-btn"
              :class="{ active: mode === 'quick' }"
              role="tab"
              :aria-selected="mode === 'quick'"
              :disabled="generating || submitting"
              @click="mode = 'quick'"
              :title="`Quick note — fast tier (${config?.quickModel || 'phi4:14b'}). Streams into preview.`"
            >
              <Zap :size="13" />
              Quick
            </button>
            <button
              class="mode-btn"
              :class="{ active: mode === 'deep' }"
              role="tab"
              :aria-selected="mode === 'deep'"
              :disabled="generating || submitting"
              @click="mode = 'deep'"
              :title="`Deep think — heavy tier (${config?.deepModel || 'qwen3.6:35b-a3b'}). Runs in background, lands in inbox.`"
            >
              <Brain :size="13" />
              Deep think
            </button>
          </div>
        </div>
      </header>

      <div v-if="!enabled" class="ai-disabled">
        AI Assist is disabled. Set <code>LLM_ENABLED=true</code> in the backend env to enable.
      </div>

      <!-- Compose stage -->
      <div v-else-if="stage === 'compose'" class="ai-body">
        <div class="ai-label-row">
          <label class="ai-label">Prompt</label>
          <button
            v-if="aiStore.history.length > 0"
            class="history-btn"
            @click="showHistory = !showHistory"
            :title="`${aiStore.history.length} recent prompts`"
          >
            <History :size="12" />
            History
          </button>
        </div>

        <div class="prompt-wrap">
          <textarea
            ref="promptRef"
            v-model="prompt"
            class="ai-prompt"
            placeholder="e.g. Summarize the key points of these memos. Generate ideas from these notes."
            rows="4"
            @keydown="onKeydown"
          />
          <div v-if="showHistory" class="history-dropdown">
            <button
              v-for="entry in aiStore.history"
              :key="entry.at"
              class="history-item"
              @click="pickFromHistory(entry)"
              :title="entry.text"
            >
              {{ entry.text.length > 80 ? entry.text.slice(0, 77) + '…' : entry.text }}
            </button>
            <button class="history-clear" @click="onClearHistory">Clear history</button>
          </div>
        </div>

        <label class="ai-label">Source notes (optional)</label>
        <NoteMultiPicker v-model="selectedNotes" />

        <div class="ai-meta">
          <div class="ai-token-bar">
            <div
              class="ai-token-fill"
              :class="`level-${tokenLevel}`"
              :style="{ width: tokenPercent + '%' }"
            />
          </div>
          <div class="ai-meta-row">
            <span class="ai-token-label" :class="`level-${tokenLevel}`">
              ~{{ estimate.tokens.toLocaleString() }} / {{ contextWindow.toLocaleString() }} tokens
              <span v-if="tokenLevel === 'warn'">— close to limit</span>
              <span v-else-if="tokenLevel === 'over'">— over limit; output may be truncated</span>
            </span>
            <label class="condense-toggle" :title="`Pre-summarize each source via ${config?.condenseModel || 'fast model'} before generation. Slower but fits more notes.`">
              <input type="checkbox" v-model="condense" :disabled="generating || submitting" />
              Condense sources first
            </label>
          </div>
        </div>

        <div v-if="mode === 'deep'" class="deep-hint">
          Deep think runs on the largest local model. You can close this window — the result will appear as a new note in your inbox.
        </div>
        <div v-if="mode === 'deep' && config?.heavyAvailable === false" class="deep-warn">
          Heavy tier is offline — deep think will fall through to the cloud model. Expect ~5–10s longer than usual.
        </div>
        <div v-if="submitError" class="submit-error">{{ submitError }}</div>

        <div class="ai-actions">
          <button class="btn-secondary" @click="close">Cancel</button>
          <button
            class="btn-primary"
            :disabled="!canGenerate"
            @click="submit"
            :title="canGenerate ? 'Submit (⌘/Ctrl+Enter)' : 'Enter a prompt first'"
          >
            <Loader2 v-if="submitting" :size="14" class="spin" />
            <Sparkles v-else :size="14" />
            {{ submitLabel }}
          </button>
        </div>
      </div>

      <!-- Preview stage (quick mode only) -->
      <div v-else class="ai-body">
        <div class="preview-header">
          <button class="btn-link" @click="backToCompose">
            <ArrowLeft :size="14" />
            Back to prompt
          </button>
          <span v-if="previewModel" class="preview-meta">{{ previewModel }}</span>
        </div>

        <!-- Streaming view -->
        <template v-if="generating">
          <label class="ai-label">
            <Loader2 :size="12" class="spin inline-spin" />
            Generating...
          </label>
          <div class="streaming-box">{{ streamingOutput || '…' }}</div>
          <div class="ai-actions">
            <button class="btn-secondary" @click="cancelStream">Stop</button>
          </div>
        </template>

        <!-- Editable result -->
        <template v-else>
          <label class="ai-label">Title</label>
          <input v-model="previewTitle" class="ai-input" />

          <label class="ai-label">Content</label>
          <textarea v-model="previewBody" class="ai-prompt preview-body" rows="14" />

          <div v-if="previewSources.length > 0" class="preview-sources-note">
            {{ previewSources.length }} source note{{ previewSources.length === 1 ? '' : 's' }} linked via wikilinks — backlinks update on save.
          </div>

          <div class="ai-actions">
            <button class="btn-secondary" @click="close">Discard</button>
            <button
              v-if="editorAvailableAtOpen"
              class="btn-secondary insert-btn"
              :disabled="saving || !previewBody.trim()"
              @click="insertAtCursor"
              title="Insert into the currently open note at cursor position"
            >
              <ClipboardEdit :size="14" />
              Insert at cursor
            </button>
            <button
              class="btn-primary"
              :disabled="saving || !previewTitle.trim() || !previewBody.trim()"
              @click="saveAsNote"
            >
              <Loader2 v-if="saving" :size="14" class="spin" />
              <FilePlus v-else :size="14" />
              {{ saving ? 'Saving...' : 'Save as note' }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-modal);
  display: flex;
  justify-content: center;
  padding-top: 8vh;
  z-index: 1000;
}

.ai-modal {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  width: 720px;
  max-width: calc(100vw - 32px);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.ai-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-subtle);
}

.ai-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ai-title h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.ai-spark { color: var(--accent-warn); }

.ai-header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mode-toggle {
  display: inline-flex;
  background: var(--bg-main);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 2px;
  gap: 2px;
}
.mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: var(--text-muted);
  padding: 4px 10px;
  border-radius: 4px;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.mode-btn:hover:not(:disabled) { color: var(--text-primary); }
.mode-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.mode-btn.active {
  background: var(--accent-primary);
  color: white;
}

.ai-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  display: flex;
}
.ai-close:hover { color: var(--text-primary); }

.ai-disabled {
  padding: 30px 24px;
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
}
.ai-disabled code {
  background: var(--hover-bg);
  padding: 1px 5px;
  border-radius: 3px;
}

.ai-body {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}

.ai-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
}

.ai-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.history-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  color: var(--text-muted);
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  padding: 3px 8px;
  cursor: pointer;
}
.history-btn:hover { color: var(--accent-primary); border-color: var(--accent-primary); }

.prompt-wrap { position: relative; }

.history-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  width: 100%;
  max-height: 240px;
  overflow-y: auto;
  z-index: 5;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.history-item {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  padding: 8px 12px;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.history-item:hover { background: rgba(58, 134, 255, 0.1); color: var(--text-primary); }

.history-clear {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  color: var(--text-muted);
  padding: 8px 12px;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  cursor: pointer;
}
.history-clear:hover { color: var(--status-error); }

.ai-prompt, .ai-input {
  width: 100%;
  background: var(--bg-main);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  padding: 10px 12px;
  box-sizing: border-box;
  resize: vertical;
  outline: none;
}
.ai-prompt:focus, .ai-input:focus { border-color: var(--accent-primary); }
.preview-body {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 12.5px;
  line-height: 1.55;
  min-height: 240px;
}

.streaming-box {
  background: var(--bg-main);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 12px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text-primary);
  white-space: pre-wrap;
  min-height: 240px;
  max-height: 50vh;
  overflow-y: auto;
}

.ai-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}

.ai-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ai-token-bar {
  width: 100%;
  height: 4px;
  background: var(--hover-bg);
  border-radius: 2px;
  overflow: hidden;
}
.ai-token-fill {
  height: 100%;
  transition: width 0.2s;
}
.ai-token-fill.level-ok { background: var(--accent-primary); }
.ai-token-fill.level-warn { background: var(--accent-warn); }
.ai-token-fill.level-over { background: var(--status-error); }

.ai-token-label {
  font-size: 11px;
  color: var(--text-muted);
}
.ai-token-label.level-warn { color: var(--accent-warn); }
.ai-token-label.level-over { color: var(--status-error); }

.condense-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.condense-toggle input { margin: 0; cursor: pointer; }
.condense-toggle:hover { color: var(--text-secondary); }

.deep-hint {
  font-size: 11px;
  color: var(--text-muted);
  background: rgba(58, 134, 255, 0.06);
  border-radius: 4px;
  padding: 8px 10px;
  margin-top: 6px;
  line-height: 1.45;
}

.deep-warn {
  font-size: 11px;
  color: var(--accent-warn);
  background: rgba(255, 159, 28, 0.08);
  border-radius: 4px;
  padding: 8px 10px;
  margin-top: 4px;
  line-height: 1.45;
}

.submit-error {
  font-size: 12px;
  color: var(--status-error);
  background: rgba(220, 53, 69, 0.08);
  border-radius: 4px;
  padding: 8px 10px;
  margin-top: 4px;
}

.ai-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border-subtle);
}

.btn-primary, .btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 6px;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
}
.btn-primary {
  background: var(--accent-primary);
  color: white;
}
.btn-primary:hover:not(:disabled) { opacity: 0.9; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-secondary {
  background: none;
  color: var(--text-secondary);
  border-color: var(--border-subtle);
}
.btn-secondary:hover:not(:disabled) { color: var(--text-primary); border-color: var(--border-strong); }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

.insert-btn { color: var(--accent-primary); border-color: rgba(58, 134, 255, 0.4); }
.insert-btn:hover:not(:disabled) { background: rgba(58, 134, 255, 0.08); color: var(--accent-primary); border-color: var(--accent-primary); }

.btn-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}
.btn-link:hover { color: var(--accent-primary); }

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.preview-meta {
  font-size: 11px;
  color: var(--text-muted);
  font-family: 'SF Mono', monospace;
}

.preview-sources-note {
  font-size: 11px;
  color: var(--text-muted);
  padding: 6px 10px;
  background: rgba(58, 134, 255, 0.06);
  border-radius: 4px;
  margin-top: 4px;
}

.spin {
  animation: spin 0.9s linear infinite;
}
.inline-spin {
  vertical-align: middle;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
