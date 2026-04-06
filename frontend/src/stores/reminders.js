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
    } catch {
      // silent fail on poll
    }
  }

  function startPolling(intervalMs = 60000) {
    stopPolling();
    checkDue();
    pollTimer = setInterval(checkDue, intervalMs);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  return {
    overdue, upcoming, dismissed, dueNow, loading,
    totalActive, overdueCount,
    fetchReminders, checkDue, startPolling, stopPolling
  };
});
