<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { useRouter } from 'vue-router';
import { CloudOff, RefreshCw, Trash2, MoreHorizontal } from 'lucide-vue-next';
import { listCheckouts, checkoutCount } from '../../../lib/checkouts.js';
import { flush as flushCheckouts, syncState } from '../../../lib/checkoutSync.js';
import { useNotesStore } from '../../../stores/notes.js';
import { useToastsStore } from '../../../stores/toasts.js';

const router = useRouter();
const notesStore = useNotesStore();
const toastsStore = useToastsStore();

const rows = ref([]);
const persistenceLabel = ref('unknown');

async function refresh() {
  rows.value = await listCheckouts();
}

let pollHandle = null;
onMounted(async () => {
  await refresh();
  pollHandle = setInterval(refresh, 2000);
  if (navigator.storage && navigator.storage.persisted) {
    try {
      const persisted = await navigator.storage.persisted();
      persistenceLabel.value = persisted ? 'persistent' : 'best-effort (may be evicted)';
    } catch {
      persistenceLabel.value = 'unknown';
    }
  }
});
onBeforeUnmount(() => {
  if (pollHandle) clearInterval(pollHandle);
});

const dirty = computed(() => rows.value.filter(r => r.dirty === 1));
const clean = computed(() => rows.value.filter(r => r.dirty !== 1));

const totalSizeKB = computed(() => {
  let bytes = 0;
  for (const r of rows.value) {
    bytes += (r.localContent || '').length + (r.baseContent || '').length;
    bytes += (r.localTitle || '').length + (r.baseTitle || '').length;
  }
  return Math.round(bytes / 1024);
});

function fmtAgo(t) {
  if (!t) return '—';
  const ms = Date.now() - t;
  if (ms < 60000) return 'just now';
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  if (ms < 86400000) return `${Math.round(ms / 3600000)}h`;
  return `${Math.round(ms / 86400000)}d`;
}

function openNote(row) {
  router.push(`/notes/${row.noteId}`);
}

async function checkInAll() {
  const result = await flushCheckouts();
  await refresh();
  if (result.synced > 0) {
    toastsStore.addToast({ message: `Checked in ${result.synced} note${result.synced > 1 ? 's' : ''}`, type: 'success' });
  }
  if (result.conflicts > 0) {
    toastsStore.addToast({ message: `${result.conflicts} conflict${result.conflicts > 1 ? 's' : ''} need attention`, type: 'warning' });
  }
  if (result.offline) {
    toastsStore.addToast({ message: 'Still offline — try again later', type: 'info' });
  }
}

async function discardOne(row) {
  if (row.dirty === 1 && !confirm('Discard unsaved local changes for "' + (row.localTitle || 'this note') + '"?')) return;
  await notesStore.discardOfflineCopy(row.noteId);
  await refresh();
}
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <h3>Offline</h3>
      <button
        v-if="dirty.length > 0"
        class="header-btn"
        @click="checkInAll"
        :disabled="syncState.flushing"
        :title="syncState.flushing ? 'Syncing…' : 'Check in all dirty notes'"
      >
        <RefreshCw :size="12" :class="{ spinning: syncState.flushing }" />
        <span>Check in all</span>
      </button>
    </div>

    <div v-if="rows.length === 0" class="panel-empty">
      <CloudOff :size="20" />
      <p>No notes available offline.</p>
      <p class="hint">Open a note → editor menu → <strong>Make available offline</strong> to take it with you.</p>
    </div>

    <div v-else class="panel-list">
      <div v-if="dirty.length > 0" class="section">
        <div class="section-title">Dirty <span class="count">{{ dirty.length }}</span></div>
        <div
          v-for="row in dirty"
          :key="row.noteId"
          class="row dirty"
          @click="openNote(row)"
        >
          <div class="row-main">
            <div class="row-title">{{ row.localTitle || '(untitled)' }}</div>
            <div class="row-sub">edited {{ fmtAgo(row.lastEditedAt) }} ago</div>
          </div>
          <button class="row-btn" @click.stop="discardOne(row)" title="Discard offline copy">
            <Trash2 :size="12" />
          </button>
        </div>
      </div>

      <div v-if="clean.length > 0" class="section">
        <div class="section-title">Clean <span class="count">{{ clean.length }}</span></div>
        <div
          v-for="row in clean"
          :key="row.noteId"
          class="row"
          @click="openNote(row)"
        >
          <div class="row-main">
            <div class="row-title">{{ row.localTitle || '(untitled)' }}</div>
            <div class="row-sub">synced {{ fmtAgo(row.lastSyncAttemptAt || row.checkedOutAt) }} ago</div>
          </div>
          <button class="row-btn" @click.stop="discardOne(row)" title="Discard offline copy">
            <Trash2 :size="12" />
          </button>
        </div>
      </div>
    </div>

    <div class="panel-footer">
      <div class="footer-line">Storage: <strong>{{ persistenceLabel }}</strong></div>
      <div class="footer-line">~{{ totalSizeKB }} KB cached</div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
}

.panel-header {
  padding: 12px 12px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-subtle);
}

.panel-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
}
.header-btn:hover { background: var(--bg-hover); }
.header-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.spinning {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

.panel-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--text-muted);
  padding: 24px 16px;
  gap: 8px;
}

.panel-empty p {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}

.panel-empty .hint {
  font-size: 11px;
  opacity: 0.8;
}

.panel-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.section {
  padding: 8px 4px 12px;
}

.section-title {
  padding: 4px 12px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}

.count {
  background: var(--bg-elevated);
  color: var(--text-secondary);
  border-radius: 8px;
  padding: 0 6px;
  font-size: 10px;
}

.row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  cursor: pointer;
  border-left: 2px solid transparent;
}

.row:hover {
  background: var(--bg-hover);
}

.row.dirty {
  border-left-color: var(--accent-warn, #ffb800);
}

.row-main {
  flex: 1;
  min-width: 0;
}

.row-title {
  font-size: 12px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-sub {
  font-size: 10px;
  color: var(--text-muted);
}

.row-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}
.row-btn:hover {
  background: var(--bg-elevated);
  color: var(--status-error);
}

.panel-footer {
  border-top: 1px solid var(--border-subtle);
  padding: 8px 12px;
  font-size: 10px;
  color: var(--text-muted);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
</style>
