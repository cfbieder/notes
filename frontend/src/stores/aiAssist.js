import { defineStore } from 'pinia';
import { ref } from 'vue';
import { aiAssistApi } from '../api/aiAssist.js';

const LS_LAST_PROMPT = 'noted.aiAssist.lastPrompt';
const LS_HISTORY = 'noted.aiAssist.history';
const LS_MODE = 'noted.aiAssist.mode';
const LS_CONDENSE = 'noted.aiAssist.condense';
const HISTORY_MAX = 20;
const LS_SEEN_JOBS = 'noted.aiAssist.seenJobs';
const SEEN_JOBS_MAX = 200;

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
  // 'quick' (default) or 'deep'
  const mode = ref(localStorage.getItem(LS_MODE) === 'deep' ? 'deep' : 'quick');
  const condense = ref(localStorage.getItem(LS_CONDENSE) === '1');

  // Active editor registration. NotesView calls registerEditor() with the
  // CodeMirrorEditor's exposed methods on mount, unregisterEditor() on
  // unmount. The modal reads `editor.value` to decide whether to show
  // "Insert at cursor" and to perform the insert.
  const editor = ref(null);

  // Pending deep-think jobs — refreshed by the reminders polling loop.
  // status in ('pending','running')
  const pendingJobs = ref([]);
  // Recently completed/failed jobs we've already shown a toast for. Persisted
  // in localStorage so dismissed toasts don't re-fire on reload or in a new
  // browser session. Capped to avoid unbounded growth.
  const seenJobIds = new Set(
    JSON.parse(localStorage.getItem(LS_SEEN_JOBS) || '[]')
  );
  function persistSeen() {
    try {
      const arr = [...seenJobIds];
      const trimmed = arr.length > SEEN_JOBS_MAX ? arr.slice(-SEEN_JOBS_MAX) : arr;
      localStorage.setItem(LS_SEEN_JOBS, JSON.stringify(trimmed));
    } catch {}
  }

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
    const filtered = history.value.filter(h => h.text !== text);
    filtered.unshift({ text, at: Date.now() });
    history.value = filtered.slice(0, HISTORY_MAX);
    saveJSON(LS_HISTORY, history.value);
  }

  function clearHistory() {
    history.value = [];
    saveJSON(LS_HISTORY, []);
  }

  function setMode(val) {
    mode.value = val === 'deep' ? 'deep' : 'quick';
    try { localStorage.setItem(LS_MODE, mode.value); } catch {}
  }

  function setCondense(val) {
    condense.value = !!val;
    try { localStorage.setItem(LS_CONDENSE, val ? '1' : '0'); } catch {}
  }

  function registerEditor(handle) { editor.value = handle; }
  function unregisterEditor(handle) {
    if (!handle || editor.value === handle) editor.value = null;
  }

  // Refresh pending + recently terminated jobs and fire toasts for any newly
  // completed / failed ones. Called by the reminders polling loop.
  async function pollJobs() {
    try {
      const res = await aiAssistApi.listJobs();
      const all = res.data || [];
      pendingJobs.value = all.filter(j => j.status === 'pending' || j.status === 'running');

      const terminal = all.filter(j => j.status === 'completed' || j.status === 'failed');
      const newToShow = [];
      for (const j of terminal) {
        if (seenJobIds.has(j.id)) continue;
        seenJobIds.add(j.id);
        newToShow.push(j);
      }
      if (newToShow.length > 0) {
        persistSeen();
        const { useToastsStore } = await import('./toasts.js');
        const toastsStore = useToastsStore();
        for (const j of newToShow) {
          if (j.status === 'completed' && j.resultNoteId) {
            const noteId = j.resultNoteId;
            const titleHint = (j.prompt || '').trim().split('\n')[0].slice(0, 60);
            toastsStore.addToast({
              message: `Deep-think note ready: "${titleHint}"`,
              type: 'success',
              duration: 0,
              actionLabel: 'View',
              action: () => {
                import('../router/index.js').then(m => m.default.push(`/notes/${noteId}`));
              }
            });
          } else if (j.status === 'failed') {
            toastsStore.addToast({
              message: `Deep-think failed: ${j.errorMessage || 'unknown error'}`,
              type: 'error',
              duration: 8000
            });
          }
        }
      }
    } catch {
      // network errors are silenced — same pattern as reminders polling
    }
  }

  function startJobsPolling(intervalMs = 60000) {
    stopJobsPolling();
    // Initial fetch so the pill appears without waiting a full minute.
    pollJobs();
    pollJobs._timer = setInterval(pollJobs, intervalMs);
  }
  function stopJobsPolling() {
    if (pollJobs._timer) {
      clearInterval(pollJobs._timer);
      pollJobs._timer = null;
    }
  }

  // Cancel a pending/running job optimistically — the next poll will reconcile.
  async function cancelJob(jobId) {
    try {
      await aiAssistApi.cancelJob(jobId);
      pendingJobs.value = pendingJobs.value.filter(j => j.id !== jobId);
    } catch {
      // ignore — poll will reflect actual state
    }
  }

  return {
    isOpen, lastPrompt, history, mode, condense, editor, pendingJobs,
    open, close, toggle,
    setLastPrompt, addToHistory, clearHistory,
    setMode, setCondense,
    registerEditor, unregisterEditor,
    pollJobs, startJobsPolling, stopJobsPolling, cancelJob
  };
});
