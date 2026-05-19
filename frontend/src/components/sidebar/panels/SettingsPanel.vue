<script setup>
import { Settings, LogOut } from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../../stores/auth.js';

const router = useRouter();
const authStore = useAuthStore();

const version = import.meta.env.VITE_APP_VERSION || 'dev';

async function handleLogout() {
  await authStore.logout();
  router.push('/login');
}
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <h3>Settings</h3>
    </div>
    <div class="panel-body">
      <div class="hint-block">
        <Settings :size="16" />
        <p>Theme, account, integrations, vault, backups, system, and about — all in the main view to the right.</p>
        <p class="hint">Section quick-links coming in a follow-on.</p>
      </div>
    </div>
    <div class="panel-footer">
      <div class="user-row">
        <span class="user-name">{{ authStore.user?.username }}</span>
        <span class="version">v{{ version }}</span>
      </div>
      <button class="footer-btn" @click="handleLogout">
        <LogOut :size="14" />
        <span>Sign out</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px 12px 8px;
  box-sizing: border-box;
}
.panel-header {
  padding: 0 8px 12px;
}
.panel-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.panel-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.hint-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  color: var(--text-muted);
  padding: 24px 16px;
}
.hint-block p {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}
.hint-block .hint {
  font-size: 11px;
  opacity: 0.7;
}
.panel-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 4px 0;
  border-top: 1px solid var(--border-subtle);
}
.user-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 0 8px;
}
.user-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}
.version {
  font-size: 10px;
  color: var(--text-muted);
}
.footer-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 6px;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
}
.footer-btn:hover {
  color: var(--text-primary);
  border-color: var(--border-strong);
}
</style>
