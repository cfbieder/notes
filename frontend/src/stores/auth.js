import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, setAccessToken } from '../api/client.js';

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const isAuthenticated = computed(() => !!user.value);

  async function login(username, password) {
    const res = await api.post('/auth/login', { username, password });
    user.value = res.data.user;
    setAccessToken(res.data.accessToken);
    return res.data;
  }

  async function logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    user.value = null;
    setAccessToken(null);
  }

  async function refreshSession() {
    try {
      const res = await api.post('/auth/refresh');
      if (res.accessToken) {
        setAccessToken(res.accessToken);
        user.value = res.user;
        return true;
      }
    } catch {
      // refresh failed
    }
    return false;
  }

  // Try to restore session on app load
  const initialized = ref(false);
  async function init() {
    if (initialized.value) return;
    await refreshSession();
    initialized.value = true;
  }

  return { user, isAuthenticated, initialized, login, logout, refreshSession, init };
});
