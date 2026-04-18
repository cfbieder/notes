<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useRemindersStore } from '../../stores/reminders.js';
import { Bell, BellRing, BellOff, Clock, CheckCircle, FileText, X } from 'lucide-vue-next';

const emit = defineEmits(['close']);
const router = useRouter();
const remindersStore = useRemindersStore();

const snoozeOpenId = ref(null);

onMounted(async () => {
  await remindersStore.fetchReminders();
});

function goToReminder(r) {
  emit('close');
  setTimeout(() => {
    if (r.note_id) {
      router.push(`/notes/${r.note_id}`);
    } else if (r.type === 'task') {
      router.push('/tasks');
    }
  }, 50);
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

function toggleSnooze(r) {
  const key = `${r.type}-${r.id}`;
  snoozeOpenId.value = snoozeOpenId.value === key ? null : key;
}

async function snooze(r, minutes) {
  const until = new Date(Date.now() + minutes * 60000).toISOString();
  await remindersStore.snoozeReminder(r.id, r.type, until);
  snoozeOpenId.value = null;
}

async function snoozeTomorrow(r) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  await remindersStore.snoozeReminder(r.id, r.type, tomorrow.toISOString());
  snoozeOpenId.value = null;
}

async function dismiss(r) {
  await remindersStore.dismissReminder(r.id, r.type);
}

function onClickOutsideSnooze(e) {
  if (snoozeOpenId.value && !e.target.closest('.snooze-dropdown') && !e.target.closest('.action-snooze')) {
    snoozeOpenId.value = null;
  }
}

onMounted(() => document.addEventListener('mousedown', onClickOutsideSnooze));
onBeforeUnmount(() => document.removeEventListener('mousedown', onClickOutsideSnooze));
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
          >
            <div class="reminder-body" @click="goToReminder(r)">
              <div class="reminder-content">{{ r.content }}</div>
              <div class="reminder-meta">
                <span class="reminder-time">{{ formatDate(r.reminder_at) }}</span>
                <span v-if="r.note_title && r.type === 'task'" class="reminder-note">
                  <FileText :size="10" /> {{ r.note_title }}
                </span>
              </div>
            </div>
            <div class="reminder-actions">
              <div class="snooze-wrapper">
                <button class="action-snooze" @click.stop="toggleSnooze(r)" title="Snooze">
                  <Clock :size="13" />
                </button>
                <div v-if="snoozeOpenId === `${r.type}-${r.id}`" class="snooze-dropdown">
                  <button @click.stop="snooze(r, 15)">15 minutes</button>
                  <button @click.stop="snooze(r, 60)">1 hour</button>
                  <button @click.stop="snoozeTomorrow(r)">Tomorrow 9 AM</button>
                </div>
              </div>
              <button class="action-dismiss" @click.stop="dismiss(r)" title="Dismiss">
                <BellOff :size="13" />
              </button>
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
          >
            <div class="reminder-body" @click="goToReminder(r)">
              <div class="reminder-content">{{ r.content }}</div>
              <div class="reminder-meta">
                <span class="reminder-time">{{ formatDate(r.reminder_at) }}</span>
                <span v-if="r.note_title && r.type === 'task'" class="reminder-note">
                  <FileText :size="10" /> {{ r.note_title }}
                </span>
              </div>
            </div>
            <div class="reminder-actions">
              <div class="snooze-wrapper">
                <button class="action-snooze" @click.stop="toggleSnooze(r)" title="Snooze">
                  <Clock :size="13" />
                </button>
                <div v-if="snoozeOpenId === `${r.type}-${r.id}`" class="snooze-dropdown">
                  <button @click.stop="snooze(r, 15)">15 minutes</button>
                  <button @click.stop="snooze(r, 60)">1 hour</button>
                  <button @click.stop="snoozeTomorrow(r)">Tomorrow 9 AM</button>
                </div>
              </div>
              <button class="action-dismiss" @click.stop="dismiss(r)" title="Dismiss">
                <BellOff :size="13" />
              </button>
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
  background: var(--overlay-modal);
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

.overdue-label { color: var(--status-error); }

.reminder-item {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  transition: background-color 0.1s;
}
.reminder-item:hover { background: var(--hover-bg); }

.reminder-item.overdue {
  border-left: 3px solid var(--status-error);
}

.reminder-body {
  flex: 1;
  min-width: 0;
  cursor: pointer;
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
.overdue .reminder-time { color: var(--status-error); }

.reminder-note {
  display: flex;
  align-items: center;
  gap: 3px;
}

.reminder-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
}
.reminder-item:hover .reminder-actions { opacity: 1; }

/* Always show actions on mobile */
@media (max-width: 768px) {
  .reminder-actions { opacity: 1; }
}

.action-snooze, .action-dismiss {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}
.action-snooze:hover { color: var(--accent-primary); background: var(--hover-bg); }
.action-dismiss:hover { color: var(--status-error); background: var(--status-error-bg); }

.snooze-wrapper {
  position: relative;
}

.snooze-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  width: 160px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  z-index: 1001;
  overflow: hidden;
}

.snooze-dropdown button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  cursor: pointer;
}
.snooze-dropdown button:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
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
