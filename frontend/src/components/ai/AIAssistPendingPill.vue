<script setup>
import { computed, ref, onBeforeUnmount } from 'vue';
import { useAIAssistStore } from '../../stores/aiAssist.js';
import { Loader2, X } from 'lucide-vue-next';

const aiStore = useAIAssistStore();

// We display the oldest in-flight job (typically the only one given the
// one-active-job cap). If concurrency is enabled later this becomes a count
// + popover; for now a single inline pill is enough.
const job = computed(() => aiStore.pendingJobs[0] || null);

const elapsed = ref('');
let tick = null;

function fmtElapsed(startedAt, createdAt) {
  const start = new Date(startedAt || createdAt).getTime();
  const sec = Math.max(0, Math.floor((Date.now() - start) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function refreshElapsed() {
  if (!job.value) { elapsed.value = ''; return; }
  elapsed.value = fmtElapsed(job.value.startedAt, job.value.createdAt);
}

// Update once per second whenever there's a pending job.
function ensureTicker() {
  if (tick) return;
  tick = setInterval(() => {
    if (!job.value) {
      clearInterval(tick);
      tick = null;
      elapsed.value = '';
      return;
    }
    refreshElapsed();
  }, 1000);
  refreshElapsed();
}

ensureTicker();
onBeforeUnmount(() => {
  if (tick) { clearInterval(tick); tick = null; }
});

async function cancel() {
  if (!job.value) return;
  const id = job.value.id;
  await aiStore.cancelJob(id);
}

const tooltip = computed(() => {
  if (!job.value) return '';
  const trimmed = (job.value.prompt || '').trim().split('\n')[0];
  const short = trimmed.length > 80 ? trimmed.slice(0, 77) + '…' : trimmed;
  return `Deep think: "${short}" — ${elapsed.value}`;
});
</script>

<template>
  <div v-if="job" class="ai-pill" :title="tooltip">
    <Loader2 :size="11" class="spin" />
    <span class="pill-label">Deep think</span>
    <span class="pill-elapsed">{{ elapsed }}</span>
    <button class="pill-cancel" @click.stop="cancel" title="Cancel deep-think">
      <X :size="11" />
    </button>
  </div>
</template>

<style scoped>
.ai-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(58, 134, 255, 0.12);
  border: 1px solid rgba(58, 134, 255, 0.35);
  border-radius: 10px;
  padding: 2px 6px 2px 7px;
  margin-left: 8px;
  font-size: 10.5px;
  color: var(--accent-primary);
  font-weight: 500;
  font-family: 'Inter', sans-serif;
  white-space: nowrap;
  user-select: none;
}
.pill-label { line-height: 1; }
.pill-elapsed {
  font-family: 'SF Mono', monospace;
  font-size: 10px;
  color: var(--text-muted);
  margin-left: 1px;
}
.pill-cancel {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin-left: 2px;
  background: none;
  border: none;
  color: var(--text-muted);
  border-radius: 50%;
  cursor: pointer;
  padding: 0;
}
.pill-cancel:hover { color: var(--status-error); background: rgba(220, 53, 69, 0.12); }

.spin {
  animation: spin 1.2s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
