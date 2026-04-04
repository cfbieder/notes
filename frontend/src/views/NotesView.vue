<script setup>
</script>

<template>
  <div class="notes-layout">
    <aside class="sidebar">
      <div class="sidebar-header">
        <h2>Noted</h2>
        <span class="version">v{{ version }}</span>
      </div>
      <p class="placeholder">Sidebar — notebooks, tags</p>
    </aside>
    <section class="note-list">
      <p class="placeholder">Note list</p>
    </section>
    <main class="editor">
      <p class="placeholder">Editor</p>
    </main>
  </div>
</template>

<script>
export default {
  computed: {
    version() {
      return import.meta.env.VITE_APP_VERSION || 'dev';
    }
  }
};
</script>

<style scoped>
.notes-layout {
  display: flex;
  height: 100vh;
}

.sidebar {
  width: 260px;
  min-width: 260px;
  background-color: var(--bg-sidebar);
  padding: 24px 16px;
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 24px;
}

.sidebar-header h2 {
  margin: 0;
  font-size: 20px;
}

.version {
  font-size: 11px;
  color: var(--text-muted);
}

.note-list {
  width: 280px;
  min-width: 280px;
  background-color: var(--bg-main);
  border-right: 1px solid var(--border-subtle);
  padding: 16px;
}

.editor {
  flex: 1;
  background-color: var(--bg-main);
  padding: 24px;
}

.placeholder {
  color: var(--text-muted);
  font-size: 14px;
}
</style>
