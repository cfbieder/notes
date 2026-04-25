import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { registerSW } from 'virtual:pwa-register';
import router from './router/index.js';
import App from './App.vue';
import './styles/theme.css';
import { applyTheme, loadTheme } from './stores/ui.js';
import { useToastsStore } from './stores/toasts.js';

applyTheme(loadTheme());

const app = createApp(App);

app.use(createPinia());
app.use(router);

// Dev environment visual cues
const isDev = Boolean(import.meta.env.VITE_ENV_LABEL);
if (isDev) {
  document.title = '[DEV] Noted';
  // Swap favicon to orange background for dev
  const devFavicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <rect width="32" height="32" rx="6" fill="#ff9f1c"/>
    <path d="M8 24V8h3.5l8 11V8H23v16h-3.5l-8-11v11z" fill="#102a50"/>
  </svg>`;
  const link = document.querySelector('link[rel="icon"]');
  if (link) {
    link.href = 'data:image/svg+xml,' + encodeURIComponent(devFavicon);
  }
}

app.mount('#app');

const updateSW = registerSW({
  onNeedRefresh() {
    useToastsStore().addToast({
      message: 'A new version of Noted is available.',
      type: 'info',
      duration: 0,
      action: () => updateSW(true),
      actionLabel: 'Reload'
    });
  }
});
