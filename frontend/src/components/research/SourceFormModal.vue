<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useResearchStore } from '../../stores/research.js';
import {
  SOURCE_KINDS, parseAuthorsInput, authorsToInput, parsePublishedInput, publishedToInput
} from '../../lib/citation.js';
import { DownloadCloud } from 'lucide-vue-next';

// CR039 A1 — create a source by hand, or edit an existing source's citation
// metadata. Editing never touches the body (read-only after capture).
const props = defineProps({
  source: { type: Object, default: null },
  defaultChapterId: { type: String, default: null }
});
const emit = defineEmits(['saved', 'cancel']);

const router = useRouter();
const research = useResearchStore();
const isEdit = computed(() => !!props.source);

const s = props.source || {};
const form = ref({
  source_kind: s.source_kind || 'web',
  title: s.title || '',
  authors: authorsToInput(s.authors),
  container: s.container || '',
  publisher: s.publisher || '',
  published: publishedToInput(s.published_date, s.published_precision),
  volume: s.volume || '',
  issue: s.issue || '',
  pages: s.pages || '',
  url: s.url || '',
  doi: s.doi || '',
  isbn: s.isbn || '',
  content: '',
  chapterIds: props.defaultChapterId ? [props.defaultChapterId] : []
});

const saving = ref(false);
const error = ref('');
const existing = ref(null); // { note_id, in_trash } from a 409 source_exists

const showJournalFields = computed(() => ['journal', 'book_chapter'].includes(form.value.source_kind));
const showBookFields = computed(() => ['book', 'book_chapter'].includes(form.value.source_kind));

function nullIfBlank(v) {
  const t = (v || '').trim();
  return t ? t : null;
}

// A3 (§16 #14) — "Fetch details": the server reads the page's citation metadata
// with the clipper's extractor. Only empty fields are filled, so nothing the
// user typed is overwritten; a URL typed into Title counts as empty.
const fetching = ref(false);
const fetchNote = ref('');
const looksLikeUrl = (v) => /^https?:\/\/\S+$/i.test((v || '').trim());
const titleIsUrl = computed(() => !form.value.url.trim() && looksLikeUrl(form.value.title));

function moveTitleToUrl() {
  form.value.url = form.value.title.trim();
  form.value.title = '';
  fetchDetails();
}

async function fetchDetails() {
  const url = form.value.url.trim();
  if (!url) return;
  fetching.value = true;
  fetchNote.value = '';
  error.value = '';
  try {
    const m = await research.fetchMetadata(url);
    const f = form.value;
    const fill = (key, value) => { if (value && !String(f[key] || '').trim()) f[key] = value; };
    if (!f.title.trim() || looksLikeUrl(f.title)) f.title = m.title || f.title;
    fill('authors', authorsToInput(m.authors));
    fill('container', m.container);
    fill('publisher', m.publisher);
    fill('published', m.published);
    fill('volume', m.volume);
    fill('issue', m.issue);
    fill('pages', m.pages);
    fill('doi', m.doi);
    fill('isbn', m.isbn);
    if (!isEdit.value && m.source_kind) f.source_kind = m.source_kind;
    if (m.url) f.url = m.url;
    fetchNote.value = 'Filled from the page — check the fields before saving.';
  } catch (err) {
    error.value = err.message || 'Could not read details from that page.';
  } finally {
    fetching.value = false;
  }
}

async function save() {
  error.value = '';
  existing.value = null;
  const published = parsePublishedInput(form.value.published);
  if (published === null) {
    error.value = 'Date must be YYYY, YYYY-MM or YYYY-MM-DD.';
    return;
  }
  if (!form.value.title.trim()) {
    error.value = 'Title is required.';
    return;
  }
  const payload = {
    source_kind: form.value.source_kind,
    title: form.value.title.trim(),
    authors: parseAuthorsInput(form.value.authors),
    container: nullIfBlank(form.value.container),
    publisher: nullIfBlank(form.value.publisher),
    volume: nullIfBlank(form.value.volume),
    issue: nullIfBlank(form.value.issue),
    pages: nullIfBlank(form.value.pages),
    url: nullIfBlank(form.value.url),
    doi: nullIfBlank(form.value.doi),
    isbn: nullIfBlank(form.value.isbn),
    ...published
  };

  saving.value = true;
  try {
    let saved;
    if (isEdit.value) {
      saved = await research.updateSource(props.source.note_id, payload);
    } else {
      saved = await research.createSource({
        ...payload,
        content: form.value.content,
        chapter_ids: form.value.chapterIds
      });
    }
    emit('saved', saved);
  } catch (err) {
    if (err.status === 409 && err.body?.error === 'source_exists') {
      existing.value = err.body.data;
    }
    error.value = err.message || 'Could not save the source.';
  } finally {
    saving.value = false;
  }
}

// Focus the title on open and give focus back to the opener on close.
const titleInput = ref(null);
let opener = null;
onMounted(() => {
  opener = document.activeElement;
  titleInput.value?.focus();
});
onBeforeUnmount(() => opener?.focus?.());

// Close only when the press both starts and ends on the backdrop, so a text
// selection dragged out of an input doesn't discard the form.
let pressedBackdrop = false;
function onBackdropUp(e) {
  if (pressedBackdrop && e.target === e.currentTarget) emit('cancel');
  pressedBackdrop = false;
}

function openExisting() {
  emit('cancel');
  router.push(existing.value.in_trash ? '/trash' : `/notes/${existing.value.note_id}`);
}
</script>

<template>
  <Teleport to="body">
    <div
      class="sf-overlay"
      @mousedown="pressedBackdrop = $event.target === $event.currentTarget"
      @mouseup="onBackdropUp"
      @keydown.esc="emit('cancel')"
    >
      <form class="sf-modal" role="dialog" aria-modal="true" aria-labelledby="sf-heading" @submit.prevent="save">
        <h3 id="sf-heading">{{ isEdit ? 'Edit citation' : 'New source' }}</h3>

        <div class="sf-row">
          <label class="sf-field sf-kind">
            <span>Kind</span>
            <select v-model="form.source_kind">
              <option v-for="k in SOURCE_KINDS" :key="k.value" :value="k.value">{{ k.label }}</option>
            </select>
          </label>
          <label class="sf-field sf-grow">
            <span>Title</span>
            <input ref="titleInput" v-model="form.title" type="text" required maxlength="1000" placeholder="The Bitter Lesson, or paste a URL" />
            <button v-if="titleIsUrl" type="button" class="sf-link sf-title-hint" @click="moveTitleToUrl">
              That's a link — use it as the URL and fetch details
            </button>
          </label>
        </div>

        <label class="sf-field">
          <span>Authors <small>one per line — "Family, Given", or an organization name</small></span>
          <textarea v-model="form.authors" rows="2" placeholder="Sutton, Rich" />
        </label>

        <div class="sf-row">
          <label class="sf-field sf-grow">
            <span>{{ form.source_kind === 'journal' ? 'Journal' : form.source_kind === 'book_chapter' ? 'Book title' : 'Publication / site' }}</span>
            <input v-model="form.container" type="text" maxlength="500" />
          </label>
          <label class="sf-field sf-date">
            <span>Published <small>YYYY[-MM[-DD]]</small></span>
            <input v-model="form.published" type="text" placeholder="2019-03-13" />
          </label>
        </div>

        <div v-if="showBookFields || form.source_kind === 'pdf_report'" class="sf-row">
          <label class="sf-field sf-grow">
            <span>Publisher</span>
            <input v-model="form.publisher" type="text" maxlength="500" />
          </label>
          <label v-if="showBookFields" class="sf-field">
            <span>ISBN</span>
            <input v-model="form.isbn" type="text" maxlength="50" />
          </label>
        </div>

        <div v-if="showJournalFields" class="sf-row">
          <label class="sf-field"><span>Volume</span><input v-model="form.volume" type="text" maxlength="50" /></label>
          <label class="sf-field"><span>Issue</span><input v-model="form.issue" type="text" maxlength="50" /></label>
          <label class="sf-field"><span>Pages</span><input v-model="form.pages" type="text" maxlength="50" /></label>
          <label class="sf-field sf-grow"><span>DOI</span><input v-model="form.doi" type="text" maxlength="200" /></label>
        </div>

        <label class="sf-field">
          <span>URL</span>
          <div class="sf-url">
            <input v-model="form.url" type="url" maxlength="2000" placeholder="https://" @keydown.enter.prevent="fetchDetails" />
            <button type="button" class="sf-btn" :disabled="!form.url.trim() || fetching"
                    title="Read title, authors, date and publication from the page" @click="fetchDetails">
              <DownloadCloud :size="14" /> {{ fetching ? 'Fetching…' : 'Fetch details' }}
            </button>
          </div>
          <small v-if="fetchNote" class="sf-note" role="status">{{ fetchNote }}</small>
        </label>

        <template v-if="!isEdit">
          <fieldset v-if="research.chapters.length" class="sf-field sf-fieldset">
            <legend>Chapters</legend>
            <div class="sf-chapters">
              <label v-for="c in research.chapters" :key="c.id" class="sf-chip">
                <input v-model="form.chapterIds" type="checkbox" :value="c.id" />
                {{ c.label }} · {{ c.title }}
              </label>
            </div>
          </fieldset>
          <label class="sf-field">
            <span>Body <small>optional — the text you are citing; read-only once saved</small></span>
            <textarea v-model="form.content" rows="5" />
          </label>
        </template>

        <p v-if="error" class="sf-error" role="alert">
          {{ error }}
          <button v-if="existing" type="button" class="sf-link" @click="openExisting">
            {{ existing.in_trash ? 'Open Trash' : 'Open existing source' }}
          </button>
        </p>

        <div class="sf-actions">
          <button type="button" class="sf-btn" @click="emit('cancel')">Cancel</button>
          <button type="submit" class="sf-btn sf-primary" :disabled="saving">
            {{ saving ? 'Saving…' : isEdit ? 'Save' : 'Create source' }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
.sf-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-modal);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 6vh 16px;
  z-index: 1000;
  overflow-y: auto;
}
.sf-modal {
  background: var(--bg-card);
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  box-shadow: var(--shadow-md);
  width: min(640px, 100%);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--text-primary);
}
.sf-modal h3 { margin: 0 0 4px; font-size: 16px; }
.sf-row { display: flex; gap: 10px; flex-wrap: wrap; }
.sf-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-secondary); min-width: 0; }
.sf-field small { color: var(--text-muted); font-weight: normal; }
.sf-grow { flex: 1 1 220px; }
.sf-kind { flex: 0 0 150px; }
.sf-date { flex: 0 0 150px; }
.sf-field input, .sf-field select, .sf-field textarea {
  background: var(--bg-main);
  color: var(--text-primary);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  padding: 7px 9px;
  font: inherit;
  font-size: 13px;
}
.sf-field textarea { resize: vertical; }
.sf-fieldset { border: none; margin: 0; padding: 0; }
.sf-fieldset legend { padding: 0; margin-bottom: 4px; }
.sf-chapters { display: flex; flex-wrap: wrap; gap: 6px; }
.sf-chip {
  display: inline-flex; align-items: center; gap: 4px;
  border: 1px solid var(--border-subtle); border-radius: 999px;
  padding: 3px 10px; font-size: 12px; color: var(--text-primary); cursor: pointer;
}
.sf-url { display: flex; gap: 6px; }
.sf-url input { flex: 1; min-width: 0; }
.sf-url .sf-btn { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.sf-note { color: var(--status-success); font-size: 12px; }
.sf-title-hint { align-self: flex-start; padding: 0; margin-top: 2px; }
.sf-error { margin: 0; color: var(--status-error); font-size: 12px; }
.sf-link { background: none; border: none; color: var(--accent-primary); cursor: pointer; text-decoration: underline; font-size: 12px; }
.sf-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.sf-btn {
  background: transparent; color: var(--text-primary);
  border: 1px solid var(--border-strong); border-radius: 6px;
  padding: 7px 14px; font-size: 13px; cursor: pointer;
}
.sf-primary { background: var(--accent-primary); border-color: var(--accent-primary); color: #fff; }
.sf-btn:disabled { opacity: 0.6; cursor: default; }
</style>
