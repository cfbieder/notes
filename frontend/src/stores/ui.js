import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUIStore = defineStore('ui', () => {
  const sidebarCollapsed = ref(false);
  const editorMode = ref('normal'); // 'normal' | 'source'
  const saveStatus = ref('saved'); // 'saved' | 'saving' | 'unsaved'

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

  return {
    sidebarCollapsed, editorMode, saveStatus,
    toggleSidebar, toggleEditorMode, setEditorMode, setSaveStatus
  };
});
