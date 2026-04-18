<script setup>
import { useToastsStore } from '../../stores/toasts.js';
import { X } from 'lucide-vue-next';

const toastsStore = useToastsStore();
</script>

<template>
  <Teleport to="body">
    <div class="toast-container" v-if="toastsStore.toasts.length > 0">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toastsStore.toasts"
          :key="toast.id"
          class="toast-item"
          :class="toast.type"
        >
          <span class="toast-message">{{ toast.message }}</span>
          <button
            v-if="toast.action"
            class="toast-action"
            @click="toast.action(); toastsStore.removeToast(toast.id)"
          >
            {{ toast.actionLabel }}
          </button>
          <button class="toast-close" @click="toastsStore.removeToast(toast.id)">
            <X :size="14" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  max-width: 380px;
}

@media (max-width: 768px) {
  .toast-container {
    right: 12px;
    left: 12px;
    bottom: 80px; /* above MobileFAB */
    max-width: none;
  }
}

.toast-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-left: 3px solid var(--accent-primary);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  font-size: 13px;
  color: var(--text-primary);
}

.toast-item.warning { border-left-color: var(--accent-warn); }
.toast-item.error { border-left-color: var(--status-error); }
.toast-item.success { border-left-color: var(--accent-success); }

.toast-message {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toast-action {
  background: none;
  border: none;
  color: var(--accent-primary);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  padding: 2px 6px;
  border-radius: 4px;
}
.toast-action:hover { background: rgba(58, 134, 255, 0.12); }

.toast-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px;
  flex-shrink: 0;
}
.toast-close:hover { color: var(--text-primary); }

/* Transitions */
.toast-enter-active { transition: all 0.3s ease; }
.toast-leave-active { transition: all 0.2s ease; }
.toast-enter-from { opacity: 0; transform: translateY(16px); }
.toast-leave-to { opacity: 0; transform: translateX(100%); }
</style>
