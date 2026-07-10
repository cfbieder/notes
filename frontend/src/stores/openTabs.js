import { defineStore } from 'pinia';
import { ref } from 'vue';

// Persisted set of notes/ideas the user has open in the desktop editor tab
// strip. This is a thin UI layer over a list of note ids — the *active* tab is
// always derived from the current route (`/notes/:id`), never stored here.
const LS_TABS = 'noted:open-tabs';

function load() {
  try {
    const raw = localStorage.getItem(LS_TABS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Only keep well-formed entries — guards against schema drift / tampering.
    return parsed
      .filter(t => t && typeof t.id === 'string')
      .map(t => ({
        id: t.id,
        title: typeof t.title === 'string' ? t.title : '',
        routeName: t.routeName === 'IdeaDetail' ? 'IdeaDetail' : 'NoteDetail'
      }));
  } catch {
    return [];
  }
}

export const useOpenTabsStore = defineStore('openTabs', () => {
  const tabs = ref(load());

  function persist() {
    try { localStorage.setItem(LS_TABS, JSON.stringify(tabs.value)); } catch {}
  }

  // Add the note as a tab if not already open; otherwise refresh its label.
  // Appends at the end — opening an already-open note does not reorder.
  function ensureOpen({ id, title, routeName }) {
    if (!id) return;
    const existing = tabs.value.find(t => t.id === id);
    const name = routeName === 'IdeaDetail' ? 'IdeaDetail' : 'NoteDetail';
    if (existing) {
      if (title != null && title !== existing.title) {
        existing.title = title;
        persist();
      }
      return;
    }
    tabs.value.push({ id, title: title || '', routeName: name });
    persist();
  }

  function updateTitle(id, title) {
    const tab = tabs.value.find(t => t.id === id);
    if (tab && title != null && tab.title !== title) {
      tab.title = title;
      persist();
    }
  }

  // Remove a tab. Returns the neighbouring tab (or null) so the caller can
  // decide where to navigate when the closed tab was the active one.
  function close(id) {
    const idx = tabs.value.findIndex(t => t.id === id);
    if (idx === -1) return null;
    tabs.value.splice(idx, 1);
    persist();
    // Prefer the tab that took the closed one's slot, else the previous one.
    return tabs.value[idx] || tabs.value[idx - 1] || null;
  }

  // Drop a tab whose note no longer loads (deleted / trashed / 404). Same as
  // close() but named for intent; callers don't need the neighbour here.
  function pruneMissing(id) {
    const idx = tabs.value.findIndex(t => t.id === id);
    if (idx === -1) return;
    tabs.value.splice(idx, 1);
    persist();
  }

  return { tabs, ensureOpen, updateTitle, close, pruneMissing };
});
