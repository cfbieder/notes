import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, setAccessToken, OfflineError } from '../api/client.js';

const SESSION_HINT_KEY = 'noted.hasSession';

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const hasSessionHint = ref(localStorage.getItem(SESSION_HINT_KEY) === '1');
  const offlineMode = ref(false);
  // Treat a persisted session hint as "authenticated enough to render the shell"
  // so an offline cold-load doesn't bounce to /login.
  const isAuthenticated = computed(() => !!user.value || hasSessionHint.value);

  function setSessionHint(on) {
    hasSessionHint.value = on;
    if (on) localStorage.setItem(SESSION_HINT_KEY, '1');
    else localStorage.removeItem(SESSION_HINT_KEY);
  }

  async function login(username, password) {
    const res = await api.post('/auth/login', { username, password });
    user.value = res.data.user;
    setAccessToken(res.data.accessToken);
    setSessionHint(true);
    offlineMode.value = false;
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
    setSessionHint(false);
  }

  async function refreshSession() {
    try {
      const res = await api.post('/auth/refresh');
      if (res.accessToken) {
        setAccessToken(res.accessToken);
        user.value = res.user;
        setSessionHint(true);
        offlineMode.value = false;
        return true;
      }
    } catch (err) {
      if (err instanceof OfflineError) {
        // Keep session hint; enter offline mode so the app shell still loads.
        offlineMode.value = true;
        return hasSessionHint.value;
      }
      // Real failure (401, etc.) — drop the hint.
      setSessionHint(false);
    }
    return false;
  }

  const initialized = ref(false);
  async function init() {
    if (initialized.value) return;
    // Fast path: if we have a persisted session hint, render the shell
    // immediately and refresh in the background. Avoids blocking the router
    // on a fetch that can hang for ~30s on flaky mobile networks where
    // `navigator.onLine` is unreliable (iPad Safari in particular keeps it
    // `true` in Airplane mode). The shell + offline-cached notes load
    // instantly; a real refresh happens whenever the network actually
    // returns.
    if (hasSessionHint.value) {
      refreshSession().catch(() => { /* ignore — `offlineMode` flag handled inside */ });
      initialized.value = true;
      return;
    }
    await refreshSession();
    initialized.value = true;
  }

  return {
    user, isAuthenticated, hasSessionHint, offlineMode, initialized,
    login, logout, refreshSession, init
  };
});
