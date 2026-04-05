import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client.js';

export const useTasksStore = defineStore('tasks', () => {
  const tasks = ref([]);
  const inboxTasks = ref([]);
  const meta = ref({ total: 0, limit: 50, offset: 0 });
  const loading = ref(false);

  async function fetchTasks(params = {}) {
    loading.value = true;
    try {
      const query = new URLSearchParams();
      if (params.is_done !== undefined) query.set('is_done', params.is_done);
      if (params.note_id) query.set('note_id', params.note_id);
      if (params.due_before) query.set('due_before', params.due_before);
      if (params.due_after) query.set('due_after', params.due_after);

      const qs = query.toString();
      const res = await api.get(`/tasks${qs ? '?' + qs : ''}`);
      tasks.value = res.data;
      meta.value = res.meta;
    } finally {
      loading.value = false;
    }
  }

  async function fetchInboxTasks() {
    const res = await api.get('/tasks/inbox');
    inboxTasks.value = res.data;
  }

  async function createTask(data) {
    const res = await api.post('/tasks', data);
    return res.data;
  }

  async function updateTask(id, data) {
    const res = await api.put(`/tasks/${id}`, data);
    const idx = tasks.value.findIndex(t => t.id === id);
    if (idx !== -1) tasks.value[idx] = res.data;
    const inIdx = inboxTasks.value.findIndex(t => t.id === id);
    if (inIdx !== -1) inboxTasks.value[inIdx] = res.data;
    return res.data;
  }

  async function toggleTask(id) {
    const task = tasks.value.find(t => t.id === id) || inboxTasks.value.find(t => t.id === id);
    if (task) {
      return updateTask(id, { is_done: !task.is_done });
    }
  }

  async function deleteTask(id) {
    await api.delete(`/tasks/${id}`);
    tasks.value = tasks.value.filter(t => t.id !== id);
    inboxTasks.value = inboxTasks.value.filter(t => t.id !== id);
  }

  return {
    tasks, inboxTasks, meta, loading,
    fetchTasks, fetchInboxTasks, createTask, updateTask, toggleTask, deleteTask
  };
});
