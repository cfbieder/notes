import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client.js';

export const useIntegrationsStore = defineStore('integrations', () => {
  const googleDrive = ref({
    connected: false,
    enabled: false,
    folderName: null,
    folderId: null,
    pollIntervalMinutes: 5,
    lastImport: null
  });
  const history = ref([]);
  const historyMeta = ref({ total: 0, limit: 20, offset: 0 });
  const loading = ref(false);
  const scanning = ref(false);
  const scanResult = ref(null);

  async function fetchStatus() {
    loading.value = true;
    try {
      const res = await api.get('/integrations/google-drive/status');
      googleDrive.value = res.data;
    } finally {
      loading.value = false;
    }
  }

  async function getAuthUrl() {
    const res = await api.get('/integrations/google-drive/auth-url');
    return res.data.url;
  }

  async function updateConfig(config) {
    const res = await api.put('/integrations/google-drive/config', config);
    googleDrive.value = {
      ...googleDrive.value,
      ...res.data
    };
    return res.data;
  }

  async function scanNow() {
    scanning.value = true;
    scanResult.value = null;
    try {
      const res = await api.post('/integrations/google-drive/scan');
      scanResult.value = res.data;
      return res.data;
    } finally {
      scanning.value = false;
    }
  }

  async function disconnect() {
    await api.delete('/integrations/google-drive');
    googleDrive.value = {
      connected: false,
      enabled: false,
      folderName: null,
      folderId: null,
      pollIntervalMinutes: 5,
      lastImport: null
    };
    history.value = [];
    historyMeta.value = { total: 0, limit: 20, offset: 0 };
  }

  async function fetchHistory(limit = 20, offset = 0) {
    const res = await api.get(`/integrations/google-drive/history?limit=${limit}&offset=${offset}`);
    history.value = res.data;
    historyMeta.value = res.meta;
  }

  return {
    googleDrive, history, historyMeta, loading, scanning, scanResult,
    fetchStatus, getAuthUrl, updateConfig, scanNow, disconnect, fetchHistory
  };
});
