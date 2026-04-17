<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { RouterView } from 'vue-router';
import SearchPalette from './components/ui/SearchPalette.vue';
import QuickCapture from './components/ui/QuickCapture.vue';
import MobileFAB from './components/mobile/MobileFAB.vue';
import InstallBanner from './components/ui/InstallBanner.vue';
import OfflineStatus from './components/ui/OfflineStatus.vue';
import HelpModal from './components/ui/HelpModal.vue';
import ToastContainer from './components/ui/ToastContainer.vue';
import AIAssistModal from './components/ai/AIAssistModal.vue';
import { useAuthStore } from './stores/auth.js';
import { useUIStore } from './stores/ui.js';
import { useAIAssistStore } from './stores/aiAssist.js';
import { useMobile } from './composables/useMobile.js';

const authStore = useAuthStore();
const uiStore = useUIStore();
const aiAssistStore = useAIAssistStore();
const { isMobile } = useMobile();
const showSearch = ref(false);
const showCapture = ref(false);
const captureInitialType = ref('note');

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

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
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
