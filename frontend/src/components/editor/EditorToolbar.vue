<script setup>
import { useUIStore } from '../../stores/ui.js';
import { computed } from 'vue';
import { Code, Eye, Save, Trash2, RotateCcw, ArrowRight, Languages, Table, PanelLeft, PanelBottom, Printer, RefreshCw, Download, CheckSquare, CloudOff, CloudDownload } from 'lucide-vue-next';
import NoteTags from './NoteTags.vue';
import NoteNotebooks from './NoteNotebooks.vue';
import ReminderPicker from '../ui/ReminderPicker.vue';

const uiStore = useUIStore();

const props = defineProps({
  noteTitle: { type: String, default: '' },
  noteContent: { type: String, default: '' },
  noteType: { type: String, default: 'note' },
  reminderAt: { type: [String, null], default: null },
  driveImported: { type: Boolean, default: false },
  autoUpdate: { type: Boolean, default: false },
  checkedOut: { type: Boolean, default: false },
  dirtyOffline: { type: Boolean, default: false }
});

const emit = defineEmits(['update:noteTitle', 'trash', 'reset-checkboxes', 'promote', 'merge', 'convert-to-task', 'translate', 'insert-table', 'set-reminder', 'print', 'toggle-auto-update', 'download', 'checkout', 'check-in', 'discard-offline', 'refresh-offline']);

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
        class="idea-btn"
        @click="$emit('convert-to-task')"
        title="Convert this idea into a standalone task"
      >
        <CheckSquare :size="14" />
        <span>Move to task</span>
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

      <ReminderPicker
        :modelValue="reminderAt"
        @update:modelValue="$emit('set-reminder', $event)"
      />

      <button
        class="translate-btn"
        @click="$emit('translate')"
        title="Translate this note"
      >
        <Languages :size="14" />
        <span>Translate</span>
      </button>

      <button
        class="print-btn"
        @click="$emit('print')"
        title="Print or save as PDF"
      >
        <Printer :size="14" />
        <span>Print</span>
      </button>

      <!-- CR027 — offline checkout controls -->
      <button
        v-if="!checkedOut"
        class="offline-btn"
        @click="$emit('checkout')"
        title="Make this note available offline (CR027)"
      >
        <CloudDownload :size="14" />
        <span>Offline</span>
      </button>
      <template v-else>
        <button
          v-if="dirtyOffline"
          class="offline-btn dirty"
          @click="$emit('check-in')"
          title="Check in offline edits to the server"
        >
          <CloudOff :size="14" />
          <span>Check in</span>
        </button>
        <button
          v-else
          class="offline-btn"
          @click="$emit('refresh-offline')"
          title="Refresh the offline copy from the server"
        >
          <RefreshCw :size="14" />
          <span>Refresh offline</span>
        </button>
        <button
          class="offline-btn ghost"
          @click="$emit('discard-offline')"
          title="Discard the offline copy"
        >
          <Trash2 :size="14" />
        </button>
      </template>

      <button
        class="download-btn"
        @click="$emit('download')"
        title="Download as .md file"
      >
        <Download :size="14" />
        <span>Download</span>
      </button>

      <button
        v-if="driveImported"
        class="auto-update-btn"
        :class="{ active: autoUpdate }"
        @click="$emit('toggle-auto-update')"
        :title="autoUpdate ? 'Auto-update enabled — Drive changes will overwrite this note' : 'Enable auto-update from Google Drive'"
      >
        <RefreshCw :size="14" />
        <span>Auto Update</span>
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
  flex-wrap: wrap;
  padding: 12px 24px;
  border-bottom: 1px solid var(--border-subtle);
  gap: 8px 16px;
}

.title-input {
  flex: 1 1 200px;
  min-width: 160px;
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
  flex-wrap: wrap;
  gap: 6px;
}

/* Collapse button text labels on narrow viewports */
@media (max-width: 1200px) {
  .mode-toggle span,
  .idea-btn span,
  .reset-btn span,
  .table-btn span,
  .translate-btn span,
  .print-btn span,
  .download-btn span,
  .auto-update-btn span,
  .offline-btn span {
    display: none;
  }
  .mode-toggle,
  .idea-btn,
  .reset-btn,
  .table-btn,
  .translate-btn,
  .print-btn,
  .download-btn,
  .auto-update-btn,
  .offline-btn {
    gap: 0;
    padding: 5px 8px;
  }
}

.offline-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}
.offline-btn:hover { background: var(--bg-hover); }
.offline-btn.dirty {
  background: var(--accent-warn-bg, rgba(255, 184, 0, 0.15));
  border-color: var(--accent-warn, #ffb800);
}
.offline-btn.ghost {
  background: none;
  border-color: transparent;
  color: var(--text-secondary);
}

.save-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}
.save-indicator.saving { color: var(--accent-warn); }
.save-indicator.unsaved { color: var(--accent-warn); }
.save-indicator.saved { color: var(--accent-success); }

@media (max-width: 1200px) {
  .save-indicator span { display: none; }
}

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

.print-btn {
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
.print-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.download-btn {
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
.download-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.auto-update-btn {
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
.auto-update-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}
.auto-update-btn.active {
  background-color: rgba(58, 134, 255, 0.12);
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
  border-color: var(--status-error);
  color: var(--status-error);
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
