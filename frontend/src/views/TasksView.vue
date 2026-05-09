<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useTasksStore } from '../stores/tasks.js';
import { useNotesStore } from '../stores/notes.js';
import AppSidebar from '../components/sidebar/AppSidebar.vue';
import MobileLayout from '../components/mobile/MobileLayout.vue';
import { CheckSquare, Square, Calendar, FileText, Trash2, Plus, Bell, Pencil, Check, X } from 'lucide-vue-next';
import ReminderPicker from '../components/ui/ReminderPicker.vue';

import { useMobile } from '../composables/useMobile.js';
const { isMobile } = useMobile();

const router = useRouter();
const tasksStore = useTasksStore();
const notesStore = useNotesStore();

const filter = ref('open'); // 'all' | 'open' | 'done'
const newTaskContent = ref('');
const newTaskDue = ref('');
const newTaskNoteId = ref('');
const newTaskReminder = ref(null);

const editingTaskId = ref(null);
const editDraft = ref({ content: '', due_date: '', note_id: '' });

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
  if (newTaskReminder.value) data.reminder_at = newTaskReminder.value;
  try {
    await tasksStore.createTask(data);
    newTaskContent.value = '';
    newTaskDue.value = '';
    newTaskNoteId.value = '';
    newTaskReminder.value = null;
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

async function updateTaskReminder(task, value) {
  await tasksStore.updateTask(task.id, { reminder_at: value });
}

function startEdit(task) {
  editingTaskId.value = task.id;
  editDraft.value = {
    content: task.content,
    due_date: task.due_date ? task.due_date.slice(0, 10) : '',
    note_id: task.note_id || ''
  };
}

function cancelEdit() {
  editingTaskId.value = null;
  editDraft.value = { content: '', due_date: '', note_id: '' };
}

async function saveEdit(task) {
  const content = editDraft.value.content.trim();
  if (!content) return;
  const payload = {
    content,
    due_date: editDraft.value.due_date || null,
    note_id: editDraft.value.note_id || null
  };
  try {
    await tasksStore.updateTask(task.id, payload);
    cancelEdit();
  } catch (err) {
    console.error('Failed to update task:', err);
  }
}

function formatReminderTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = d - now;
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);

  if (diffMs < 0) {
    const absMins = Math.abs(diffMins);
    if (absMins < 60) return `${absMins}m overdue`;
    const absHours = Math.abs(diffHours);
    if (absHours < 24) return `${absHours}h overdue`;
    return `${Math.abs(diffDays)}d overdue`;
  }

  if (diffMins < 60) return `in ${diffMins}m`;
  if (diffHours < 24) return `in ${diffHours}h`;
  if (diffDays < 7) return `in ${diffDays}d`;
  return d.toLocaleDateString();
}
</script>

<template>
  <!-- Mobile layout -->
  <MobileLayout v-if="isMobile" title="Tasks">
    <div class="tasks-main mobile-tasks">
      <div class="tasks-header">
        <div class="filter-tabs">
          <button type="button" :class="{ active: filter === 'all' }" @click="filter = 'all'">All</button>
          <button type="button" :class="{ active: filter === 'open' }" @click="filter = 'open'">Open</button>
          <button type="button" :class="{ active: filter === 'done' }" @click="filter = 'done'">Done</button>
        </div>
      </div>

      <div class="add-task-form">
        <Plus :size="16" class="add-icon" />
        <input v-model="newTaskContent" class="add-task-input" placeholder="Add a task..." @keydown.enter="addTask" />
        <input v-model="newTaskDue" type="date" class="add-task-date" />
        <ReminderPicker
          :modelValue="newTaskReminder"
          :dueDate="newTaskDue"
          @update:modelValue="newTaskReminder = $event"
        />
        <button type="button" class="add-task-btn" @click="addTask" :disabled="!newTaskContent">Add</button>
      </div>

      <div v-if="tasksStore.loading" class="loading">Loading...</div>
      <div v-else-if="filteredTasks.length === 0" class="empty">
        <CheckSquare :size="32" />
        <p>{{ filter === 'done' ? 'No completed tasks' : filter === 'open' ? 'All done!' : 'No tasks yet' }}</p>
      </div>
      <div v-else class="task-list">
        <div v-for="task in filteredTasks" :key="task.id" class="task-item" :class="{ done: task.is_done, editing: editingTaskId === task.id }">
          <button class="task-check" @click="toggle(task)">
            <CheckSquare v-if="task.is_done" :size="18" />
            <Square v-else :size="18" />
          </button>

          <template v-if="editingTaskId !== task.id">
            <div class="task-content" @dblclick="startEdit(task)">
              <span class="task-text">{{ task.content }}</span>
              <div class="task-meta">
                <span v-if="task.due_date" class="task-due" :class="{ overdue: isOverdue(task.due_date) && !task.is_done }">
                  <Calendar :size="11" /> {{ formatDate(task.due_date) }}
                </span>
                <button v-if="task.note_title" class="task-note-link" @click.stop="goToNote(task.note_id)">
                  <FileText :size="11" /> {{ task.note_title }}
                </button>
                <span v-if="task.reminder_at" class="task-reminder" :class="{ overdue: new Date(task.reminder_at) < new Date() }">
                  <Bell :size="11" />
                  {{ formatReminderTime(task.reminder_at) }}
                </span>
              </div>
            </div>
            <ReminderPicker
              :modelValue="task.reminder_at"
              :dueDate="task.due_date"
              size="small"
              @update:modelValue="updateTaskReminder(task, $event)"
            />
            <button class="task-edit" @click="startEdit(task)" title="Edit">
              <Pencil :size="14" />
            </button>
            <button class="task-delete" @click="removeTask(task.id)" title="Delete">
              <Trash2 :size="14" />
            </button>
          </template>

          <template v-else>
            <div class="task-content edit-row">
              <input
                v-model="editDraft.content"
                class="edit-content-input"
                placeholder="Task..."
                @keydown.enter="saveEdit(task)"
                @keydown.esc="cancelEdit"
              />
              <div class="edit-meta">
                <select v-model="editDraft.note_id" class="edit-note-select">
                  <option value="">No linked note</option>
                  <option v-for="note in notesStore.notes" :key="note.id" :value="note.id">
                    {{ note.title }}
                  </option>
                </select>
                <input v-model="editDraft.due_date" type="date" class="edit-date-input" />
              </div>
            </div>
            <button class="task-save" @click="saveEdit(task)" title="Save">
              <Check :size="14" />
            </button>
            <button class="task-cancel" @click="cancelEdit" title="Cancel">
              <X :size="14" />
            </button>
          </template>
        </div>
      </div>
    </div>
  </MobileLayout>

  <!-- Desktop layout -->
  <div v-else class="tasks-layout">
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
        <ReminderPicker
          :modelValue="newTaskReminder"
          :dueDate="newTaskDue"
          @update:modelValue="newTaskReminder = $event"
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
          :class="{ done: task.is_done, editing: editingTaskId === task.id }"
        >
          <button class="task-check" @click="toggle(task)">
            <CheckSquare v-if="task.is_done" :size="18" />
            <Square v-else :size="18" />
          </button>

          <!-- View mode -->
          <template v-if="editingTaskId !== task.id">
            <div class="task-content" @dblclick="startEdit(task)" title="Double-click to edit">
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
                  @click.stop="goToNote(task.note_id)"
                >
                  <FileText :size="11" />
                  {{ task.note_title }}
                </button>
                <span v-if="task.reminder_at" class="task-reminder" :class="{ overdue: new Date(task.reminder_at) < new Date() }">
                  <Bell :size="11" />
                  {{ formatReminderTime(task.reminder_at) }}
                </span>
              </div>
            </div>
            <ReminderPicker
              :modelValue="task.reminder_at"
              :dueDate="task.due_date"
              size="small"
              @update:modelValue="updateTaskReminder(task, $event)"
            />
            <button class="task-edit" @click="startEdit(task)" title="Edit">
              <Pencil :size="14" />
            </button>
            <button class="task-delete" @click="removeTask(task.id)" title="Delete">
              <Trash2 :size="14" />
            </button>
          </template>

          <!-- Edit mode -->
          <template v-else>
            <div class="task-content edit-row">
              <input
                v-model="editDraft.content"
                class="edit-content-input"
                placeholder="Task..."
                @keydown.enter="saveEdit(task)"
                @keydown.esc="cancelEdit"
                ref="editContentInput"
                autofocus
              />
              <div class="edit-meta">
                <select v-model="editDraft.note_id" class="edit-note-select">
                  <option value="">No linked note</option>
                  <option v-for="note in notesStore.notes" :key="note.id" :value="note.id">
                    {{ note.title }}
                  </option>
                </select>
                <input v-model="editDraft.due_date" type="date" class="edit-date-input" />
              </div>
            </div>
            <button class="task-save" @click="saveEdit(task)" title="Save (Enter)">
              <Check :size="14" />
            </button>
            <button class="task-cancel" @click="cancelEdit" title="Cancel (Esc)">
              <X :size="14" />
            </button>
          </template>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.mobile-tasks {
  padding: 16px;
}
</style>

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
.task-item:hover { background: var(--hover-bg); }
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
.task-due.overdue { color: var(--status-error); }

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

.task-reminder {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--accent-warn);
}
.task-reminder.overdue { color: var(--status-error); }

.task-delete,
.task-edit {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  opacity: 0.4;
  transition: opacity 0.1s;
}
.task-item:hover .task-delete,
.task-item:hover .task-edit { opacity: 1; }
.task-edit:hover { color: var(--accent-primary); }
.task-delete:hover { color: var(--status-error); }

.task-item.editing { background: var(--hover-bg); }

.edit-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.edit-content-input {
  background: var(--bg-main);
  border: 1px solid var(--accent-primary);
  border-radius: 4px;
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  padding: 5px 8px;
  outline: none;
}

.edit-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.edit-note-select,
.edit-date-input {
  background: var(--bg-main);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  padding: 4px 8px;
}

.edit-note-select { max-width: 200px; }

.task-save,
.task-cancel {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
}
.task-save { color: var(--accent-success); }
.task-save:hover { color: var(--accent-primary); }
.task-cancel { color: var(--text-muted); }
.task-cancel:hover { color: var(--status-error); }
</style>
