<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AppSidebar from '../sidebar/AppSidebar.vue';
import { ArrowLeft, Menu } from 'lucide-vue-next';

defineProps({
  title: { type: String, default: '' }
});

const router = useRouter();
const sidebarOpen = ref(false);

function goBack() {
  router.push('/notes');
}
</script>

<template>
  <div class="mobile-layout">
    <header class="mobile-view-header">
      <button class="back-btn" @click="goBack">
        <ArrowLeft :size="20" />
      </button>
      <h2 class="view-title">{{ title }}</h2>
      <button class="menu-btn" @click="sidebarOpen = true">
        <Menu :size="20" />
      </button>
    </header>

    <div class="mobile-view-content">
      <slot />
    </div>

    <!-- Sidebar overlay -->
    <Teleport to="body">
      <div v-if="sidebarOpen" class="mobile-sidebar-overlay" @click="sidebarOpen = false" />
      <div v-if="sidebarOpen" class="mobile-sidebar-drawer">
        <AppSidebar />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.mobile-layout {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-main);
}

.mobile-view-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.back-btn, .menu-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  padding: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
}
.back-btn:hover, .menu-btn:hover { color: var(--text-primary); }

.view-title {
  flex: 1;
  margin: 0;
  font-size: 18px;
}

.menu-btn {
  margin-left: auto;
}

.mobile-view-content {
  flex: 1;
  overflow-y: auto;
}
</style>
