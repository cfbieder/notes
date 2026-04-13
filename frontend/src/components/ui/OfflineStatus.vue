<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { WifiOff, RefreshCw, Check } from 'lucide-vue-next';
import { pendingCount, flush } from '../../lib/offlineOutbox.js';
import { useAuthStore } from '../../stores/auth.js';

const authStore = useAuthStore();
const online = ref(navigator.onLine);
const syncing = ref(false);
const lastResult = ref(null); // 'synced' | 'failed' | null
let resultTimer = null;

function showResult(kind) {
  lastResult.value = kind;
  if (resultTimer) clearTimeout(resultTimer);
  resultTimer = setTimeout(() => { lastResult.value = null; }, 2500);
}

async function doFlush() {
  if (syncing.value) return;
  if (pendingCount.value === 0) return;
  syncing.value = true;
  try {
    const res = await flush();
    if (res.offline) {
      // still offline — silent
    } else if (res.failed > 0) {
      showResult('failed');
    } else if (res.synced > 0) {
      showResult('synced');
      authStore.offlineMode = false;
    }
  } finally {
    syncing.value = false;
  }
}

function onOnline() {
  online.value = true;
  authStore.offlineMode = false;
  doFlush();
}
function onOffline() {
  online.value = false;
  authStore.offlineMode = true;
}

onMounted(() => {
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  // Attempt flush on mount in case we loaded already-online with a pending queue.
  if (online.value) doFlush();
});

onBeforeUnmount(() => {
  window.removeEventListener('online', onOnline);
  window.removeEventListener('offline', onOffline);
  if (resultTimer) clearTimeout(resultTimer);
});

const visible = computed(() =>
  !online.value || pendingCount.value > 0 || lastResult.value !== null
);

const label = computed(() => {
  if (lastResult.value === 'synced') return 'Synced';
  if (lastResult.value === 'failed') return 'Sync failed';
  if (!online.value) {
    return pendingCount.value > 0
      ? `Offline · ${pendingCount.value} pending`
      : 'Offline';
  }
  if (syncing.value) return 'Syncing…';
  return `${pendingCount.value} pending`;
});

const variant = computed(() => {
  if (lastResult.value === 'synced') return 'ok';
  if (lastResult.value === 'failed') return 'err';
  if (!online.value) return 'warn';
  return 'info';
});
</script>

<template>
  <div
    v-if="visible"
    class="offline-pill"
    :class="variant"
    @click="doFlush"
    :title="online ? 'Click to retry sync' : 'You are offline'"
  >
    <Check v-if="lastResult === 'synced'" :size="13" />
    <WifiOff v-else-if="!online" :size="13" />
    <RefreshCw v-else :size="13" :class="{ spin: syncing }" />
    <span>{{ label }}</span>
  </div>
</template>

<style scoped>
.offline-pill {
  position: fixed;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  z-index: 950;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  user-select: none;
}
.offline-pill.warn {
  background: rgba(255, 193, 7, 0.18);
  border: 1px solid rgba(255, 193, 7, 0.5);
  color: var(--accent-warn);
}
.offline-pill.info {
  background: rgba(58, 134, 255, 0.15);
  border: 1px solid rgba(58, 134, 255, 0.5);
  color: var(--accent-primary);
}
.offline-pill.ok {
  background: rgba(46, 204, 113, 0.15);
  border: 1px solid rgba(46, 204, 113, 0.5);
  color: #2ecc71;
}
.offline-pill.err {
  background: rgba(231, 76, 60, 0.15);
  border: 1px solid rgba(231, 76, 60, 0.5);
  color: #e74c3c;
}
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
