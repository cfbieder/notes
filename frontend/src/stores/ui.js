import { defineStore } from 'pinia';
import { ref } from 'vue';

const LS_NOTE_LIST = 'noted.ui.noteListCollapsed';
const LS_CONTEXT = 'noted.ui.contextPanelsCollapsed';

function loadBool(key) {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
}
function saveBool(key, val) {
  try { localStorage.setItem(key, val ? '1' : '0'); } catch {}
}

export const useUIStore = defineStore('ui', () => {
  const sidebarCollapsed = ref(false);
  const editorMode = ref('normal'); // 'normal' | 'source'
  const saveStatus = ref('saved'); // 'saved' | 'saving' | 'unsaved'

  const noteListCollapsed = ref(loadBool(LS_NOTE_LIST));
  const contextPanelsCollapsed = ref(loadBool(LS_CONTEXT));
  const showHelp = ref(false);

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }

  function toggleEditorMode() {
    editorMode.value = editorMode.value === 'normal' ? 'source' : 'normal';
  }

  function setEditorMode(mode) {
    editorMode.value = mode;
  }

  function setSaveStatus(status) {
    saveStatus.value = status;
  }

  function toggleNoteList() {
    noteListCollapsed.value = !noteListCollapsed.value;
    saveBool(LS_NOTE_LIST, noteListCollapsed.value);
  }

  function toggleContextPanels() {
    contextPanelsCollapsed.value = !contextPanelsCollapsed.value;
    saveBool(LS_CONTEXT, contextPanelsCollapsed.value);
  }

  function toggleFocusMode() {
    // If either is expanded, collapse both. Otherwise, expand both.
    const anyExpanded = !noteListCollapsed.value || !contextPanelsCollapsed.value;
    noteListCollapsed.value = anyExpanded;
    contextPanelsCollapsed.value = anyExpanded;
    saveBool(LS_NOTE_LIST, noteListCollapsed.value);
    saveBool(LS_CONTEXT, contextPanelsCollapsed.value);
  }

  function toggleHelp() {
    showHelp.value = !showHelp.value;
  }

  return {
    sidebarCollapsed, editorMode, saveStatus,
    noteListCollapsed, contextPanelsCollapsed, showHelp,
    toggleSidebar, toggleEditorMode, setEditorMode, setSaveStatus,
    toggleNoteList, toggleContextPanels, toggleFocusMode, toggleHelp
  };
});
