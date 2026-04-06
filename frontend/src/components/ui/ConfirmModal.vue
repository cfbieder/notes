<script setup>
const props = defineProps({
  title: { type: String, default: 'Confirm' },
  message: { type: String, default: 'Are you sure?' },
  confirmText: { type: String, default: 'Confirm' },
  cancelText: { type: String, default: 'Cancel' },
  danger: { type: Boolean, default: false }
});

const emit = defineEmits(['confirm', 'cancel']);
</script>

<template>
  <Teleport to="body">
    <div class="confirm-overlay" @click.self="$emit('cancel')">
      <div class="confirm-modal">
        <div class="confirm-header">
          <h3>{{ title }}</h3>
        </div>
        <div class="confirm-body">
          <p>{{ message }}</p>
        </div>
        <div class="confirm-footer">
          <button class="confirm-cancel-btn" @click="$emit('cancel')">
            {{ cancelText }}
          </button>
          <button
            class="confirm-action-btn"
            :class="{ danger }"
            @click="$emit('confirm')"
          >
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.confirm-modal {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  width: 400px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.confirm-header {
  padding: 16px 20px 0;
}

.confirm-header h3 {
  margin: 0;
  font-size: 16px;
}

.confirm-body {
  padding: 12px 20px 16px;
}

.confirm-body p {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  white-space: pre-line;
}

.confirm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border-subtle);
}

.confirm-cancel-btn {
  padding: 7px 16px;
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  cursor: pointer;
}
.confirm-cancel-btn:hover {
  border-color: rgba(255, 255, 255, 0.2);
  color: var(--text-primary);
}

.confirm-action-btn {
  padding: 7px 16px;
  background: var(--accent-primary);
  border: none;
  border-radius: 6px;
  color: white;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.confirm-action-btn:hover { opacity: 0.88; }

.confirm-action-btn.danger {
  background: #e53935;
}
.confirm-action-btn.danger:hover { opacity: 0.88; }
</style>
