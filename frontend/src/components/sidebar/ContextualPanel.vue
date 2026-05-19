<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import NotesPanel from './panels/NotesPanel.vue';
import TasksPanel from './panels/TasksPanel.vue';
import SearchPanel from './panels/SearchPanel.vue';
import GraphPanel from './panels/GraphPanel.vue';
import IdeasPanel from './panels/IdeasPanel.vue';
import VaultPanel from './panels/VaultPanel.vue';
import TrashPanel from './panels/TrashPanel.vue';
import SettingsPanel from './panels/SettingsPanel.vue';

const route = useRoute();

const panelMap = {
  notes: NotesPanel,
  tasks: TasksPanel,
  search: SearchPanel,
  graph: GraphPanel,
  ideas: IdeasPanel,
  vault: VaultPanel,
  trash: TrashPanel,
  settings: SettingsPanel
};

const activePanel = computed(() => panelMap[route.meta?.rail] || NotesPanel);
</script>

<template>
  <aside class="contextual-panel">
    <component :is="activePanel" />
  </aside>
</template>

<style scoped>
.contextual-panel {
  width: 240px;
  min-width: 240px;
  height: 100vh;
  background-color: var(--bg-sidebar);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}
</style>
