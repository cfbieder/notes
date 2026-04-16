<script setup>
import { X } from 'lucide-vue-next';

defineEmits(['close']);

const shortcuts = [
  { keys: 'Ctrl+K', label: 'Open search palette' },
  { keys: 'Alt+N', label: 'Quick capture — new note' },
  { keys: 'Alt+I', label: 'Quick capture — new idea' },
  { keys: 'Alt+V', label: 'Quick capture — voice note' },
  { keys: 'Alt+\\', label: 'Focus mode (collapse side panels)' },
  { keys: 'Alt+[', label: 'Toggle note list panel' },
  { keys: 'Alt+]', label: 'Toggle backlinks / attachments panels' },
  { keys: 'Alt+/', label: 'Show this help' },
  { keys: 'Esc', label: 'Close modal / palette' }
];
</script>

<template>
  <Teleport to="body">
    <div class="help-overlay" @click.self="$emit('close')">
      <div class="help-modal">
        <div class="help-header">
          <span>Keyboard Shortcuts</span>
          <button class="help-close" @click="$emit('close')"><X :size="16" /></button>
        </div>
        <ul class="help-list">
          <li v-for="s in shortcuts" :key="s.keys">
            <kbd>{{ s.keys }}</kbd>
            <span>{{ s.label }}</span>
          </li>
        </ul>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.help-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  padding-top: 15vh;
  z-index: 1600;
}
.help-modal {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  width: 440px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}
.help-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle);
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}
.help-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
}
.help-list {
  list-style: none;
  margin: 0;
  padding: 8px 16px 16px;
  overflow-y: auto;
}
.help-list li {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 0;
  font-size: 13px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-subtle);
}
.help-list li:last-child { border-bottom: none; }
.help-list kbd {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  background: var(--bg-main);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  padding: 3px 7px;
  color: var(--text-primary);
  min-width: 72px;
  text-align: center;
  flex-shrink: 0;
}
</style>
