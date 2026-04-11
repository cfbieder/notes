<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';

const show = ref(false);
let deferredPrompt = null;

function onBeforeInstall(e) {
  e.preventDefault();
  deferredPrompt = e;

  // Don't show if user previously dismissed
  if (localStorage.getItem('pwa-install-dismissed')) return;

  show.value = true;
}

function onAppInstalled() {
  show.value = false;
  deferredPrompt = null;
  localStorage.setItem('pwa-install-dismissed', '1');
}

async function install() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') {
    show.value = false;
    localStorage.setItem('pwa-install-dismissed', '1');
  }
  deferredPrompt = null;
}

function dismiss() {
  show.value = false;
  localStorage.setItem('pwa-install-dismissed', '1');
}

onMounted(() => {
  // Already running as installed PWA — never show
  if (window.matchMedia('(display-mode: standalone)').matches) return;

  window.addEventListener('beforeinstallprompt', onBeforeInstall);
  window.addEventListener('appinstalled', onAppInstalled);
});

onBeforeUnmount(() => {
  window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  window.removeEventListener('appinstalled', onAppInstalled);
});
</script>

<template>
  <Transition name="install-slide">
    <div v-if="show" class="install-banner">
      <div class="install-content">
        <div class="install-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </div>
        <span class="install-text">Install Noted for quick access</span>
      </div>
      <div class="install-actions">
        <button class="install-btn" @click="install">Install</button>
        <button class="dismiss-btn" @click="dismiss" aria-label="Dismiss">&times;</button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.install-banner {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background: var(--bg-sidebar);
  border: 1px solid var(--accent-primary);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  max-width: 420px;
  width: calc(100% - 32px);
}

.install-content {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.install-icon {
  color: var(--accent-primary);
  flex-shrink: 0;
  display: flex;
}

.install-text {
  font-size: 14px;
  color: var(--text-primary);
  white-space: nowrap;
}

.install-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.install-btn {
  padding: 6px 16px;
  background: var(--accent-primary);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.install-btn:hover {
  background: #2a76ef;
}

.dismiss-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 20px;
  cursor: pointer;
  padding: 2px 6px;
  line-height: 1;
  transition: color 0.15s;
}

.dismiss-btn:hover {
  color: var(--text-primary);
}

/* Slide-up transition */
.install-slide-enter-active {
  transition: all 0.3s ease-out;
}
.install-slide-leave-active {
  transition: all 0.2s ease-in;
}
.install-slide-enter-from,
.install-slide-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}

@media (max-width: 767px) {
  .install-banner {
    bottom: 80px; /* above MobileFAB */
  }
}
</style>
