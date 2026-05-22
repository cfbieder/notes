<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { CloudOff, RefreshCw } from 'lucide-vue-next';
import AppSidebar from '../components/sidebar/AppSidebar.vue';
import { listCheckouts } from '../lib/checkouts.js';
import { flush as flushCheckouts, syncState } from '../lib/checkoutSync.js';
import { useToastsStore } from '../stores/toasts.js';
import { useNotesStore } from '../stores/notes.js';

const router = useRouter();
const toastsStore = useToastsStore();
const notesStore = useNotesStore();

const rows = ref([]);

async function refresh() { rows.value = await listCheckouts(); }
let pollHandle = null;
onMounted(async () => { await refresh(); pollHandle = setInterval(refresh, 2000); });
onBeforeUnmount(() => { if (pollHandle) clearInterval(pollHandle); });

const dirty = computed(() => rows.value.filter(r => r.dirty === 1));
const clean = computed(() => rows.value.filter(r => r.dirty !== 1));

function fmtAgo(t) {
  if (!t) return '—';
  const ms = Date.now() - t;
  if (ms < 60000) return 'just now';
  if (ms < 3600000) return `${Math.round(ms / 60000)} min ago`;
  if (ms < 86400000) return `${Math.round(ms / 3600000)} h ago`;
  return `${Math.round(ms / 86400000)} d ago`;
}

async function checkInAll() {
  const result = await flushCheckouts();
  await refresh();
  if (result.synced > 0) toastsStore.addToast({ message: `Checked in ${result.synced}`, type: 'success' });
  if (result.conflicts > 0) toastsStore.addToast({ message: `${result.conflicts} conflict${result.conflicts > 1 ? 's' : ''}`, type: 'warning' });
}

function openNote(row) { router.push(`/notes/${row.noteId}`); }

async function discardOne(row) {
  if (row.dirty === 1 && !confirm(`Discard unsaved local changes for "${row.localTitle || 'this note'}"?`)) return;
  await notesStore.discardOfflineCopy(row.noteId);
  await refresh();
}
</script>

<template>
  <div class="layout">
    <AppSidebar />
    <main class="offline-main">
      <header class="header">
        <div>
          <h1><CloudOff :size="18" /> Offline Notes</h1>
          <p class="muted">Notes you've taken offline for reading or editing without a network connection.</p>
        </div>
        <button v-if="dirty.length > 0" class="btn primary" @click="checkInAll" :disabled="syncState.flushing">
          <RefreshCw :size="14" :class="{ spinning: syncState.flushing }" /> Check in all ({{ dirty.length }})
        </button>
      </header>

      <section v-if="rows.length === 0" class="empty">
        <CloudOff :size="48" />
        <p>No notes available offline.</p>
        <p class="hint">From any note, open the toolbar and click <strong>Offline</strong> to take it with you.</p>
      </section>

      <section v-else class="lists">
        <div v-if="dirty.length > 0" class="card">
          <h2>Dirty ({{ dirty.length }})</h2>
          <div v-for="row in dirty" :key="row.noteId" class="row dirty" @click="openNote(row)">
            <div class="row-main">
              <div class="row-title">{{ row.localTitle || '(untitled)' }}</div>
              <div class="row-sub">edited {{ fmtAgo(row.lastEditedAt) }}</div>
            </div>
            <button class="row-btn" @click.stop="discardOne(row)" title="Discard offline copy">Discard</button>
          </div>
        </div>
        <div v-if="clean.length > 0" class="card">
          <h2>Clean ({{ clean.length }})</h2>
          <div v-for="row in clean" :key="row.noteId" class="row" @click="openNote(row)">
            <div class="row-main">
              <div class="row-title">{{ row.localTitle || '(untitled)' }}</div>
              <div class="row-sub">synced {{ fmtAgo(row.lastSyncAttemptAt || row.checkedOutAt) }}</div>
            </div>
            <button class="row-btn" @click.stop="discardOne(row)" title="Discard offline copy">Discard</button>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
}
.offline-main {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
  box-sizing: border-box;
}
.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.header h1 {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 4px 0;
  font-size: 20px;
}
.muted { color: var(--text-secondary); font-size: 13px; margin: 0; }
.empty {
  text-align: center;
  padding: 64px 16px;
  color: var(--text-muted);
}
.empty p { margin: 4px 0; font-size: 13px; }
.empty .hint { font-size: 12px; opacity: 0.8; }
.lists {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 8px;
}
.card h2 {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  padding: 8px 12px;
  margin: 0;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  border-left: 3px solid transparent;
}
.row:hover { background: var(--bg-hover); }
.row.dirty { border-left-color: var(--accent-warn, #ffb800); }
.row-main { flex: 1; min-width: 0; }
.row-title { font-size: 13px; color: var(--text-primary); }
.row-sub { font-size: 11px; color: var(--text-muted); }
.row-btn {
  background: none;
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
}
.row-btn:hover { background: var(--bg-elevated); color: var(--status-error); }
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}
.btn:hover { background: var(--bg-hover); }
.btn.primary {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: var(--on-accent-primary, #fff);
}
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.spinning { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
