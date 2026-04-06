import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api, getAccessToken } from '../api/client.js';

export const useAttachmentsStore = defineStore('attachments', () => {
  const attachments = ref([]);
  const loading = ref(false);
  const uploading = ref(false);

  async function fetchAttachments(noteId) {
    loading.value = true;
    try {
      const res = await api.get(`/notes/${noteId}/attachments`);
      attachments.value = res.data;
    } finally {
      loading.value = false;
    }
  }

  async function uploadFile(noteId, file) {
    uploading.value = true;
    try {
      const res = await api.upload(`/notes/${noteId}/attachments`, file);
      attachments.value.unshift(res.data);
      return res.data;
    } finally {
      uploading.value = false;
    }
  }

  async function deleteAttachment(id) {
    await api.delete(`/attachments/${id}`);
    attachments.value = attachments.value.filter(a => a.id !== id);
  }

  function clear() {
    attachments.value = [];
  }

  function getUrl(id) {
    const token = getAccessToken();
    return `/api/v1/attachments/${id}${token ? '?token=' + token : ''}`;
  }

  return {
    attachments, loading, uploading,
    fetchAttachments, uploadFile, deleteAttachment, clear, getUrl
  };
});
