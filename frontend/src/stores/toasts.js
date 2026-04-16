import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useToastsStore = defineStore('toasts', () => {
  const toasts = ref([]);
  let nextId = 1;
  const MAX_VISIBLE = 3;

  function addToast({ message, type = 'info', duration = 5000, action = null, actionLabel = '' }) {
    const id = nextId++;
    toasts.value.push({ id, message, type, action, actionLabel });

    // Auto-remove oldest if over limit
    while (toasts.value.length > MAX_VISIBLE) {
      toasts.value.shift();
    }

    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }

    return id;
  }

  function removeToast(id) {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }

  return { toasts, addToast, removeToast };
});
