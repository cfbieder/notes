<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { CloudOff, RefreshCw, CloudUpload, AlertTriangle } from 'lucide-vue-next';
import { getCheckout } from '../../lib/checkouts.js';

const props = defineProps({
  noteId: { type: String, default: null }
});
const emit = defineEmits(['check-in', 'discard']);

const row = ref(null);
const online = ref(typeof navigator !== 'undefined' ? navigator.onLine : true);

async function refresh() {
  if (!props.noteId) { row.value = null; return; }
  row.value = await getCheckout(props.noteId);
}

function onOnline() { online.value = true; }
function onOffline() { online.value = false; }

watch(() => props.noteId, refresh);

let pollHandle = null;
onMounted(() => {
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  refresh();
  // External edits to the checkout (typing in the editor) flip dirty — refresh
  // on a short poll while mounted. Cheap: one IDB read per second.
  pollHandle = setInterval(refresh, 1000);
});

onBeforeUnmount(() => {
  window.removeEventListener('online', onOnline);
  window.removeEventListener('offline', onOffline);
  if (pollHandle) clearInterval(pollHandle);
});

const visible = computed(() => !!row.value);
const dirty = computed(() => row.value?.dirty === 1);
const hasConflictError = computed(() => row.value?.lastSyncError && /conflict/i.test(row.value.lastSyncError));

const lastSyncedLabel = computed(() => {
  const t = row.value?.lastSyncAttemptAt;
  if (!t) return 'not yet synced';
  const ms = Date.now() - t;
  if (ms < 60000) return 'just now';
  if (ms < 3600000) return `${Math.round(ms / 60000)}m ago`;
  if (ms < 86400000) return `${Math.round(ms / 3600000)}h ago`;
  return `${Math.round(ms / 86400000)}d ago`;
});
</script>

<template>
  <div v-if="visible" class="checkout-banner" :class="{ dirty, offline: !online, conflict: hasConflictError }">
    <CloudOff :size="14" class="banner-icon" />
    <span v-if="hasConflictError" class="banner-text">
      <AlertTriangle :size="12" /> Conflict on last check-in
    </span>
    <span v-else-if="!online" class="banner-text">
      Offline · changes will sync when you're back online
    </span>
    <span v-else-if="dirty" class="banner-text">
      Offline copy · unsaved changes
    </span>
    <span v-else class="banner-text">
      Offline copy · synced {{ lastSyncedLabel }}
    </span>

    <div class="banner-actions">
      <button v-if="online && (dirty || hasConflictError)" class="banner-btn" @click="emit('check-in')">
        <CloudUpload :size="12" />
        <span>Check in now</span>
      </button>
      <button class="banner-btn ghost" @click="emit('discard')" title="Remove from offline mode (local copy only — server is untouched)">
        <CloudOff :size="12" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.checkout-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-subtle);
  font-size: 12px;
  color: var(--text-secondary);
}

.checkout-banner.dirty {
  background: var(--accent-warn-bg, rgba(255, 184, 0, 0.08));
  color: var(--text-primary);
}

.checkout-banner.offline {
  background: var(--accent-info-bg, rgba(80, 160, 255, 0.08));
  color: var(--text-primary);
}

.checkout-banner.conflict {
  background: var(--status-error-bg, rgba(220, 40, 40, 0.08));
  color: var(--text-primary);
}

.banner-icon {
  color: var(--text-secondary);
}

.banner-text {
  flex: 1;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.banner-actions {
  display: flex;
  gap: 4px;
}

.banner-btn {
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

.banner-btn:hover {
  background: var(--bg-hover);
}

.banner-btn.ghost {
  background: none;
  border-color: transparent;
}
</style>
