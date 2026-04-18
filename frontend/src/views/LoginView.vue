<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const router = useRouter();
const authStore = useAuthStore();

const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function handleLogin() {
  error.value = '';
  loading.value = true;
  try {
    await authStore.login(username.value, password.value);
    router.push('/notes');
  } catch (err) {
    error.value = err.body?.message || 'Login failed';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <h1>Noted</h1>
      <p class="subtitle">Sign in to continue</p>
      <form @submit.prevent="handleLogin">
        <div v-if="error" class="error-msg">{{ error }}</div>
        <input
          v-model="username"
          type="text"
          placeholder="Username"
          autocomplete="username"
          required
        />
        <input
          v-model="password"
          type="password"
          placeholder="Password"
          autocomplete="current-password"
          required
        />
        <button type="submit" class="btn-primary" :disabled="loading">
          {{ loading ? 'Signing in...' : 'Sign In' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background-color: var(--bg-sidebar);
}

.login-card {
  background-color: var(--bg-card);
  border-radius: 12px;
  padding: 40px;
  width: 360px;
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-sm);
  text-align: center;
}

.login-card h1 {
  margin: 0 0 8px;
  font-size: 28px;
}

.subtitle {
  color: var(--text-secondary);
  margin: 0 0 24px;
}

.error-msg {
  background: var(--status-error-bg);
  color: var(--status-error);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 12px;
}

input {
  width: 100%;
  padding: 10px 14px;
  margin-bottom: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background-color: var(--bg-main);
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  box-sizing: border-box;
}

input:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.btn-primary {
  width: 100%;
  background-color: var(--accent-warn);
  color: var(--on-accent-warn);
  border: none;
  border-radius: 8px;
  padding: 10px 20px;
  font-weight: 600;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.btn-primary:hover { opacity: 0.88; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
