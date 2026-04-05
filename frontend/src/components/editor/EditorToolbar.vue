<script setup>
import { useUIStore } from '../../stores/ui.js';
import { Code, Eye, Save } from 'lucide-vue-next';

const uiStore = useUIStore();

const props = defineProps({
  noteTitle: { type: String, default: '' }
});

const emit = defineEmits(['update:noteTitle']);

function onTitleInput(e) {
  emit('update:noteTitle', e.target.value);
}
</script>

<template>
  <div class="editor-toolbar">
    <input
      class="title-input"
      :value="noteTitle"
      @input="onTitleInput"
      placeholder="Untitled"
    />

    <div class="toolbar-actions">
      <div class="save-indicator" :class="uiStore.saveStatus">
        <Save :size="14" />
        <span>{{ uiStore.saveStatus === 'saving' ? 'Saving...' : uiStore.saveStatus === 'unsaved' ? 'Unsaved' : 'Saved' }}</span>
      </div>

      <button
        class="mode-toggle"
        :class="{ active: uiStore.editorMode === 'source' }"
        @click="uiStore.toggleEditorMode()"
        :title="uiStore.editorMode === 'source' ? 'Normal Mode' : 'Source Mode'"
      >
        <Code v-if="uiStore.editorMode === 'normal'" :size="16" />
        <Eye v-else :size="16" />
        <span>{{ uiStore.editorMode === 'source' ? 'Normal' : 'Source' }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.editor-toolbar {
  display: flex;
  align-items: center;
  padding: 12px 24px;
  border-bottom: 1px solid var(--border-subtle);
  gap: 16px;
}

.title-input {
  flex: 1;
  background: none;
  border: none;
  color: var(--text-primary);
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 20px;
  font-weight: 600;
  padding: 0;
  outline: none;
}

.title-input::placeholder {
  color: var(--text-muted);
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.save-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-muted);
}
.save-indicator.saving { color: var(--accent-warn); }
.save-indicator.unsaved { color: var(--accent-warn); }
.save-indicator.saved { color: var(--accent-success); }

.mode-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.1s;
}
.mode-toggle:hover {
  border-color: var(--accent-primary);
  color: var(--text-primary);
}
.mode-toggle.active {
  background-color: rgba(58, 134, 255, 0.12);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}
</style>
