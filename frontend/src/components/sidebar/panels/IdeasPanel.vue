<script setup>
import { useIdeasStore } from '../../../stores/ideas.js';
import { Lightbulb } from 'lucide-vue-next';

const ideasStore = useIdeasStore();
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <h3>Ideas</h3>
    </div>
    <div class="panel-empty">
      <Lightbulb :size="20" />
      <p v-if="ideasStore.count > 0">{{ ideasStore.count }} idea<span v-if="ideasStore.count !== 1">s</span> waiting.</p>
      <p v-else>No ideas captured yet.</p>
      <p class="hint">Status filters (All / Promoted / Dismissed) coming in a follow-on.</p>
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
