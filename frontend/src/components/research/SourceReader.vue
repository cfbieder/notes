<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import MarkdownIt from 'markdown-it';
import { BookOpen, Pencil, CheckCircle2, X, ExternalLink, ArrowLeft, FileText, Sparkles } from 'lucide-vue-next';
import { getAccessToken } from '../../api/client.js';
import { useResearchStore } from '../../stores/research.js';
import { useToastsStore } from '../../stores/toasts.js';
import SourceFormModal from './SourceFormModal.vue';
import { SOURCE_KINDS, STATUS_LABELS, formatAuthors, formatPublished } from '../../lib/citation.js';

// CR039 A1 — Reader view for a source note: citation card + read-only body.
// Sources never open in an editor; their body changes only via replace-body.
const props = defineProps({
  noteId: { type: String, required: true },
  content: { type: String, default: '' }
});

const research = useResearchStore();
const toasts = useToastsStore();

// html:false — the body is rendered text only, so no raw HTML reaches v-html.
const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true });
const renderedBody = computed(() => md.render(props.content || ''));

const source = ref(null);
const aiBusy = ref(false);

// A3 §9 — which fields the AI filled (flagged until Verify), and whether a
// just-uploaded PDF is still being read: the upload answers before the AI does.
const FIELD_LABELS = {
  title: 'title', authors: 'authors', container: 'publication', publisher: 'publisher', volume: 'volume',
  issue: 'issue', pages: 'pages', published_date: 'date', doi: 'DOI', isbn: 'ISBN', source_kind: 'kind'
};
const aiFields = computed(() => (source.value?.metadata_llm_fields || []).map(f => FIELD_LABELS[f] || f));
const aiError = computed(() => source.value?.metadata_raw?.llm_error || '');
const aiReading = computed(() => {
  const s = source.value;
  if (!s?.pdf_attachment_id || s.metadata_status === 'verified') return false;
  const raw = s.metadata_raw || {};
  const ageMs = Date.now() - new Date(s.created_at).getTime();
  return !raw.llm && !raw.llm_error && ageMs < 3 * 60 * 1000;
});
let pollTimer = null;
function schedulePoll() {
  clearTimeout(pollTimer);
  if (aiReading.value) pollTimer = setTimeout(async () => { await load(); schedulePoll(); }, 4000);
}
onBeforeUnmount(() => clearTimeout(pollTimer));

async function fillWithAi() {
  aiBusy.value = true;
  try {
    const res = await research.extractMetadata(props.noteId);
    source.value = res.source;
    if (res.error) toasts.addToast({ message: `AI couldn't fill the citation: ${res.error}`, type: 'error' });
    else if (!res.filled.length) toasts.addToast({ message: 'AI found nothing new to fill', type: 'info' });
    else toasts.addToast({ message: `AI filled ${res.filled.length} field${res.filled.length === 1 ? '' : 's'} — check them, then Verify`, type: 'success' });
  } catch (err) {
    toasts.addToast({ message: err.message || 'AI request failed', type: 'error' });
  } finally {
    aiBusy.value = false;
  }
}
const loadError = ref('');
const editing = ref(false);
const addChapterId = ref('');

const kindLabel = computed(() => SOURCE_KINDS.find(k => k.value === source.value?.source_kind)?.label || '');
const byline = computed(() => {
  if (!source.value) return '';
  return [formatAuthors(source.value.authors), formatPublished(source.value.published_date, source.value.published_precision),
    source.value.container].filter(Boolean).join(' · ');
});
const unassignedChapters = computed(() => {
  const assigned = new Set((source.value?.chapters || []).map(c => c.id));
  return research.chapters.filter(c => !assigned.has(c.id));
});

// Parents key this component by note id, so a tab switch remounts it rather
// than showing the previous source's card.
async function load() {
  loadError.value = '';
  try {
    source.value = await research.getSource(props.noteId);
  } catch (err) {
    source.value = null;
    loadError.value = err.message || 'Could not load the citation';
  }
}

// Open the source's PDF without putting the token in a URL (CR009): fetch it
// with the auth header and open the blob. The tab is opened first, inside the
// click, so popup blockers allow it.
async function openPdf() {
  const tab = window.open('', '_blank');
  try {
    const res = await fetch(`/api/v1/attachments/${source.value.pdf_attachment_id}`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` }
    });
    if (!res.ok) throw new Error(`Could not open the PDF (${res.status})`);
    const url = URL.createObjectURL(await res.blob());
    if (tab) tab.location = url; else window.location = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    tab?.close();
    toasts.addToast({ message: err.message || 'Could not open the PDF', type: 'error' });
  }
}

async function verify() {
  try {
    source.value = await research.updateSource(props.noteId, {});
    toasts.addToast({ message: 'Citation marked verified', type: 'success' });
  } catch (err) {
    toasts.addToast({ message: err.message || 'Could not verify', type: 'error' });
  }
}

async function assign() {
  if (!addChapterId.value) return;
  try {
    source.value = await research.assignChapter(props.noteId, addChapterId.value);
  } catch (err) {
    toasts.addToast({ message: err.message || 'Could not assign the chapter', type: 'error' });
  } finally {
    addChapterId.value = '';
  }
}

async function unassign(chapterId) {
  try {
    await research.unassignChapter(props.noteId, chapterId);
    source.value = { ...source.value, chapters: source.value.chapters.filter(c => c.id !== chapterId) };
  } catch (err) {
    toasts.addToast({ message: err.message || 'Could not remove the chapter', type: 'error' });
  }
}

function onSaved(updated) {
  source.value = updated;
  editing.value = false;
}

onMounted(async () => {
  await research.ensureLoaded().catch(() => {});
});
watch(() => props.noteId, async () => { await load(); schedulePoll(); }, { immediate: true });
</script>

<template>
  <div class="source-reader">
    <router-link to="/research/sources" class="back-link"><ArrowLeft :size="14" /> Research</router-link>

    <p v-if="loadError" class="cc-error" role="alert">
      Couldn't load the citation: {{ loadError }}
      <button class="cc-btn" @click="load">Retry</button>
    </p>

    <section v-if="source" class="citation-card" aria-label="Citation">
      <div class="cc-head">
        <BookOpen :size="16" />
        <span class="cc-kind">{{ kindLabel }}</span>
        <span class="cc-status" :class="`st-${source.metadata_status}`">{{ STATUS_LABELS[source.metadata_status] }}</span>
        <span class="cc-spacer" />
        <button v-if="source.metadata_status !== 'verified' && !aiReading" class="cc-btn" :disabled="aiBusy"
                title="Ask the AI to fill the empty citation fields from the source's text" @click="fillWithAi">
          <Sparkles :size="14" /> {{ aiBusy ? 'Reading…' : 'Fill with AI' }}
        </button>
        <button v-if="source.metadata_status !== 'verified'" class="cc-btn" title="Confirm this citation is correct" @click="verify">
          <CheckCircle2 :size="14" /> Verify
        </button>
        <button v-if="source.pdf_attachment_id" class="cc-btn" title="Open the PDF in a new tab" @click="openPdf">
          <FileText :size="14" /> Open PDF
        </button>
        <button class="cc-btn" title="Edit citation metadata" @click="editing = true">
          <Pencil :size="14" /> Edit
        </button>
      </div>
      <div class="cc-title">{{ source.title }}</div>
      <div v-if="byline" class="cc-byline">{{ byline }}</div>
      <p v-if="aiReading" class="cc-ai" role="status"><Sparkles :size="12" /> AI is reading the PDF to fill in the citation…</p>
      <p v-else-if="aiFields.length && source.metadata_status !== 'verified'" class="cc-ai">
        <Sparkles :size="12" /> Filled by AI — check: {{ aiFields.join(', ') }}
      </p>
      <p v-else-if="aiError && source.metadata_status !== 'verified'" class="cc-ai cc-ai-err">AI couldn't fill the citation: {{ aiError }}</p>
      <a v-if="source.url" class="cc-url" :href="source.url" target="_blank" rel="noopener noreferrer">
        {{ source.url }} <ExternalLink :size="12" />
      </a>

      <div class="cc-chapters">
        <span v-for="c in source.chapters" :key="c.id" class="cc-chip">
          {{ c.label }} · {{ c.title }}
          <button class="cc-chip-x" :title="`Remove from chapter ${c.label}`" :aria-label="`Remove from chapter ${c.label}`" @click="unassign(c.id)"><X :size="12" /></button>
        </span>
        <!-- Select + explicit Add: an action-on-change select fires while arrowing through it. -->
        <template v-if="unassignedChapters.length">
          <select v-model="addChapterId" class="cc-add" aria-label="Chapter to assign">
            <option value="">Chapter…</option>
            <option v-for="c in unassignedChapters" :key="c.id" :value="c.id">{{ c.label }} · {{ c.title }}</option>
          </select>
          <button class="cc-btn" :disabled="!addChapterId" @click="assign">Add</button>
        </template>
        <span v-else-if="!research.hasBook" class="cc-hint">Create a book in Settings → Research to assign chapters.</span>
        <span v-else-if="research.chapters.length === 0" class="cc-hint">Add chapters in Settings → Research.</span>
      </div>
    </section>

    <article v-if="content" class="source-body" v-html="renderedBody" />
    <p v-else class="source-empty">No captured text for this source.</p>

    <SourceFormModal v-if="editing && source" :source="source" @saved="onSaved" @cancel="editing = false" />
  </div>
</template>

<style scoped>
.source-reader { height: 100%; overflow-y: auto; padding: 12px 24px 48px; box-sizing: border-box; }
.back-link { display: inline-flex; align-items: center; gap: 4px; margin-bottom: 10px; font-size: 12px; color: var(--text-secondary); text-decoration: none; }
.back-link:hover { color: var(--text-primary); }
.cc-error { color: var(--status-error); font-size: 13px; display: flex; align-items: center; gap: 8px; }
.citation-card {
  border: 1px solid var(--border-subtle);
  background: var(--bg-card);
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 20px;
  max-width: 820px;
}
.cc-head { display: flex; align-items: center; gap: 8px; color: var(--text-secondary); font-size: 12px; }
.cc-kind { text-transform: uppercase; letter-spacing: 0.05em; font-size: 11px; }
.cc-spacer { flex: 1; }
.cc-status { border-radius: 999px; padding: 1px 8px; font-size: 11px; }
.st-verified { background: var(--status-success-bg); color: var(--status-success); }
.st-incomplete { background: var(--status-error-bg); color: var(--status-error); }
.st-auto, .st-llm { background: var(--status-warning-bg); color: var(--status-warning); }
.cc-btn {
  display: inline-flex; align-items: center; gap: 4px;
  background: transparent; border: 1px solid var(--border-strong); color: var(--text-primary);
  border-radius: 6px; padding: 3px 9px; font-size: 12px; cursor: pointer;
}
.cc-btn:hover { background: var(--hover-bg); }
.cc-title { margin-top: 8px; font-size: 16px; font-weight: 600; color: var(--text-primary); }
.cc-byline { margin-top: 2px; font-size: 13px; color: var(--text-secondary); }
.cc-ai { display: flex; align-items: center; gap: 5px; margin: 6px 0 0; font-size: 12px; color: var(--status-warning); }
.cc-ai-err { color: var(--status-error); }
.cc-url { display: inline-flex; align-items: center; gap: 4px; margin-top: 4px; font-size: 12px; color: var(--accent-primary); word-break: break-all; }
.cc-chapters { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 10px; }
.cc-chip {
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--rail-active); color: var(--text-primary);
  border-radius: 999px; padding: 2px 4px 2px 10px; font-size: 12px;
}
.cc-chip-x { background: none; border: none; color: var(--text-secondary); cursor: pointer; display: inline-flex; padding: 6px; margin: -4px 0; }
.cc-btn:disabled { opacity: 0.5; cursor: default; }
@media (pointer: coarse) { .cc-btn, .cc-add { min-height: 36px; } }
.cc-add {
  background: var(--bg-main); color: var(--text-secondary);
  border: 1px dashed var(--border-strong); border-radius: 999px; padding: 2px 8px; font-size: 12px;
}
.cc-hint { font-size: 12px; color: var(--text-muted); }
.source-body { max-width: 820px; color: var(--text-primary); line-height: 1.65; font-size: 15px; }
.source-body :deep(a) { color: var(--accent-primary); }
.source-body :deep(blockquote) { border-left: 3px solid var(--border-strong); margin: 0; padding-left: 12px; color: var(--text-secondary); }
.source-empty { color: var(--text-muted); font-size: 13px; }
</style>
