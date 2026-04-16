<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { Bell, BellRing, X } from 'lucide-vue-next';

const props = defineProps({
  modelValue: { type: [String, null], default: null },
  dueDate: { type: [String, null], default: null },
  size: { type: String, default: 'normal' } // 'normal' | 'small'
});

const emit = defineEmits(['update:modelValue']);

const open = ref(false);
const pickerRef = ref(null);
const customDatetime = ref('');

const hasReminder = computed(() => !!props.modelValue);

const reminderLabel = computed(() => {
  if (!props.modelValue) return '';
  const d = new Date(props.modelValue);
  const now = new Date();
  const diffMs = d - now;
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);

  if (diffMs < 0) {
    const absMins = Math.abs(diffMins);
    if (absMins < 60) return `${absMins}m ago`;
    const absHours = Math.abs(diffHours);
    if (absHours < 24) return `${absHours}h ago`;
    return `${Math.abs(diffDays)}d ago`;
  }

  if (diffMins < 60) return `in ${diffMins}m`;
  if (diffHours < 24) return `in ${diffHours}h`;
  if (diffDays < 7) return `in ${diffDays}d`;
  return d.toLocaleDateString();
});

const presets = computed(() => {
  const now = new Date();
  const items = [];

  // Due-date-aware presets (only when dueDate is set and in the future)
  if (props.dueDate) {
    const due = new Date(props.dueDate);
    const oneHourBefore = new Date(due.getTime() - 3600000);
    const morningOf = new Date(due);
    morningOf.setHours(9, 0, 0, 0);
    const dayBefore = new Date(due);
    dayBefore.setDate(dayBefore.getDate() - 1);
    dayBefore.setHours(9, 0, 0, 0);

    if (oneHourBefore > now) {
      items.push({ label: '1h before due', value: oneHourBefore.toISOString() });
    }
    if (morningOf > now) {
      items.push({ label: 'Morning of due date', value: morningOf.toISOString() });
    }
    if (dayBefore > now) {
      items.push({ label: 'Day before (9 AM)', value: dayBefore.toISOString() });
    }
  }

  // Always-available presets
  const in1h = new Date(now.getTime() + 3600000);
  items.push({ label: 'In 1 hour', value: in1h.toISOString() });

  const tomorrow9 = new Date(now);
  tomorrow9.setDate(tomorrow9.getDate() + 1);
  tomorrow9.setHours(9, 0, 0, 0);
  items.push({ label: 'Tomorrow 9 AM', value: tomorrow9.toISOString() });

  // Next Monday 9 AM
  const nextMon = new Date(now);
  const dayOfWeek = nextMon.getDay();
  const daysUntilMon = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
  nextMon.setDate(nextMon.getDate() + daysUntilMon);
  nextMon.setHours(9, 0, 0, 0);
  if (nextMon > now) {
    items.push({ label: 'Next Monday 9 AM', value: nextMon.toISOString() });
  }

  return items;
});

function selectPreset(value) {
  emit('update:modelValue', value);
  open.value = false;
}

function applyCustom() {
  if (customDatetime.value) {
    emit('update:modelValue', new Date(customDatetime.value).toISOString());
    open.value = false;
    customDatetime.value = '';
  }
}

function clearReminder() {
  emit('update:modelValue', null);
  open.value = false;
}

function toggle() {
  open.value = !open.value;
}

function onClickOutside(e) {
  if (pickerRef.value && !pickerRef.value.contains(e.target)) {
    open.value = false;
  }
}

onMounted(() => document.addEventListener('mousedown', onClickOutside));
onBeforeUnmount(() => document.removeEventListener('mousedown', onClickOutside));
</script>

<template>
  <div class="reminder-picker" ref="pickerRef">
    <button
      class="reminder-trigger"
      :class="{ active: hasReminder, small: size === 'small' }"
      @click="toggle"
      :title="hasReminder ? `Reminder ${reminderLabel}` : 'Set reminder'"
    >
      <BellRing v-if="hasReminder" :size="size === 'small' ? 12 : 14" />
      <Bell v-else :size="size === 'small' ? 12 : 14" />
      <span v-if="hasReminder && size !== 'small'" class="reminder-label">{{ reminderLabel }}</span>
    </button>

    <div v-if="open" class="reminder-dropdown">
      <div class="dropdown-header">
        <span>Set Reminder</span>
        <button class="dropdown-close" @click="open = false"><X :size="12" /></button>
      </div>

      <div class="preset-list">
        <button
          v-for="preset in presets"
          :key="preset.label"
          class="preset-item"
          @click="selectPreset(preset.value)"
        >
          {{ preset.label }}
        </button>
      </div>

      <div class="custom-section">
        <label class="custom-label">Custom</label>
        <div class="custom-row">
          <input
            v-model="customDatetime"
            type="datetime-local"
            class="custom-input"
          />
          <button class="custom-apply" @click="applyCustom" :disabled="!customDatetime">Set</button>
        </div>
      </div>

      <button v-if="hasReminder" class="clear-btn" @click="clearReminder">
        Clear reminder
      </button>
    </div>
  </div>
</template>

<style scoped>
.reminder-picker {
  position: relative;
}

.reminder-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  color: var(--text-muted);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.1s;
}
.reminder-trigger:hover {
  border-color: var(--accent-warn);
  color: var(--accent-warn);
}
.reminder-trigger.active {
  border-color: var(--accent-warn);
  color: var(--accent-warn);
}
.reminder-trigger.small {
  padding: 3px 6px;
  border: none;
}

.reminder-label {
  font-size: 11px;
  white-space: nowrap;
}

.reminder-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  width: 240px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  overflow: hidden;
}

.dropdown-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.dropdown-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px;
}
.dropdown-close:hover { color: var(--text-primary); }

.preset-list {
  padding: 4px 0;
}

.preset-item {
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
  transition: background 0.1s;
}
.preset-item:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
}

.custom-section {
  padding: 8px 12px;
  border-top: 1px solid var(--border-subtle);
}

.custom-label {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
  display: block;
  margin-bottom: 6px;
}

.custom-row {
  display: flex;
  gap: 6px;
}

.custom-input {
  flex: 1;
  background: var(--bg-main);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  padding: 4px 6px;
}

.custom-apply {
  padding: 4px 10px;
  background: var(--accent-primary);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
}
.custom-apply:disabled { opacity: 0.4; cursor: not-allowed; }

.clear-btn {
  display: block;
  width: 100%;
  text-align: center;
  padding: 8px 12px;
  background: none;
  border: none;
  border-top: 1px solid var(--border-subtle);
  color: #ff6b6b;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  cursor: pointer;
}
.clear-btn:hover { background: rgba(255, 107, 107, 0.08); }
</style>
