<script setup>
// CR041 — confirm screen for content shared to the installed PWA.
// public/share-target-sw.js parks the share in Cache Storage and redirects
// here with ?id=<key>; this page uploads it with the user's session.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, OfflineError } from '../api/client.js';
import { loadPendingShare, deletePendingShare, setShareOrphan } from '../lib/pendingShares.js';
import { FileText, Loader } from 'lucide-vue-next';

const MAX_FILE_BYTES = 25 * 1024 * 1024; // matches backend MAX_FILE_SIZE default

const route = useRoute();
const router = useRouter();

const key = route.query.id;
const loaded = ref(false);
const files = ref([]);
const previews = ref([]);
const caption = ref('');
const noteType = ref('note'); // 'note' | 'idea'
const saving = ref(false);
const error = ref(route.query.error ? 'Could not receive the shared content. Please share again.' : '');
const offline = ref(false);
let orphan = null; // { noteId, attachmentIds } from an earlier failed Save

const tooLarge = computed(() => files.value.find((f) => f.size > MAX_FILE_BYTES));
const canSave = computed(() =>
  !saving.value && !tooLarge.value && (files.value.length > 0 || caption.value.trim())
);

onMounted(async () => {
  if (key) {
    const share = await loadPendingShare(key).catch(() => null);
    if (share) {
      files.value = share.files;
      previews.value = share.files.map((f) => URL.createObjectURL(f));
      orphan = share.orphan;
      // Apps often repeat the URL inside `text`; drop the separate URL then.
      const title = share.title.trim();
      const text = share.text.trim();
      const url = share.url.trim();
      caption.value = [title, text !== title ? text : '', url && !text.includes(url) ? url : '']
        .filter(Boolean)
        .join('\n');
    } else if (!error.value) {
      error.value = 'This share is no longer pending.';
    }
  } else if (!error.value) {
    error.value = 'Nothing to share.';
  }
  loaded.value = true;
});

onBeforeUnmount(() => previews.value.forEach((u) => URL.revokeObjectURL(u)));

function defaultTitle() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `Screenshot ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isOffline(err) {
  return err instanceof OfflineError || err instanceof TypeError || !navigator.onLine;
}

// Delete a half-made note and its uploaded files (DELETE /attachments/:id
// unlinks the file; permanent note delete alone would leave it on disk).
// A 404 means it's already gone — treat that as done.
async function rollback({ noteId, attachmentIds }) {
  const gone = (err) => { if (err.status !== 404) throw err; };
  for (const id of attachmentIds) await api.delete(`/attachments/${id}`).catch(gone);
  await api.delete(`/notes/${noteId}`).catch(gone);
  await api.delete(`/notes/${noteId}/permanent`).catch(gone);
}

async function handleSave() {
  if (!canSave.value) return;
  error.value = '';
  offline.value = false;
  if (!navigator.onLine) { offline.value = true; return; }

  saving.value = true;
  const text = caption.value.trim();
  const progress = { noteId: null, attachmentIds: [] };
  try {
    if (orphan) {
      await rollback(orphan);
      orphan = null;
      await setShareOrphan(key, null);
    }

    const payload = {
      title: (text.split('\n')[0].slice(0, 80)) || (files.value.length ? defaultTitle() : 'Untitled'),
      content: text
    };
    if (noteType.value === 'idea') payload.note_type = 'idea';
    const { data: note } = await api.post('/notes', payload);
    progress.noteId = note.id;

    const refs = [];
    for (const file of files.value) {
      const { data: att } = await api.upload(`/notes/${note.id}/attachments`, file);
      progress.attachmentIds.push(att.id);
      refs.push(`![${att.filename}](/api/v1/attachments/${att.id})`);
    }
    if (refs.length) {
      await api.put(`/notes/${note.id}`, { content: [text, ...refs].filter(Boolean).join('\n\n') });
    }

    await deletePendingShare(key);
    router.replace(noteType.value === 'idea' ? `/ideas/${note.id}` : `/notes/${note.id}`);
  } catch (err) {
    if (progress.noteId) {
      try {
        await rollback(progress);
      } catch {
        // Couldn't reach the server to undo — remember it so the next Save cleans up first.
        orphan = progress;
        await setShareOrphan(key, progress).catch(() => {});
      }
    }
    if (err.status === 401) {
      router.replace({ name: 'Login', query: { redirect: route.fullPath } });
    } else if (isOffline(err)) {
      offline.value = true;
    } else {
      error.value = err.body?.message || err.message || 'Save failed';
    }
  } finally {
    saving.value = false;
  }
}

async function handleCancel() {
  if (key) await deletePendingShare(key).catch(() => {});
  router.replace('/inbox');
}

function keepForLater() {
  router.replace('/home');
}

function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
</script>

<template>
  <div class="share-page">
    <header class="share-header">
      <h1>Share to Noted</h1>
    </header>

    <div v-if="!loaded" class="share-loading" role="status" aria-label="Loading share">
      <Loader :size="24" class="spin" />
    </div>

    <template v-else>
      <div v-if="files.length" class="share-previews">
        <figure v-for="(file, i) in files" :key="i" class="share-preview">
          <img :src="previews[i]" :alt="file.name" />
          <figcaption>{{ file.name }} · {{ formatSize(file.size) }}</figcaption>
        </figure>
      </div>

      <template v-if="files.length || caption || key">
        <div class="share-types" role="group" aria-label="Save as">
          <button class="type-btn" :class="{ active: noteType === 'note' }" :aria-pressed="noteType === 'note'" @click="noteType = 'note'">
            <FileText :size="14" /> Note
          </button>
          <button class="type-btn" :class="{ active: noteType === 'idea' }" :aria-pressed="noteType === 'idea'" @click="noteType = 'idea'">
            <span class="idea-emoji" aria-hidden="true">💡</span> Idea
          </button>
        </div>

        <textarea
          v-model="caption"
          class="share-caption"
          aria-label="Caption"
          placeholder="Add a caption (optional)"
          rows="4"
        />
      </template>

      <div aria-live="polite">
        <p v-if="tooLarge" class="share-msg share-error">
          {{ tooLarge.name }} is larger than 25 MB and can't be uploaded.
        </p>
        <p v-if="offline" class="share-msg share-offline">
          You're offline. This share is saved on this device. Tap Save when you're back online,
          or “Keep for later” to find it on the Home screen.
        </p>
        <p v-if="error" class="share-msg share-error">{{ error }}</p>
      </div>

      <div class="share-actions">
        <button class="btn-cancel" :disabled="saving" @click="handleCancel">
          {{ key ? 'Discard' : 'Close' }}
        </button>
        <span class="spacer" />
        <button v-if="key" class="btn-cancel" :disabled="saving" @click="keepForLater">Keep for later</button>
        <button v-if="key" class="btn-save" :disabled="!canSave" @click="handleSave">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.share-page {
  min-height: 100dvh;
  max-width: 560px;
  margin: 0 auto;
  background: var(--bg-main);
  padding: calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom));
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.share-header h1 { font-size: 20px; margin: 8px 0 4px; }
.share-loading { display: flex; justify-content: center; padding: 40px; color: var(--text-muted); }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }

.share-previews { display: flex; flex-direction: column; gap: 10px; }
.share-preview {
  margin: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  overflow: hidden;
}
.share-preview img { display: block; width: 100%; max-height: 50vh; object-fit: contain; background: var(--bg-main); }
.share-preview figcaption { padding: 6px 10px; font-size: 12px; color: var(--text-muted); overflow-wrap: anywhere; }

.share-types { display: flex; gap: 8px; }
.type-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: 44px;
  padding: 0 16px;
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  cursor: pointer;
}
.type-btn.active { border-color: var(--accent-primary); color: var(--text-primary); background: var(--hover-bg); }
.idea-emoji { font-size: 14px; line-height: 1; }

.share-caption {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  resize: vertical;
}

.share-msg { margin: 0; font-size: 13px; line-height: 1.4; }
.share-error { color: var(--status-error); }
.share-offline { color: var(--accent-warn); }

.share-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.spacer { flex: 1; }
.btn-cancel, .btn-save {
  min-height: 44px;
  padding: 0 18px;
  border-radius: 8px;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.btn-cancel { background: none; border: 1px solid var(--border-subtle); color: var(--text-secondary); }
.btn-save { background: var(--accent-primary); border: none; color: var(--on-accent, #fff); }
.btn-save:disabled, .btn-cancel:disabled { opacity: 0.5; cursor: default; }
</style>
