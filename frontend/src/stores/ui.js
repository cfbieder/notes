import { defineStore } from 'pinia';
import { ref } from 'vue';

const LS_NOTE_LIST = 'noted.ui.noteListCollapsed';
const LS_CONTEXT = 'noted.ui.contextPanelsCollapsed';
const LS_THEME = 'noted.ui.theme';
const LS_RAIL_PANEL = 'noted.ui.railPanelCollapsed';

export const THEMES = ['sapphire', 'dark', 'light'];
export const DEFAULT_THEME = 'sapphire';

function loadBool(key) {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
}
function saveBool(key, val) {
  try { localStorage.setItem(key, val ? '1' : '0'); } catch {}
}

export function loadTheme() {
  try {
    const v = localStorage.getItem(LS_THEME);
    return THEMES.includes(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(theme) {
  const t = THEMES.includes(theme) ? theme : DEFAULT_THEME;
  document.documentElement.setAttribute('data-theme', t);
}

export const useUIStore = defineStore('ui', () => {
  const sidebarCollapsed = ref(false);
  const editorMode = ref('normal'); // 'normal' | 'source'
  const saveStatus = ref('saved'); // 'saved' | 'saving' | 'unsaved'

  const noteListCollapsed = ref(loadBool(LS_NOTE_LIST));
  const contextPanelsCollapsed = ref(loadBool(LS_CONTEXT));
  const railPanelCollapsed = ref(loadBool(LS_RAIL_PANEL));
  const showHelp = ref(false);

  const theme = ref(loadTheme());

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

  function toggleRailPanel() {
    railPanelCollapsed.value = !railPanelCollapsed.value;
    saveBool(LS_RAIL_PANEL, railPanelCollapsed.value);
  }

  function setTheme(next) {
    const t = THEMES.includes(next) ? next : DEFAULT_THEME;
    theme.value = t;
    applyTheme(t);
    try { localStorage.setItem(LS_THEME, t); } catch {}
    window.dispatchEvent(new CustomEvent('noted:theme-change', { detail: { theme: t } }));
  }

  return {
    sidebarCollapsed, editorMode, saveStatus,
    noteListCollapsed, contextPanelsCollapsed, railPanelCollapsed, showHelp,
    theme,
    toggleSidebar, toggleEditorMode, setEditorMode, setSaveStatus,
    toggleNoteList, toggleContextPanels, toggleRailPanel,
    toggleFocusMode, toggleHelp,
    setTheme
  };
});
