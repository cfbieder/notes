<script setup>
import { Trash2 } from 'lucide-vue-next';
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <h3>Trash</h3>
    </div>
    <div class="panel-empty">
      <Trash2 :size="20" />
      <p>Deleted notes, ideas, and tasks.</p>
      <p class="hint">Items auto-purge after 30 days. Type filters coming in a follow-on.</p>
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px 12px;
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
.panel-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--text-muted);
  padding: 24px 16px;
  gap: 8px;
}
.panel-empty p {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}
.panel-empty .hint {
  font-size: 11px;
  opacity: 0.7;
}
</style>
