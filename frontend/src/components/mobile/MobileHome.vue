<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useNotesStore } from '../../stores/notes.js';
import { useTasksStore } from '../../stores/tasks.js';
import { useRemindersStore } from '../../stores/reminders.js';
import { Plus, CheckSquare, Inbox, Search, ChevronDown, ChevronRight, Menu } from 'lucide-vue-next';

const emit = defineEmits(['open-sidebar', 'open-capture']);
const router = useRouter();
const notesStore = useNotesStore();
const tasksStore = useTasksStore();
const remindersStore = useRemindersStore();

const recentExpanded = ref(false);
const recentNotes = ref([]);

onMounted(async () => {
  await Promise.all([
    tasksStore.fetchTasks({ is_done: 'false' }),
    loadRecentNotes()
  ]);
});

async function loadRecentNotes() {
  // Fetch top 5 most recent notes
  notesStore.clearFilters();
  await notesStore.fetchNotes();
  recentNotes.value = notesStore.notes.slice(0, 5);
}

function openCapture() {
  emit('open-capture');
}

function goToTasks() {
  router.push('/tasks');
}

function goToInbox() {
  router.push('/inbox');
}

function goToSearch() {
  router.push('/search');
}

function openNote(note) {
  router.push(`/notes/${note.id}`);
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

const openTaskCount = ref(0);
const inboxCount = ref(0);

onMounted(async () => {
  try {
    const tasksRes = await tasksStore.fetchTasks({ is_done: 'false' });
    openTaskCount.value = tasksStore.tasks.filter(t => !t.is_done).length;
  } catch { /* ignore */ }
  try {
    notesStore.clearFilters();
    notesStore.setFilter('is_inbox', 'true');
    await notesStore.fetchNotes();
    inboxCount.value = notesStore.meta.total;
    notesStore.clearFilters();
    await notesStore.fetchNotes();
    recentNotes.value = notesStore.notes.slice(0, 5);
  } catch { /* ignore */ }
});
</script>

<template>
  <div class="mobile-home">
    <header class="mobile-header">
      <h1 class="app-title">Noted</h1>
      <button class="menu-btn" @click="$emit('open-sidebar')">
        <Menu :size="22" />
      </button>
    </header>

    <div class="action-cards">
      <!-- Hero: Quick Note -->
      <button class="card hero-card" @click="openCapture">
        <Plus :size="28" />
        <span class="card-label">Quick Note</span>
      </button>

      <!-- Secondary cards -->
      <div class="card-grid">
        <button class="card small-card" @click="goToTasks">
          <CheckSquare :size="22" />
          <span class="card-label">Tasks</span>
          <span v-if="openTaskCount > 0" class="card-badge">{{ openTaskCount }}</span>
        </button>
        <button class="card small-card" @click="goToInbox">
          <Inbox :size="22" />
          <span class="card-label">Inbox</span>
          <span v-if="inboxCount > 0" class="card-badge">{{ inboxCount }}</span>
        </button>
        <button class="card small-card" @click="goToSearch">
          <Search :size="22" />
          <span class="card-label">Search</span>
        </button>
        <!-- 4th slot reserved for Reminders -->
      </div>
    </div>

    <!-- Collapsible recent notes -->
    <div class="recent-section">
      <button class="recent-header" @click="recentExpanded = !recentExpanded">
        <ChevronDown v-if="recentExpanded" :size="14" />
        <ChevronRight v-else :size="14" />
        <span>Recent ({{ recentNotes.length }})</span>
      </button>

      <div v-if="recentExpanded" class="recent-list">
        <button
          v-for="note in recentNotes"
          :key="note.id"
          class="recent-item"
          @click="openNote(note)"
        >
          <span class="recent-title">{{ note.title }}</span>
          <span class="recent-time">{{ formatDate(note.updated_at) }}</span>
        </button>

        <div v-if="recentNotes.length === 0" class="recent-empty">
          No recent notes
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mobile-home {
  min-height: 100vh;
  background: var(--bg-main);
  padding: 16px;
  box-sizing: border-box;
}

.mobile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0 24px;
}

.app-title {
  font-size: 24px;
  margin: 0;
}

.menu-btn {
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  color: var(--text-secondary);
  padding: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.action-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s;
  font-family: 'Inter', sans-serif;
  color: var(--text-primary);
  position: relative;
}
.card:hover { border-color: var(--accent-primary); }
.card:active { transform: scale(0.98); }

.hero-card {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 28px 20px;
  background: linear-gradient(135deg, var(--accent-warn), #e8880f);
  color: #1a1a1a;
  border: none;
  font-weight: 700;
  font-size: 18px;
}
.hero-card .card-label { font-size: 18px; }

.card-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.small-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 16px;
}

.card-label {
  font-size: 14px;
  font-weight: 600;
}

.card-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: var(--accent-primary);
  color: white;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 12px;
  min-width: 20px;
  text-align: center;
}

.recent-section {
  margin-top: 8px;
}

.recent-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 4px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}
.recent-header:hover { color: var(--text-secondary); }

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.recent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  cursor: pointer;
  font-family: 'Inter', sans-serif;
  transition: background-color 0.1s;
  color: var(--text-primary);
}
.recent-item:hover { background: rgba(255, 255, 255, 0.06); }

.recent-title {
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.recent-time {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
  margin-left: 12px;
}

.recent-empty {
  padding: 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}
</style>
