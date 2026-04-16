import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/client.js';

export const useRemindersStore = defineStore('reminders', () => {
  const overdue = ref([]);
  const upcoming = ref([]);
  const dismissed = ref([]);
  const dueNow = ref([]);
  const loading = ref(false);
  let pollTimer = null;

  // Track which reminders we've already notified about (per session)
  const seenIds = new Set(
    JSON.parse(sessionStorage.getItem('reminder_seen_ids') || '[]')
  );

  function persistSeen() {
    sessionStorage.setItem('reminder_seen_ids', JSON.stringify([...seenIds]));
  }

  const totalActive = computed(() => overdue.value.length + upcoming.value.length);
  const overdueCount = computed(() => overdue.value.length);

  async function fetchReminders() {
    loading.value = true;
    try {
      const res = await api.get('/reminders');
      overdue.value = res.data.overdue;
      upcoming.value = res.data.upcoming;
      dismissed.value = res.data.dismissed;
    } finally {
      loading.value = false;
    }
  }

  async function checkDue() {
    try {
      const res = await api.get('/reminders/due');
      dueNow.value = res.data;

      // Fire notifications for newly-due reminders
      for (const r of res.data) {
        const key = `${r.type}-${r.id}`;
        if (seenIds.has(key)) continue;

        seenIds.add(key);
        persistSeen();

        // Lazy-import to avoid circular dependency at module load
        const { useToastsStore } = await import('./toasts.js');
        const toastsStore = useToastsStore();
        const noteId = r.note_id;
        toastsStore.addToast({
          message: `Reminder: ${r.content}`,
          type: 'warning',
          duration: 0,
          actionLabel: 'View',
          action: noteId ? () => {
            import('../router/index.js').then(m => m.default.push(`/notes/${noteId}`));
          } : null
        });

        fireBrowserNotification(r);
        playReminderSound();
      }
    } catch (err) {
      // Only silence network errors; log notification failures
      if (err?.message && !err.message.includes('fetch')) {
        console.error('Reminder poll error:', err);
      }
    }
  }

  function playReminderSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Two-tone chime: E5 then G5
      [659.25, 783.99].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.15);
        osc.stop(ctx.currentTime + i * 0.15 + 0.3);
      });
    } catch {
      // Audio not available — silent fallback
    }
  }

  function fireBrowserNotification(reminder) {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    const n = new Notification('Noted — Reminder', {
      body: reminder.content,
      icon: '/icon-192.png',
      tag: `reminder-${reminder.type}-${reminder.id}`
    });

    n.onclick = () => {
      window.focus();
      if (reminder.note_id) {
        window.location.href = `/notes/${reminder.note_id}`;
      }
      n.close();
    };
  }

  async function requestNotificationPermission() {
    if (typeof Notification === 'undefined') return 'denied';
    const result = await Notification.requestPermission();
    return result;
  }

  function startPolling(intervalMs = 60000) {
    stopPolling();
    pollTimer = setInterval(checkDue, intervalMs);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    seenIds.clear();
    persistSeen();
  }

  async function snoozeReminder(id, type, snoozeUntil) {
    await api.put(`/reminders/${id}/snooze`, { type, snooze_until: snoozeUntil });
    // Remove from seen so it can re-notify at the new time
    seenIds.delete(`${type}-${id}`);
    persistSeen();
    await fetchReminders();
  }

  async function dismissReminder(id, type) {
    await api.put(`/reminders/${id}/dismiss`, { type });
    seenIds.delete(`${type}-${id}`);
    persistSeen();
    dueNow.value = dueNow.value.filter(r => !(r.id === id && r.type === type));
    await fetchReminders();
  }

  return {
    overdue, upcoming, dismissed, dueNow, loading,
    totalActive, overdueCount,
    fetchReminders, checkDue, startPolling, stopPolling,
    snoozeReminder, dismissReminder, requestNotificationPermission
  };
});
