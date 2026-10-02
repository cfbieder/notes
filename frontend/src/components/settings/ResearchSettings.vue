<script setup>
import { ref, onMounted } from 'vue';
import { BookOpen, ArrowUp, ArrowDown, Trash2, Check } from 'lucide-vue-next';
import { useResearchStore } from '../../stores/research.js';
import { useToastsStore } from '../../stores/toasts.js';
import ConfirmModal from '../ui/ConfirmModal.vue';

// CR039 A1 — Settings → Research: books and the active book's chapter outline.
// Creating the first book is what makes the Research rail item appear.
const research = useResearchStore();
const toasts = useToastsStore();

const newBookTitle = ref('');
const newChapter = ref({ label: '', title: '', part: '' });
const editing = ref({}); // chapterId → { label, title, part }
const confirm = ref(null); // { title, message, action }
const reordering = ref(false);

function fail(err, fallback) {
  toasts.addToast({ message: err?.message || fallback, type: 'error' });
}

async function addBook() {
  const title = newBookTitle.value.trim();
  if (!title) return;
  try {
    await research.createBook(title);
    newBookTitle.value = '';
  } catch (err) { fail(err, 'Could not create the book'); }
}

async function activate(book) {
  try { await research.updateBook(book.id, { is_active: true }); } catch (err) { fail(err, 'Could not switch books'); }
}

async function renameBook(book, input) {
  const t = input.value.trim();
  if (!t) { input.value = book.title; return; }
  if (t === book.title) return;
  try { await research.updateBook(book.id, { title: t }); } catch (err) { fail(err, 'Could not rename the book'); }
}

function askDeleteBook(book) {
  confirm.value = {
    title: 'Delete book?',
    message: `Delete "${book.title}" and all its chapters? Sources stay in your library, unassigned from this book's chapters.`,
    action: async () => {
      try { await research.deleteBook(book.id); } catch (err) { fail(err, 'Could not delete the book'); }
    }
  };
}

async function addChapter() {
  const { label, title, part } = newChapter.value;
  if (!label.trim() || !title.trim()) return;
  try {
    await research.createChapter({ label: label.trim(), title: title.trim(), part: part.trim() || null });
    newChapter.value = { label: '', title: '', part: '' };
  } catch (err) { fail(err, 'Could not add the chapter'); }
}

function cancelEdit(c) {
  const { [c.id]: _, ...rest } = editing.value;
  editing.value = rest;
}

function startEdit(c) {
  editing.value = { ...editing.value, [c.id]: { label: c.label, title: c.title, part: c.part || '' } };
}

async function saveEdit(c) {
  const e = editing.value[c.id];
  try {
    await research.updateChapter(c.id, { label: e.label.trim(), title: e.title.trim(), part: e.part.trim() || null });
    cancelEdit(c);
  } catch (err) { fail(err, 'Could not save the chapter'); }
}

async function move(index, delta) {
  const ids = research.chapters.map(c => c.id);
  const target = index + delta;
  if (target < 0 || target >= ids.length) return;
  [ids[index], ids[target]] = [ids[target], ids[index]];
  reordering.value = true;
  try { await research.reorderChapters(ids); } catch (err) { fail(err, 'Could not reorder'); } finally { reordering.value = false; }
}

async function deleteChapter(c) {
  try {
    await research.deleteChapter(c.id);
  } catch (err) {
    if (err.status === 409 && err.body?.error === 'chapter_has_assignments') {
      confirm.value = {
        title: 'Delete chapter?',
        message: `Chapter ${c.label} has ${err.body.data.assignments} source(s) assigned. Delete it anyway? The sources stay in your library.`,
        action: async () => {
          try { await research.deleteChapter(c.id, true); } catch (e) { fail(e, 'Could not delete the chapter'); }
        }
      };
    } else {
      fail(err, 'Could not delete the chapter');
    }
  }
}

async function runConfirm() {
  const action = confirm.value.action;
  confirm.value = null;
  await action();
}

onMounted(() => {
  research.ensureLoaded().catch(err => fail(err, 'Could not load books'));
  // The Research panel links here as /settings#research.
  if (window.location.hash === '#research') {
    requestAnimationFrame(() => document.getElementById('research')?.scrollIntoView({ block: 'start' }));
  }
});
</script>

<template>
  <section id="research" class="settings-section">
    <h3><BookOpen :size="16" /> Research</h3>
    <p class="section-desc">
      Books and chapters for research sources. Creating a book adds Research to the activity rail;
      sources are assigned to the active book's chapters.
    </p>

    <div class="rs-block">
      <div v-for="b in research.books" :key="b.id" class="rs-book">
        <input class="rs-input rs-grow" :value="b.title" @change="renameBook(b, $event.target)" :aria-label="`Book title: ${b.title}`" />
        <span v-if="b.is_active" class="rs-active"><Check :size="12" /> Active</span>
        <button v-else class="rs-btn" @click="activate(b)">Make active</button>
        <button class="rs-icon" title="Delete book" :aria-label="`Delete book ${b.title}`" @click="askDeleteBook(b)"><Trash2 :size="14" /></button>
      </div>
      <form class="rs-book" @submit.prevent="addBook">
        <input v-model="newBookTitle" class="rs-input rs-grow" placeholder="New book title" maxlength="500" aria-label="New book title" />
        <button class="rs-btn" type="submit" :disabled="!newBookTitle.trim()">Add book</button>
      </form>
    </div>

    <template v-if="research.activeBook">
      <h4 class="rs-sub">Chapters — {{ research.activeBook.title }}</h4>
      <div class="rs-block">
        <div v-for="(c, i) in research.chapters" :key="c.id" class="rs-chapter">
          <form v-if="editing[c.id]" class="rs-chapter rs-edit" @submit.prevent="saveEdit(c)" @keydown.esc="cancelEdit(c)">
            <input v-model="editing[c.id].label" class="rs-input rs-label" maxlength="50" aria-label="Chapter number" />
            <input v-model="editing[c.id].title" class="rs-input rs-grow" maxlength="500" aria-label="Chapter title" />
            <input v-model="editing[c.id].part" class="rs-input rs-part" placeholder="Part (optional)" maxlength="200" aria-label="Part" />
            <button class="rs-btn" type="submit">Save</button>
            <button class="rs-btn" type="button" @click="cancelEdit(c)">Cancel</button>
          </form>
          <template v-else>
            <span class="rs-ch-label">{{ c.label }}</span>
            <button class="rs-ch-title" title="Edit chapter" @click="startEdit(c)">
              {{ c.title }}<span v-if="c.part" class="rs-ch-part"> · {{ c.part }}</span>
            </button>
            <span class="rs-count">{{ c.source_count }} src</span>
            <button class="rs-icon" title="Move up" :aria-label="`Move chapter ${c.label} up`" :disabled="i === 0 || reordering" @click="move(i, -1)"><ArrowUp :size="14" /></button>
            <button class="rs-icon" title="Move down" :aria-label="`Move chapter ${c.label} down`" :disabled="i === research.chapters.length - 1 || reordering" @click="move(i, 1)"><ArrowDown :size="14" /></button>
            <button class="rs-icon" title="Delete chapter" :aria-label="`Delete chapter ${c.label}`" @click="deleteChapter(c)"><Trash2 :size="14" /></button>
          </template>
        </div>
        <form class="rs-chapter" @submit.prevent="addChapter">
          <input v-model="newChapter.label" class="rs-input rs-label" placeholder="No." maxlength="50" aria-label="New chapter number" />
          <input v-model="newChapter.title" class="rs-input rs-grow" placeholder="Chapter title" maxlength="500" aria-label="New chapter title" />
          <input v-model="newChapter.part" class="rs-input rs-part" placeholder="Part (optional)" maxlength="200" aria-label="New chapter part" />
          <button class="rs-btn" type="submit" :disabled="!newChapter.label.trim() || !newChapter.title.trim()">Add</button>
        </form>
      </div>
    </template>

    <ConfirmModal
      v-if="confirm"
      :title="confirm.title"
      :message="confirm.message"
      confirmText="Delete"
      danger
      @confirm="runConfirm"
      @cancel="confirm = null"
    />
  </section>
</template>

<style scoped>
.rs-block { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.rs-sub { margin: 18px 0 0; font-size: 13px; color: var(--text-secondary); font-weight: 600; }
.rs-book, .rs-chapter { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.rs-edit { flex: 1; margin: 0; }
@media (pointer: coarse) { .rs-icon { padding: 9px; } }
.rs-input {
  background: var(--bg-main); color: var(--text-primary);
  border: 1px solid var(--border-strong); border-radius: 6px; padding: 6px 8px; font-size: 13px; min-width: 0;
}
.rs-grow { flex: 1 1 200px; }
.rs-label { flex: 0 0 64px; }
.rs-part { flex: 0 1 160px; }
.rs-btn {
  background: transparent; color: var(--text-primary); border: 1px solid var(--border-strong);
  border-radius: 6px; padding: 5px 10px; font-size: 12px; cursor: pointer; white-space: nowrap;
}
.rs-btn:disabled { opacity: 0.5; cursor: default; }
.rs-icon {
  background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; display: inline-flex; border-radius: 4px;
}
.rs-icon:hover:not(:disabled) { background: var(--hover-bg); color: var(--text-primary); }
.rs-icon:disabled { opacity: 0.3; cursor: default; }
.rs-active { display: inline-flex; align-items: center; gap: 3px; font-size: 12px; color: var(--status-success); }
.rs-ch-label { flex: 0 0 40px; color: var(--text-muted); font-size: 13px; font-variant-numeric: tabular-nums; }
.rs-ch-title {
  flex: 1 1 200px; min-width: 0; text-align: left; background: none; border: none; padding: 4px 0;
  color: var(--text-primary); font-size: 13px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.rs-ch-part { color: var(--text-muted); }
.rs-count { font-size: 11px; color: var(--text-muted); }
</style>
