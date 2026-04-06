<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useTasksStore } from '../stores/tasks.js';
import { useNotesStore } from '../stores/notes.js';
import AppSidebar from '../components/sidebar/AppSidebar.vue';
import { CheckSquare, Square, Calendar, FileText, Trash2, Plus } from 'lucide-vue-next';

const router = useRouter();
const tasksStore = useTasksStore();
const notesStore = useNotesStore();

const filter = ref('all'); // 'all' | 'open' | 'done'
const newTaskContent = ref('');
const newTaskDue = ref('');
const newTaskNoteId = ref('');

onMounted(async () => {
  await tasksStore.fetchTasks();
  // Load notes for the "link to note" dropdown
  if (notesStore.notes.length === 0) {
    notesStore.clearFilters();
    await notesStore.fetchNotes();
  }
});

const filteredTasks = computed(() => {
  if (filter.value === 'open') return tasksStore.tasks.filter(t => !t.is_done);
  if (filter.value === 'done') return tasksStore.tasks.filter(t => t.is_done);
  return tasksStore.tasks;
});

async function toggle(task) {
  await tasksStore.toggleTask(task.id);
}

async function removeTask(id) {
  try {
    await tasksStore.deleteTask(id);
  } catch (err) {
    console.error('Failed to delete task:', err);
  }
}

async function addTask() {
  const content = newTaskContent.value.trim();
  if (!content) return;
  const data = { content };
  if (newTaskDue.value) data.due_date = newTaskDue.value;
  if (newTaskNoteId.value) data.note_id = newTaskNoteId.value;
  try {
    await tasksStore.createTask(data);
    newTaskContent.value = '';
    newTaskDue.value = '';
    newTaskNoteId.value = '';
    await tasksStore.fetchTasks();
  } catch (err) {
    console.error('Failed to create task:', err);
  }
}

function goToNote(noteId) {
  if (noteId) router.push(`/notes/${noteId}`);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date(new Date().toDateString());
}
</script>

<template>
  <div class="tasks-layout">
    <AppSidebar />
    <main class="tasks-main">
      <div class="tasks-header">
        <h2>Tasks</h2>
        <div class="filter-tabs">
          <button type="button" :class="{ active: filter === 'all' }" @click="filter = 'all'">All</button>
          <button type="button" :class="{ active: filter === 'open' }" @click="filter = 'open'">Open</button>
          <button type="button" :class="{ active: filter === 'done' }" @click="filter = 'done'">Done</button>
        </div>
      </div>

      <!-- Add task -->
      <div class="add-task-form">
        <Plus :size="16" class="add-icon" />
        <input
          v-model="newTaskContent"
          class="add-task-input"
          placeholder="Add a task..."
          @keydown.enter="addTask"
        />
        <select v-model="newTaskNoteId" class="add-task-select">
          <option value="">No linked note</option>
          <option v-for="note in notesStore.notes" :key="note.id" :value="note.id">
            {{ note.title }}
          </option>
        </select>
        <input
          v-model="newTaskDue"
          type="date"
          class="add-task-date"
        />
        <button type="button" class="add-task-btn" @click="addTask" :disabled="!newTaskContent">Add</button>
      </div>

      <div v-if="tasksStore.loading" class="loading">Loading...</div>

      <div v-else-if="filteredTasks.length === 0" class="empty">
        <CheckSquare :size="32" />
        <p>{{ filter === 'done' ? 'No completed tasks' : filter === 'open' ? 'All done!' : 'No tasks yet' }}</p>
      </div>

      <div v-else class="task-list">
        <div
          v-for="task in filteredTasks"
          :key="task.id"
          class="task-item"
          :class="{ done: task.is_done }"
        >
          <button class="task-check" @click="toggle(task)">
            <CheckSquare v-if="task.is_done" :size="18" />
            <Square v-else :size="18" />
          </button>
          <div class="task-content">
            <span class="task-text">{{ task.content }}</span>
            <div class="task-meta">
              <span
                v-if="task.due_date"
                class="task-due"
                :class="{ overdue: isOverdue(task.due_date) && !task.is_done }"
              >
                <Calendar :size="11" />
                {{ formatDate(task.due_date) }}
              </span>
              <button
                v-if="task.note_title"
                class="task-note-link"
                @click="goToNote(task.note_id)"
              >
                <FileText :size="11" />
                {{ task.note_title }}
              </button>
            </div>
          </div>
          <button class="task-delete" @click="removeTask(task.id)" title="Delete">
            <Trash2 :size="14" />
          </button>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.tasks-layout {
  display: flex;
  height: 100vh;
}

.tasks-main {
  flex: 1;
  padding: 24px 32px;
  overflow-y: auto;
}

.tasks-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.tasks-header h2 {
  margin: 0;
}

.filter-tabs {
  display: flex;
  gap: 4px;
}

.filter-tabs button {
  padding: 5px 14px;
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  cursor: pointer;
}
.filter-tabs button:hover { border-color: var(--accent-primary); }
.filter-tabs button.active {
  background: rgba(58, 134, 255, 0.12);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.add-task-form {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  margin-bottom: 16px;
}

.add-icon { color: var(--text-muted); }

.add-task-input {
  flex: 1;
  background: none;
  border: none;
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  outline: none;
}
.add-task-input::placeholder { color: var(--text-muted); }

.add-task-select {
  background: var(--bg-main);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  padding: 4px 8px;
  max-width: 160px;
}

.add-task-date {
  background: var(--bg-main);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  padding: 4px 8px;
}

.add-task-btn {
  padding: 5px 14px;
  background: var(--accent-primary);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.add-task-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.loading, .empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  color: var(--text-muted);
  gap: 8px;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.task-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 6px;
  transition: background 0.1s;
}
.task-item:hover { background: rgba(255, 255, 255, 0.03); }
.task-item.done { opacity: 0.5; }

.task-check {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  margin-top: 1px;
}
.task-item.done .task-check { color: var(--accent-success); }

.task-content {
  flex: 1;
  min-width: 0;
}

.task-text {
  font-size: 13px;
  color: var(--text-primary);
}
.task-item.done .task-text {
  text-decoration: line-through;
  color: var(--text-muted);
}

.task-meta {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}

.task-due {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-muted);
}
.task-due.overdue { color: #ff6b6b; }

.task-note-link {
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: var(--accent-primary);
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}
.task-note-link:hover { text-decoration: underline; }

.task-delete {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  opacity: 0.4;
  transition: opacity 0.1s;
}
.task-item:hover .task-delete { opacity: 1; }
.task-delete:hover { color: #ff6b6b; }
</style>
