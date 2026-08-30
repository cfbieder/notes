// CR038 — AI provider settings store.
// Talks to /api/v1/ai-providers. API keys are write-only: the server never
// returns them, so the store only ever knows `hasKey`, never the key itself.

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client.js';

export const useAiProvidersStore = defineStore('aiProviders', () => {
  const configs = ref([]);      // [{ capability, provider, baseUrl, modelConfig, enabled, hasKey, updatedAt }]
  const loaded = ref(false);
  const busy = ref(false);
  const error = ref(null);

  async function fetchAll() {
    busy.value = true;
    error.value = null;
    try {
      const res = await api.get('/ai-providers');
      configs.value = res.data || [];
      loaded.value = true;
    } catch (e) {
      error.value = e?.message || 'Failed to load AI provider settings';
    } finally {
      busy.value = false;
    }
  }

  function forCapability(capability) {
    return configs.value.find((c) => c.capability === capability) || null;
  }

  async function save(capability, payload) {
    const res = await api.put(`/ai-providers/${capability}`, payload);
    const idx = configs.value.findIndex((c) => c.capability === capability);
    if (idx >= 0) configs.value[idx] = res.data;
    else configs.value.push(res.data);
    return res.data;
  }

  async function remove(capability) {
    await api.delete(`/ai-providers/${capability}`);
    configs.value = configs.value.filter((c) => c.capability !== capability);
  }

  async function test(capability, payload) {
    const res = await api.post(`/ai-providers/${capability}/test`, payload);
    return res.data; // { ok, provider, message }
  }

  return { configs, loaded, busy, error, fetchAll, forCapability, save, remove, test };
});
