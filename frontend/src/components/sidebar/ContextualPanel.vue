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
import OfflinePanel from './panels/OfflinePanel.vue';

const route = useRoute();
const appVersion = import.meta.env.VITE_APP_VERSION || 'dev';

const panelMap = {
  notes: NotesPanel,
  tasks: TasksPanel,
  search: SearchPanel,
  graph: GraphPanel,
  ideas: IdeasPanel,
  vault: VaultPanel,
  trash: TrashPanel,
  settings: SettingsPanel,
  offline: OfflinePanel
};

const activePanel = computed(() => panelMap[route.meta?.rail] || NotesPanel);
</script>

<template>
  <aside class="contextual-panel">
    <div class="panel-content">
      <component :is="activePanel" />
    </div>
    <div class="panel-version" :title="`Noted v${appVersion}`">Noted v{{ appVersion }}</div>
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

.panel-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.panel-version {
  border-top: 1px solid var(--border-subtle);
  padding: 6px 12px;
  font-size: 10px;
  color: var(--text-muted);
  text-align: center;
  letter-spacing: 0.04em;
}
</style>
