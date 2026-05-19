<script setup>
import { Network } from 'lucide-vue-next';
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <h3>Graph</h3>
    </div>
    <div class="panel-empty">
      <Network :size="20" />
      <p>Knowledge graph of notes and tags.</p>
      <p class="hint">Filter and display controls live inline in the graph view for now; moving here in a follow-on.</p>
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
