<script setup>
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  FileText, CheckSquare, Lightbulb, Bell, Search, Network,
  Sparkles, KeyRound, Trash2, Settings, CloudOff
} from 'lucide-vue-next';
import { useIdeasStore } from '../../stores/ideas.js';
import { useRemindersStore } from '../../stores/reminders.js';
import { useAIAssistStore } from '../../stores/aiAssist.js';
import { useIntegrationsStore } from '../../stores/integrations.js';
import { checkoutCount, dirtyCount } from '../../lib/checkouts.js';
import AIAssistPendingPill from '../ai/AIAssistPendingPill.vue';

const props = defineProps({
  remindersOpen: { type: Boolean, default: false }
});
const emit = defineEmits(['toggle-reminders']);

const router = useRouter();
const route = useRoute();
const ideasStore = useIdeasStore();
const remindersStore = useRemindersStore();
const aiAssistStore = useAIAssistStore();
const integrationsStore = useIntegrationsStore();

// Active rail item is derived from route.meta.rail (set in router/index.js).
// Falls back to 'notes' if a route doesn't declare one — keeps the rail
// looking sensible during transitions or on unknown routes.
const activeRail = computed(() => route.meta?.rail || 'notes');

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const modKey = isMac ? '⌘' : 'Ctrl';

// Order matches CR026 §4. `type: 'route'` items push a route; `type: 'overlay'`
// items invoke a callback (Reminders popover, AI Assist modal) without
// changing the active rail item.
const primaryItems = [
  { key: 'notes',    icon: FileText,    label: 'Notes',     shortcut: '1', type: 'route',   to: '/notes' },
  { key: 'tasks',    icon: CheckSquare, label: 'Tasks',     shortcut: '2', type: 'route',   to: '/tasks' },
  { key: 'ideas',    icon: Lightbulb,   label: 'Ideas',     shortcut: '3', type: 'route',   to: '/ideas' },
  { key: 'reminders',icon: Bell,        label: 'Reminders', shortcut: '4', type: 'overlay', overlay: 'reminders' },
  { key: 'search',   icon: Search,      label: 'Search',    shortcut: '5', type: 'route',   to: '/search' },
  { key: 'graph',    icon: Network,     label: 'Graph',     shortcut: '6', type: 'route',   to: '/graph' },
  { key: 'aiassist', icon: Sparkles,    label: 'AI Assist', shortcut: '7', type: 'overlay', overlay: 'aiassist' },
  { key: 'vault',    icon: KeyRound,    label: 'Vault',     shortcut: '8', type: 'route',   to: '/vault' }
];

// Offline rail item only appears when there is at least one checked-out note
// (CR027). It sits with the bottom group so it doesn't disturb the
// numbered ⌘1–⌘8 ordering.
const offlineItem = { key: 'offline', icon: CloudOff, label: 'Offline', type: 'route', to: '/offline' };

const bottomItems = computed(() => {
  const items = [];
  if (checkoutCount.value > 0) items.push(offlineItem);
  items.push({ key: 'trash',    icon: Trash2,   label: 'Trash',    type: 'route', to: '/trash' });
  items.push({ key: 'settings', icon: Settings, label: 'Settings', type: 'route', to: '/settings' });
  return items;
});

function activate(item) {
  if (item.type === 'overlay') {
    if (item.overlay === 'reminders') emit('toggle-reminders');
    else if (item.overlay === 'aiassist') aiAssistStore.toggle();
    return;
  }
  if (route.path !== item.to) router.push(item.to);
}

function tooltipFor(item) {
  if (item.shortcut) return `${item.label} (${modKey}${item.shortcut})`;
  return item.label;
}

function isActive(item) {
  if (item.type === 'overlay') {
    return item.overlay === 'reminders' && props.remindersOpen;
  }
  return activeRail.value === item.key;
}

defineExpose({ activate, primaryItems });
</script>

<template>
  <nav class="activity-rail" aria-label="Primary navigation">
    <div class="rail-group rail-group-top">
      <button
        v-for="item in primaryItems"
        :key="item.key"
        class="rail-btn"
        :class="{ active: isActive(item) }"
        :title="tooltipFor(item)"
        :aria-label="item.label"
        @click="activate(item)"
      >
        <component :is="item.icon" :size="20" />
        <span v-if="item.key === 'ideas' && ideasStore.count > 0" class="badge badge-ideas">{{ ideasStore.count }}</span>
        <span v-else-if="item.key === 'reminders' && remindersStore.overdueCount > 0" class="badge badge-reminders">{{ remindersStore.overdueCount }}</span>
        <AIAssistPendingPill v-else-if="item.key === 'aiassist'" class="badge-ai" />
      </button>
    </div>

    <div class="rail-spacer" />

    <div class="rail-group rail-group-bottom">
      <button
        v-for="item in bottomItems"
        :key="item.key"
        class="rail-btn"
        :class="{ active: isActive(item) }"
        :title="item.label"
        :aria-label="item.label"
        @click="activate(item)"
      >
        <component :is="item.icon" :size="20" />
        <span v-if="item.key === 'offline' && dirtyCount > 0" class="badge badge-offline">{{ dirtyCount }}</span>
        <span
          v-else-if="item.key === 'settings' && integrationsStore.googleDrive.needsReconnect"
          class="badge badge-dot badge-warning"
          title="Google Drive reconnect required"
        />
      </button>
    </div>
  </nav>
</template>

<style scoped>
.activity-rail {
  width: 48px;
  min-width: 48px;
  height: 100vh;
  background-color: var(--rail-bg);
  border-right: 1px solid var(--rail-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  box-sizing: border-box;
}

.rail-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 100%;
}

.rail-spacer {
  flex: 1;
}

.rail-group-bottom {
  border-top: 1px solid var(--rail-border);
  padding-top: 6px;
  margin-top: 4px;
}

.rail-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: none;
  border: none;
  border-radius: 6px;
  color: var(--text-muted);
  cursor: pointer;
  transition: background-color 0.1s, color 0.1s;
}

.rail-btn:hover {
  background-color: var(--rail-hover);
  color: var(--text-primary);
}

.rail-btn.active {
  background-color: var(--rail-active);
  color: var(--text-primary);
}

/* Left accent stripe on the active item */
.rail-btn.active::before {
  content: '';
  position: absolute;
  left: -4px;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background-color: var(--accent-primary);
}

.badge {
  position: absolute;
  top: 4px;
  right: 4px;
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  border-radius: 10px;
  font-size: 9px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.badge-ideas {
  background: var(--accent-warn);
  color: var(--on-accent-warn);
}

.badge-reminders {
  background: var(--status-error);
  color: #ffffff;
}

.badge-ai {
  position: absolute;
  top: 4px;
  right: 4px;
}

.badge-offline {
  background: var(--accent-warn, #ffb800);
  color: var(--on-accent-warn, #1a1a1a);
}

/* Dot-only badge (no count) — used for the Settings reconnect indicator */
.badge-dot {
  min-width: 8px;
  width: 8px;
  height: 8px;
  padding: 0;
  top: 6px;
  right: 6px;
}

.badge-warning {
  background: var(--status-warning, var(--accent-warn, #ffb800));
}
</style>
