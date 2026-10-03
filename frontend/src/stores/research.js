import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/client.js';

// CR039 — research sources, books and chapters. Chapters are tracked for the
// active book only; that is what the Research panel and pickers show.
export const useResearchStore = defineStore('research', () => {
  const books = ref([]);
  const chapters = ref([]);
  const loaded = ref(false);

  const activeBook = computed(() => books.value.find(b => b.is_active) || null);
  // The Research rail item appears only once a book exists (CR039 §16 #12).
  const hasBook = computed(() => books.value.length > 0);

  // AppSidebar mounts in every view, so several callers ask at once; share one
  // in-flight load and skip it when already loaded. Mutations refresh state.
  let loading = null;
  function ensureLoaded() {
    if (loaded.value) return Promise.resolve();
    if (!loading) loading = fetchBooks().finally(() => { loading = null; });
    return loading;
  }

  async function fetchBooks() {
    const res = await api.get('/books');
    books.value = res.data;
    loaded.value = true;
    await fetchChapters();
  }

  async function fetchChapters() {
    if (!activeBook.value) {
      chapters.value = [];
      return;
    }
    const res = await api.get(`/books/${activeBook.value.id}/chapters`);
    chapters.value = res.data;
  }

  async function createBook(title) {
    await api.post('/books', { title });
    await fetchBooks();
  }

  async function updateBook(id, data) {
    await api.put(`/books/${id}`, data);
    await fetchBooks();
  }

  async function deleteBook(id) {
    await api.delete(`/books/${id}`);
    await fetchBooks();
  }

  async function createChapter(data) {
    await api.post(`/books/${activeBook.value.id}/chapters`, data);
    await fetchChapters();
  }

  async function updateChapter(id, data) {
    await api.put(`/chapters/${id}`, data);
    await fetchChapters();
  }

  async function deleteChapter(id, force = false) {
    await api.delete(`/chapters/${id}${force ? '?force=true' : ''}`);
    await fetchChapters();
  }

  async function reorderChapters(ids) {
    const res = await api.put(`/books/${activeBook.value.id}/chapters/reorder`, { chapter_ids: ids });
    // Keep counts from the current list; the reorder response has none.
    const counts = Object.fromEntries(chapters.value.map(c => [c.id, c.source_count]));
    chapters.value = res.data.map(c => ({ ...c, source_count: counts[c.id] ?? 0 }));
  }

  async function fetchSources(params = {}) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '')).toString();
    const res = await api.get(`/sources${qs ? `?${qs}` : ''}`);
    return res;
  }

  // A3 — read citation metadata from a public page (nothing is stored).
  async function fetchMetadata(url) {
    return (await api.post('/sources/fetch-metadata', { url })).data;
  }

  // A3 — upload a PDF as a source. fields: { title?, source_kind?, url?, chapterIds? }
  async function uploadPdfSource(file, fields = {}) {
    const res = await api.upload('/sources/from-pdf', file, {
      title: fields.title,
      source_kind: fields.source_kind,
      url: fields.url,
      chapter_ids: fields.chapterIds?.length ? JSON.stringify(fields.chapterIds) : undefined
    });
    await fetchChapters();
    return res.data;
  }

  async function getSource(id) {
    return (await api.get(`/sources/${id}`)).data;
  }

  async function createSource(data) {
    const res = await api.post('/sources', data);
    await fetchChapters();
    return res.data;
  }

  async function updateSource(id, data) {
    return (await api.put(`/sources/${id}`, data)).data;
  }

  async function assignChapter(sourceId, chapterId) {
    const res = await api.post(`/sources/${sourceId}/chapters`, { chapter_id: chapterId });
    await fetchChapters();
    return res.data;
  }

  // Phase B — { html, markdown, text, count, incomplete } for a chapter or a book.
  async function fetchReferences(scope, id) {
    return (await api.get(`/${scope === 'book' ? 'books' : 'chapters'}/${id}/references`)).data;
  }

  async function unassignChapter(sourceId, chapterId) {
    await api.delete(`/sources/${sourceId}/chapters/${chapterId}`);
    await fetchChapters();
  }

  return {
    books, chapters, loaded, activeBook, hasBook,
    ensureLoaded, fetchBooks, fetchChapters, createBook, updateBook, deleteBook,
    createChapter, updateChapter, deleteChapter, reorderChapters,
    fetchSources, fetchMetadata, uploadPdfSource, getSource, createSource, updateSource, assignChapter, unassignChapter, fetchReferences
  };
});
