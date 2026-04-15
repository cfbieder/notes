<script setup>
import { useUIStore } from '../../stores/ui.js';
import { computed } from 'vue';
import { Code, Eye, Save, Trash2, RotateCcw, ArrowRight, Languages, Table, PanelLeft, PanelBottom } from 'lucide-vue-next';
import NoteTags from './NoteTags.vue';
import NoteNotebooks from './NoteNotebooks.vue';

const uiStore = useUIStore();

const props = defineProps({
  noteTitle: { type: String, default: '' },
  noteContent: { type: String, default: '' },
  noteType: { type: String, default: 'note' }
});

const emit = defineEmits(['update:noteTitle', 'trash', 'reset-checkboxes', 'promote', 'merge', 'translate', 'insert-table']);

const isIdea = computed(() => props.noteType === 'idea');

const hasCheckedBoxes = computed(() => /- \[x\]/i.test(props.noteContent));

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

    <NoteNotebooks />

    <NoteTags />

    <div class="toolbar-actions">
      <div class="save-indicator" :class="uiStore.saveStatus">
        <Save :size="14" />
        <span>{{ uiStore.saveStatus === 'saving' ? 'Saving...' : uiStore.saveStatus === 'unsaved' ? 'Unsaved' : 'Saved' }}</span>
      </div>

      <button
        class="panel-toggle"
        :class="{ active: uiStore.noteListCollapsed }"
        @click="uiStore.toggleNoteList()"
        title="Toggle note list panel (Alt+[)"
      >
        <PanelLeft :size="16" />
      </button>

      <button
        class="panel-toggle"
        :class="{ active: uiStore.contextPanelsCollapsed }"
        @click="uiStore.toggleContextPanels()"
        title="Toggle backlinks / attachments panels (Alt+])"
      >
        <PanelBottom :size="16" />
      </button>

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

      <button
        v-if="isIdea"
        class="idea-btn"
        @click="$emit('merge')"
        title="Move idea content to another note"
      >
        <ArrowRight :size="14" />
        <span>Move to note</span>
      </button>

      <button
        v-if="isIdea"
        class="idea-btn promote-btn"
        @click="$emit('promote')"
        title="Promote to a regular note in a notebook"
      >
        <span>💡 Promote</span>
      </button>

      <button
        v-if="hasCheckedBoxes"
        class="reset-btn"
        @click="$emit('reset-checkboxes')"
        title="Reset all checkboxes to unchecked"
      >
        <RotateCcw :size="14" />
        <span>Reset</span>
      </button>

      <button
        class="table-btn"
        @click="$emit('insert-table')"
        title="Insert table"
      >
        <Table :size="14" />
        <span>Table</span>
      </button>

      <button
        class="translate-btn"
        @click="$emit('translate')"
        title="Translate this note"
      >
        <Languages :size="14" />
        <span>Translate</span>
      </button>

      <button
        class="trash-btn"
        @click="$emit('trash')"
        title="Move to trash"
      >
        <Trash2 :size="16" />
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

.idea-btn {
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
.idea-btn:hover {
  border-color: var(--accent-warn);
  color: var(--accent-warn);
}
.promote-btn:hover { color: var(--accent-warn); }

.reset-btn {
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
.reset-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.table-btn {
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
.table-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.translate-btn {
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
.translate-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.trash-btn {
  display: flex;
  align-items: center;
  padding: 5px;
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.1s;
}
.trash-btn:hover {
  border-color: #ff6b6b;
  color: #ff6b6b;
}

.panel-toggle {
  display: flex;
  align-items: center;
  padding: 5px 8px;
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.1s;
}
.panel-toggle:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}
.panel-toggle.active {
  background-color: rgba(58, 134, 255, 0.12);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}
</style>
