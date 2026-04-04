<script setup>
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <h1>Noted</h1>
      <p>Sign in to continue</p>
      <form @submit.prevent>
        <input type="text" placeholder="Username" />
        <input type="password" placeholder="Password" />
        <button type="submit" class="btn-primary">Sign In</button>
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
}

.login-card p {
  color: var(--text-secondary);
  margin: 0 0 24px;
}

.login-card input {
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

.login-card input:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.btn-primary {
  width: 100%;
  background-color: var(--accent-warn);
  color: #1a1a1a;
  border: none;
  border-radius: 8px;
  padding: 10px 20px;
  font-weight: 600;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.btn-primary:hover {
  opacity: 0.88;
}
</style>
