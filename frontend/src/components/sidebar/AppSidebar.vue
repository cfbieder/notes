<script setup>
import { onMounted, ref } from 'vue';
import ActivityRail from './ActivityRail.vue';
import ContextualPanel from './ContextualPanel.vue';
import RemindersPanel from '../ui/RemindersPanel.vue';
import { useRemindersStore } from '../../stores/reminders.js';
import { useAIAssistStore } from '../../stores/aiAssist.js';
import { useIdeasStore } from '../../stores/ideas.js';
import { useNotebooksStore } from '../../stores/notebooks.js';
import { useTagsStore } from '../../stores/tags.js';
import { useUIStore } from '../../stores/ui.js';
import { useRailShortcuts } from '../../composables/useRailShortcuts.js';

// CR026: this component used to be a 1,178-line monolith holding every nav
// row, the notebooks tree, the tags tree, and the footer. It's now a thin
// shell — the rail owns top-level navigation, the contextual panel owns
// per-destination content, and individual concerns live in their own files.

const uiStore = useUIStore();
const remindersStore = useRemindersStore();
const aiAssistStore = useAIAssistStore();
const ideasStore = useIdeasStore();
const notebooksStore = useNotebooksStore();
const tagsStore = useTagsStore();

const showReminders = ref(false);
function toggleReminders() {
  showReminders.value = !showReminders.value;
}

// Background data fetches and polling that the old sidebar's onMounted
// kicked off. Keep them here so the behaviour stays identical when the
// shell mounts on each route.
onMounted(async () => {
  await Promise.all([
    notebooksStore.fetchNotebooks(),
    notebooksStore.fetchStacks(),
    tagsStore.fetchTags(),
    remindersStore.fetchReminders(),
    ideasStore.fetchIdeas()
  ]);
  remindersStore.startPolling(60000);
  setTimeout(() => remindersStore.checkDue(), 3000);
  aiAssistStore.startJobsPolling(60000);
});

useRailShortcuts({ onToggleReminders: toggleReminders });
</script>

<template>
  <div class="rail-shell">
    <ActivityRail :reminders-open="showReminders" @toggle-reminders="toggleReminders" />
    <ContextualPanel v-if="!uiStore.railPanelCollapsed" />
    <RemindersPanel v-if="showReminders" @close="showReminders = false" />
  </div>
</template>

<style scoped>
.rail-shell {
  display: flex;
  height: 100vh;
  flex-shrink: 0;
}
</style>
