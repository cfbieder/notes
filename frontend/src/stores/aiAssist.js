import { defineStore } from 'pinia';
import { ref } from 'vue';

const LS_LAST_PROMPT = 'noted.aiAssist.lastPrompt';
const LS_HISTORY = 'noted.aiAssist.history';
const LS_MODEL = 'noted.aiAssist.model';
const LS_CONDENSE = 'noted.aiAssist.condense';
const HISTORY_MAX = 20;

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

export const useAIAssistStore = defineStore('aiAssist', () => {
  const isOpen = ref(false);
  const lastPrompt = ref(localStorage.getItem(LS_LAST_PROMPT) || '');
  const history = ref(loadJSON(LS_HISTORY, []));
  const selectedModel = ref(localStorage.getItem(LS_MODEL) || '');
  const condense = ref(localStorage.getItem(LS_CONDENSE) === '1');

  // Active editor registration. NotesView calls registerEditor() with the
  // CodeMirrorEditor's exposed methods on mount, unregisterEditor() on
  // unmount. The modal reads `editor.value` to decide whether to show
  // "Insert at cursor" and to perform the insert.
  const editor = ref(null);

  function open() { isOpen.value = true; }
  function close() { isOpen.value = false; }
  function toggle() { isOpen.value = !isOpen.value; }

  function setLastPrompt(text) {
    lastPrompt.value = text;
    try { localStorage.setItem(LS_LAST_PROMPT, text || ''); } catch {}
  }

  function addToHistory(prompt) {
    const text = (prompt || '').trim();
    if (!text) return;
    // Dedupe: remove prior identical entries, push to front.
    const filtered = history.value.filter(h => h.text !== text);
    filtered.unshift({ text, at: Date.now() });
    history.value = filtered.slice(0, HISTORY_MAX);
    saveJSON(LS_HISTORY, history.value);
  }

  function clearHistory() {
    history.value = [];
    saveJSON(LS_HISTORY, []);
  }

  function setSelectedModel(model) {
    selectedModel.value = model || '';
    try { localStorage.setItem(LS_MODEL, model || ''); } catch {}
  }

  function setCondense(val) {
    condense.value = !!val;
    try { localStorage.setItem(LS_CONDENSE, val ? '1' : '0'); } catch {}
  }

  function registerEditor(handle) { editor.value = handle; }
  function unregisterEditor(handle) {
    if (!handle || editor.value === handle) editor.value = null;
  }

  return {
    isOpen, lastPrompt, history, selectedModel, condense, editor,
    open, close, toggle,
    setLastPrompt, addToHistory, clearHistory,
    setSelectedModel, setCondense,
    registerEditor, unregisterEditor
  };
});
