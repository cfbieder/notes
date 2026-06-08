<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { RouterView, useRouter } from 'vue-router';
import SearchPalette from './components/ui/SearchPalette.vue';
import QuickCapture from './components/ui/QuickCapture.vue';
import MobileFAB from './components/mobile/MobileFAB.vue';
import InstallBanner from './components/ui/InstallBanner.vue';
import OfflineStatus from './components/ui/OfflineStatus.vue';
import HelpModal from './components/ui/HelpModal.vue';
import ToastContainer from './components/ui/ToastContainer.vue';
import AIAssistModal from './components/ai/AIAssistModal.vue';
import CheckinConflictModal from './components/ui/CheckinConflictModal.vue';
import { useAuthStore } from './stores/auth.js';
import { useUIStore } from './stores/ui.js';
import { useAIAssistStore } from './stores/aiAssist.js';
import { useNotesStore } from './stores/notes.js';
import { useToastsStore } from './stores/toasts.js';
import { useMobile } from './composables/useMobile.js';
import { onConflict, flush as flushCheckouts } from './lib/checkoutSync.js';

const authStore = useAuthStore();
const uiStore = useUIStore();
const aiAssistStore = useAIAssistStore();
const notesStore = useNotesStore();
const toastsStore = useToastsStore();
const { isMobile } = useMobile();
const router = useRouter();
const showSearch = ref(false);
const showCapture = ref(false);
const captureInitialType = ref('note');

// CR027 — conflict modal state. Triggered by the sync bus whenever a
// /checkin returns 409.
const conflict = ref({ open: false, noteId: null, local: null, server: null });

function onConflictEvent(payload) {
  conflict.value = { open: true, ...payload };
}

async function onOnline() {
  if (!authStore.isAuthenticated) return;
  const result = await flushCheckouts();
  if (result.synced > 0) {
    toastsStore.addToast({
      message: `Synced ${result.synced} offline note${result.synced > 1 ? 's' : ''}`,
      type: 'success'
    });
  }
  // If the visible notes list was a fallback synthesis from IDB, re-fetch
  // the real list now that the network is back.
  if (notesStore.offlineFallback) {
    notesStore.fetchNotes().catch(() => {});
  }
}

async function resolveKeepLocal() {
  const { noteId, server } = conflict.value;
  conflict.value.open = false;
  const result = await notesStore.resolveConflictKeepLocal(noteId, server);
  if (result?.status === 'ok') {
    toastsStore.addToast({ message: 'Saved your version', type: 'success' });
  }
}

async function resolveKeepServer() {
  const { noteId, server } = conflict.value;
  conflict.value.open = false;
  await notesStore.resolveConflictKeepServer(noteId, server);
  toastsStore.addToast({ message: 'Switched to server version', type: 'info' });
}

async function resolveMerged(merged) {
  const { noteId, server } = conflict.value;
  conflict.value.open = false;
  const result = await notesStore.resolveConflictMerged(noteId, server, merged);
  if (result?.status === 'ok') {
    toastsStore.addToast({ message: 'Saved merged version', type: 'success' });
  }
}

function onKeydown(e) {
  // Ctrl+K — Search palette
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    if (authStore.isAuthenticated) {
      showSearch.value = !showSearch.value;
      showCapture.value = false;
    }
  }

  // Alt+N — Quick capture (Note tab)
  if (e.altKey && e.key === 'n') {
    e.preventDefault();
    if (authStore.isAuthenticated) {
      captureInitialType.value = 'note';
      showCapture.value = !showCapture.value;
      showSearch.value = false;
    }
  }

  // Alt+I — Quick capture (Idea tab)
  if (e.altKey && e.key === 'i') {
    e.preventDefault();
    if (authStore.isAuthenticated) {
      captureInitialType.value = 'idea';
      showCapture.value = true;
      showSearch.value = false;
    }
  }

  // Cmd/Ctrl+Shift+A — AI Assist (desktop only)
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
    e.preventDefault();
    if (authStore.isAuthenticated && !isMobile.value) {
      aiAssistStore.toggle();
    }
  }

  // Alt+V — Quick capture (Voice tab)
  if (e.altKey && e.key === 'v') {
    e.preventDefault();
    if (authStore.isAuthenticated) {
      captureInitialType.value = 'voice';
      showCapture.value = true;
      showSearch.value = false;
    }
  }

  if (!authStore.isAuthenticated) return;

  // Alt+\ — Focus mode: toggle both side panels
  if (e.altKey && e.key === '\\') {
    e.preventDefault();
    uiStore.toggleFocusMode();
  }

  // Alt+[ — Toggle note list panel
  if (e.altKey && e.key === '[') {
    e.preventDefault();
    uiStore.toggleNoteList();
  }

  // Alt+] — Toggle context panels
  if (e.altKey && e.key === ']') {
    e.preventDefault();
    uiStore.toggleContextPanels();
  }

  // Alt+/ — Help / keyboard shortcuts
  if (e.altKey && e.key === '/') {
    e.preventDefault();
    uiStore.toggleHelp();
  }

  // Esc — close help
  if (e.key === 'Escape' && uiStore.showHelp) {
    uiStore.showHelp = false;
  }
}

function onFABClick() {
  if (authStore.isAuthenticated) {
    captureInitialType.value = 'note';
    showCapture.value = true;
  }
}

function onQuickCaptureEvent(e) {
  if (!authStore.isAuthenticated) return;
  const type = e.detail?.type || 'note';
  captureInitialType.value = type;
  showCapture.value = true;
  showSearch.value = false;
}

// Fired by the API client when /auth/refresh is rejected (genuine session
// expiry). Clear local session state and bounce to login — idempotent so a
// burst of failed calls can't loop the redirect.
function onSessionExpired() {
  // Already handled (redirecting, or session already cleared by a prior event).
  if (router.currentRoute.value.name === 'Login' || !authStore.hasSessionHint) return;
  authStore.expireSession();
  toastsStore.addToast({ message: 'Your session expired — please log in again.', type: 'info' });
  router.push('/login');
}

let unsubscribeConflict = null;

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('noted:quick-capture', onQuickCaptureEvent);
  window.addEventListener('online', onOnline);
  window.addEventListener('noted:session-expired', onSessionExpired);
  unsubscribeConflict = onConflict(onConflictEvent);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('noted:quick-capture', onQuickCaptureEvent);
  window.removeEventListener('online', onOnline);
  window.removeEventListener('noted:session-expired', onSessionExpired);
  if (unsubscribeConflict) unsubscribeConflict();
});
</script>

<template>
  <RouterView />
  <SearchPalette v-if="showSearch" @close="showSearch = false" />
  <QuickCapture v-if="showCapture" :initial-type="captureInitialType" @close="showCapture = false" />
  <MobileFAB v-if="authStore.isAuthenticated" @click="onFABClick" />
  <InstallBanner />
  <OfflineStatus v-if="authStore.isAuthenticated" />
  <HelpModal v-if="uiStore.showHelp" @close="uiStore.showHelp = false" />
  <AIAssistModal v-if="aiAssistStore.isOpen && !isMobile" @close="aiAssistStore.close()" />
  <CheckinConflictModal
    :open="conflict.open"
    :note-id="conflict.noteId"
    :local="conflict.local"
    :server="conflict.server"
    @close="conflict.open = false"
    @keep-local="resolveKeepLocal"
    @keep-server="resolveKeepServer"
    @merged="resolveMerged"
  />
  <ToastContainer />
</template>

<style>
body {
  margin: 0;
  font-family: 'Inter', sans-serif;
  background-color: var(--bg-main);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3 {
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-weight: 600;
  color: var(--text-primary);
}
</style>
