import { createApp } from 'vue';
import { createPinia } from 'pinia';
import router from './router/index.js';
import App from './App.vue';
import './styles/theme.css';

const app = createApp(App);

app.use(createPinia());
app.use(router);

// Dev environment visual cues
const isDev = Boolean(import.meta.env.VITE_ENV_LABEL);
if (isDev) {
  document.title = '[DEV] Noted';
}

app.mount('#app');
