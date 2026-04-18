<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useIdeasStore } from '../stores/ideas.js';
import { useNotebooksStore } from '../stores/notebooks.js';
import { useNotesStore } from '../stores/notes.js';
import { api } from '../api/client.js';
import AppSidebar from '../components/sidebar/AppSidebar.vue';
import MobileLayout from '../components/mobile/MobileLayout.vue';
import { useMobile } from '../composables/useMobile.js';
import { Lightbulb, ArrowRight, FileText, Trash2, X, Search } from 'lucide-vue-next';

const { isMobile } = useMobile();
const router = useRouter();
const ideasStore = useIdeasStore();
const notebooksStore = useNotebooksStore();
const notesStore = useNotesStore();

const searchQuery = ref('');
const promoteModal = ref({ show: false, ideaId: null });
const mergeModal = ref({ show: false, ideaId: null, query: '', results: [], loading: false });

onMounted(async () => {
  await ideasStore.fetchIdeas();
  if (notebooksStore.notebooks.length === 0) {
    await notebooksStore.fetchNotebooks();
  }
});

const filteredIdeas = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return ideasStore.ideas;
  return ideasStore.ideas.filter(i =>
    (i.title || '').toLowerCase().includes(q) ||
    (i.content || '').toLowerCase().includes(q)
  );
});

function openIdea(id) {
  router.push(`/ideas/${id}`);
}

async function discardIdea(id) {
  await ideasStore.deleteIdea(id);
}

function openPromoteModal(id) {
  promoteModal.value = { show: true, ideaId: id };
}

async function confirmPromote(notebookId) {
  const id = promoteModal.value.ideaId;
  promoteModal.value.show = false;
  const note = await ideasStore.promoteIdea(id, notebookId);
  router.push(`/notes/${note.id}`);
}

function openMergeModal(id) {
  mergeModal.value = { show: true, ideaId: id, query: '', results: [], loading: false };
}

let mergeSearchTimer = null;
function onMergeSearchInput() {
  clearTimeout(mergeSearchTimer);
  mergeSearchTimer = setTimeout(async () => {
    const q = mergeModal.value.query.trim();
    if (!q) { mergeModal.value.results = []; return; }
    mergeModal.value.loading = true;
    try {
      const res = await api.get(`/notes?note_type=note&search=${encodeURIComponent(q)}&limit=20`);
      mergeModal.value.results = res.data;
    } catch {
      mergeModal.value.results = [];
    } finally {
      mergeModal.value.loading = false;
    }
  }, 200);
}

async function confirmMerge(targetNoteId) {
  const id = mergeModal.value.ideaId;
  mergeModal.value.show = false;
  await ideasStore.mergeIdea(id, targetNoteId);
  router.push(`/notes/${targetNoteId}`);
}

function formatDate(s) {
  return new Date(s).toLocaleString();
}

function getPreview(content) {
  if (!content) return '';
  return content.replace(/\n/g, ' ').slice(0, 140);
}
</script>

<template>
  <MobileLayout v-if="isMobile" title="Ideas">
    <main class="ideas-main" style="padding: 16px;">
      <div class="ideas-search">
        <Search :size="14" />
        <input v-model="searchQuery" class="ideas-search-input" type="text" placeholder="Search ideas..." />
        <button v-if="searchQuery" class="clear-btn" @click="searchQuery = ''"><X :size="14" /></button>
      </div>

      <div v-if="ideasStore.loading" class="loading">Loading...</div>
      <div v-else-if="filteredIdeas.length === 0" class="empty">
        <Lightbulb :size="48" />
        <p v-if="searchQuery">No ideas match "{{ searchQuery }}"</p>
        <p v-else>No ideas yet</p>
      </div>
      <div v-else class="ideas-list">
        <div v-for="idea in filteredIdeas" :key="idea.id" class="idea-card">
          <div class="idea-content" @click="openIdea(idea.id)">
            <div class="idea-title-row">
              <span class="idea-emoji-inline">💡</span>
              <span class="idea-title">{{ idea.title }}</span>
            </div>
            <div class="idea-preview">{{ getPreview(idea.content) }}</div>
            <div class="idea-time">{{ formatDate(idea.created_at) }}</div>
          </div>
          <div class="idea-actions">
            <button class="action-btn" @click.stop="openMergeModal(idea.id)" title="Move to note"><ArrowRight :size="14" /></button>
            <button class="action-btn promote-btn" @click.stop="openPromoteModal(idea.id)" title="Promote">Promote</button>
            <button class="action-btn delete-btn" @click.stop="discardIdea(idea.id)" title="Delete"><Trash2 :size="14" /></button>
          </div>
        </div>
      </div>
    </main>
  </MobileLayout>

  <div v-else class="ideas-layout">
    <AppSidebar />
    <main class="ideas-main">
      <div class="ideas-header">
        <span class="ideas-emoji">💡</span>
        <h2>Ideas</h2>
        <span class="ideas-count">{{ ideasStore.count }} item{{ ideasStore.count === 1 ? '' : 's' }}</span>
      </div>

      <div class="ideas-search">
        <Search :size="14" />
        <input
          v-model="searchQuery"
          class="ideas-search-input"
          type="text"
          placeholder="Search ideas..."
        />
        <button v-if="searchQuery" class="clear-btn" @click="searchQuery = ''">
          <X :size="14" />
        </button>
      </div>

      <div v-if="ideasStore.loading" class="loading">Loading...</div>

      <div v-else-if="filteredIdeas.length === 0" class="empty">
        <Lightbulb :size="48" />
        <p v-if="searchQuery">No ideas match "{{ searchQuery }}"</p>
        <p v-else>No ideas yet</p>
        <span v-if="!searchQuery">Press Alt+I to capture one</span>
      </div>

      <div v-else class="ideas-list">
        <div v-for="idea in filteredIdeas" :key="idea.id" class="idea-card">
          <div class="idea-content" @click="openIdea(idea.id)">
            <div class="idea-title-row">
              <span class="idea-emoji-inline">💡</span>
              <span class="idea-title">{{ idea.title }}</span>
            </div>
            <div class="idea-preview">{{ getPreview(idea.content) }}</div>
            <div class="idea-time">{{ formatDate(idea.created_at) }}</div>
          </div>
          <div class="idea-actions">
            <button class="action-btn" @click.stop="openIdea(idea.id)" title="Open">
              <FileText :size="14" />
            </button>
            <button class="action-btn" @click.stop="openMergeModal(idea.id)" title="Move to note">
              <ArrowRight :size="14" />
            </button>
            <button class="action-btn promote-btn" @click.stop="openPromoteModal(idea.id)" title="Promote to note">
              Promote
            </button>
            <button class="action-btn delete-btn" @click.stop="discardIdea(idea.id)" title="Delete">
              <Trash2 :size="14" />
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>

  <!-- Promote modal: notebook picker -->
    <Teleport to="body">
      <div v-if="promoteModal.show" class="modal-overlay" @click.self="promoteModal.show = false">
        <div class="picker-modal">
          <div class="picker-header">
            <span>Promote idea — pick a notebook</span>
            <button class="picker-close" @click="promoteModal.show = false"><X :size="16" /></button>
          </div>
          <div class="picker-list">
            <button
              v-for="nb in notebooksStore.notebooks"
              :key="nb.id"
              class="picker-item"
              @click="confirmPromote(nb.id)"
            >
              {{ nb.name }}<span v-if="nb.is_default" class="default-tag">default</span>
            </button>
            <div v-if="notebooksStore.notebooks.length === 0" class="picker-empty">No notebooks — create one first</div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Merge modal: note search picker -->
    <Teleport to="body">
      <div v-if="mergeModal.show" class="modal-overlay" @click.self="mergeModal.show = false">
        <div class="picker-modal">
          <div class="picker-header">
            <span>Move idea to note — pick target</span>
            <button class="picker-close" @click="mergeModal.show = false"><X :size="16" /></button>
          </div>
          <div class="picker-search">
            <Search :size="14" />
            <input
              v-model="mergeModal.query"
              class="picker-search-input"
              type="text"
              placeholder="Search notes..."
              autofocus
              @input="onMergeSearchInput"
            />
          </div>
          <div class="picker-list">
            <div v-if="mergeModal.loading" class="picker-empty">Searching...</div>
            <button
              v-for="note in mergeModal.results"
              :key="note.id"
              class="picker-item"
              @click="confirmMerge(note.id)"
            >
              <div class="picker-item-title">{{ note.title }}</div>
              <div class="picker-item-preview">{{ getPreview(note.content) }}</div>
            </button>
            <div v-if="!mergeModal.loading && mergeModal.query && mergeModal.results.length === 0" class="picker-empty">
              No notes match
            </div>
            <div v-if="!mergeModal.query" class="picker-empty">Type to search notes</div>
          </div>
        </div>
      </div>
    </Teleport>
</template>

<style scoped>
.ideas-layout {
  display: flex;
  height: 100vh;
}

.ideas-main {
  flex: 1;
  padding: 24px 32px;
  overflow-y: auto;
}

.ideas-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.ideas-header h2 { margin: 0; }
.ideas-emoji { font-size: 22px; }
.ideas-count {
  font-size: 12px;
  color: var(--text-muted);
  margin-left: auto;
}

.ideas-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  margin-bottom: 16px;
  color: var(--text-muted);
}
.ideas-search-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
}
.clear-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
}
.clear-btn:hover { color: var(--text-primary); }

.loading, .empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  color: var(--text-muted);
  gap: 8px;
}
.empty span { font-size: 12px; }

.ideas-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.idea-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
}

.idea-content {
  flex: 1;
  cursor: pointer;
  min-width: 0;
}

.idea-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.idea-emoji-inline { font-size: 14px; }
.idea-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.idea-preview {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.idea-time {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}

.idea-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  color: var(--text-muted);
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  cursor: pointer;
}
.action-btn:hover {
  border-color: var(--accent-primary);
  color: var(--text-primary);
}
.promote-btn { padding: 5px 10px; }
.delete-btn:hover {
  border-color: var(--status-error);
  color: var(--status-error);
}

/* Picker modals */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-modal);
  display: flex;
  justify-content: center;
  padding-top: 15vh;
  z-index: 1500;
}

.picker-modal {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  width: 480px;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle);
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.picker-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
}

.picker-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-muted);
}

.picker-search-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
}

.picker-list {
  overflow-y: auto;
  padding: 4px;
  flex: 1;
}

.picker-item {
  display: block;
  width: 100%;
  padding: 10px 12px;
  background: none;
  border: none;
  border-radius: 6px;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.picker-item:hover {
  background: rgba(58, 134, 255, 0.1);
  color: var(--text-primary);
}
.picker-item-title { font-weight: 500; color: var(--text-primary); }
.picker-item-preview {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.default-tag {
  margin-left: 8px;
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
}

.picker-empty {
  padding: 16px;
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
}
</style>
