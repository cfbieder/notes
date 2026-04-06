<script setup>
import { onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useRemindersStore } from '../../stores/reminders.js';
import { Bell, BellRing, Clock, CheckCircle, FileText, X } from 'lucide-vue-next';

const emit = defineEmits(['close']);
const router = useRouter();
const remindersStore = useRemindersStore();

onMounted(async () => {
  await remindersStore.fetchReminders();
});

function goToNote(noteId) {
  if (noteId) {
    router.push(`/notes/${noteId}`);
    emit('close');
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date - now;
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
  return date.toLocaleDateString();
}
</script>

<template>
  <div class="reminders-overlay" @click.self="$emit('close')">
    <div class="reminders-panel">
      <div class="panel-header">
        <Bell :size="16" />
        <span>Reminders</span>
        <button class="close-btn" @click="$emit('close')">
          <X :size="16" />
        </button>
      </div>

      <div v-if="remindersStore.loading" class="panel-loading">Loading...</div>

      <div v-else class="panel-content">
        <!-- Overdue -->
        <div v-if="remindersStore.overdue.length > 0" class="section">
          <div class="section-label overdue-label">
            <BellRing :size="12" />
            Overdue ({{ remindersStore.overdue.length }})
          </div>
          <div
            v-for="r in remindersStore.overdue"
            :key="r.id + r.type"
            class="reminder-item overdue"
            @click="goToNote(r.note_id)"
          >
            <div class="reminder-content">{{ r.content }}</div>
            <div class="reminder-meta">
              <span class="reminder-time">{{ formatDate(r.reminder_at) }}</span>
              <span v-if="r.note_title && r.type === 'task'" class="reminder-note">
                <FileText :size="10" /> {{ r.note_title }}
              </span>
            </div>
          </div>
        </div>

        <!-- Upcoming -->
        <div v-if="remindersStore.upcoming.length > 0" class="section">
          <div class="section-label">
            <Clock :size="12" />
            Upcoming ({{ remindersStore.upcoming.length }})
          </div>
          <div
            v-for="r in remindersStore.upcoming"
            :key="r.id + r.type"
            class="reminder-item"
            @click="goToNote(r.note_id)"
          >
            <div class="reminder-content">{{ r.content }}</div>
            <div class="reminder-meta">
              <span class="reminder-time">{{ formatDate(r.reminder_at) }}</span>
              <span v-if="r.note_title && r.type === 'task'" class="reminder-note">
                <FileText :size="10" /> {{ r.note_title }}
              </span>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="remindersStore.overdue.length === 0 && remindersStore.upcoming.length === 0" class="empty-state">
          <CheckCircle :size="32" />
          <p>No active reminders</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reminders-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: center;
  padding-top: 10vh;
  z-index: 1000;
}

.reminders-panel {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  width: 420px;
  max-height: 70vh;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle);
  font-weight: 600;
  font-size: 14px;
}

.close-btn {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
}
.close-btn:hover { color: var(--text-primary); }

.panel-loading {
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
}

.panel-content {
  overflow-y: auto;
  padding: 8px 0;
}

.section { margin-bottom: 8px; }

.section-label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.overdue-label { color: #ff6b6b; }

.reminder-item {
  padding: 10px 16px;
  cursor: pointer;
  transition: background-color 0.1s;
}
.reminder-item:hover { background: rgba(255, 255, 255, 0.04); }

.reminder-item.overdue {
  border-left: 3px solid #ff6b6b;
}

.reminder-content {
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reminder-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-muted);
}

.reminder-time { font-weight: 500; }
.overdue .reminder-time { color: #ff6b6b; }

.reminder-note {
  display: flex;
  align-items: center;
  gap: 3px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: var(--text-muted);
  gap: 8px;
  font-size: 14px;
}
</style>
