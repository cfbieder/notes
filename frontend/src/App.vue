<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { RouterView } from 'vue-router';
import SearchPalette from './components/ui/SearchPalette.vue';
import QuickCapture from './components/ui/QuickCapture.vue';
import MobileFAB from './components/mobile/MobileFAB.vue';
import { useAuthStore } from './stores/auth.js';

const authStore = useAuthStore();
const showSearch = ref(false);
const showCapture = ref(false);

function onKeydown(e) {
  // Ctrl+K — Search palette
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    if (authStore.isAuthenticated) {
      showSearch.value = !showSearch.value;
      showCapture.value = false;
    }
  }

  // Alt+N — Quick capture
  if (e.altKey && e.key === 'n') {
    e.preventDefault();
    if (authStore.isAuthenticated) {
      showCapture.value = !showCapture.value;
      showSearch.value = false;
    }
  }
}

function onFABClick() {
  if (authStore.isAuthenticated) {
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
  <QuickCapture v-if="showCapture" @close="showCapture = false" />
  <MobileFAB v-if="authStore.isAuthenticated" @click="onFABClick" />
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
