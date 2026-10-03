<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Plus, BookOpen, RefreshCw } from 'lucide-vue-next';
import { useResearchStore } from '../stores/research.js';
import SourceFormModal from '../components/research/SourceFormModal.vue';
import ReferenceExport from '../components/research/ReferenceExport.vue';
import AppSidebar from '../components/sidebar/AppSidebar.vue';
import MobileLayout from '../components/mobile/MobileLayout.vue';
import { useMobile } from '../composables/useMobile.js';
import { SOURCE_KINDS, STATUS_LABELS, HIGHLIGHT_LEGEND, formatAuthors, formatPublished } from '../lib/citation.js';

// CR039 A1 — the source library (/research/sources, with ?view=attention or
// ?view=unassigned) and a chapter's sources (/research/chapters/:id). One view,
// driven by the route; the contextual panel links between them.
const route = useRoute();
const router = useRouter();
const research = useResearchStore();
const { isMobile } = useMobile();

const sources = ref([]);
const total = ref(0);
const loading = ref(true);
const loadError = ref('');
const q = ref('');
const kind = ref('');
const creating = ref(false);

const chapterId = computed(() => route.params.id || null);
const chapter = computed(() => research.chapters.find(c => c.id === chapterId.value) || null);
const view = computed(() => route.query.view || '');
const filtered = computed(() => !!(q.value.trim() || kind.value));

const heading = computed(() => {
  if (chapterId.value) return chapter.value ? `${chapter.value.label} · ${chapter.value.title}` : 'Chapter';
  if (view.value === 'attention') return 'Needs attention';
  if (view.value === 'unassigned') return 'Unassigned';
  return 'All sources';
});

const emptyText = computed(() => {
  if (filtered.value) return 'No sources match.';
  if (chapterId.value) return 'No sources assigned to this chapter yet.';
  if (view.value === 'attention') return 'Every citation is verified.';
  if (view.value === 'unassigned') return 'Every source is assigned to a chapter.';
  return 'No sources yet. Add one with New source.';
});

// Export: a chapter route exports that chapter; the library exports the active book.
const slug = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'references';
const exportTarget = computed(() => {
  if (chapterId.value) {
    return { scope: 'chapter', id: chapterId.value, filename: `references-chapter-${slug(chapter.value?.label)}` };
  }
  if (!view.value && research.activeBook) {
    return { scope: 'book', id: research.activeBook.id, filename: `references-${slug(research.activeBook.title)}` };
  }
  return null;
});

// Phase C — a chapter's Passages tab: its highlights grouped by source; a
// click opens the source scrolled to that highlight (?hl=).
const tab = ref('sources');
const passageGroups = ref([]);
const passagesLoading = ref(false);
const legendLabel = (c) => HIGHLIGHT_LEGEND.find(l => l.color === c)?.label || c;
async function loadPassages() {
  if (!chapterId.value) return;
  passagesLoading.value = true;
  try {
    passageGroups.value = await research.listChapterHighlights(chapterId.value);
  } catch (err) {
    loadError.value = err.message || 'Could not load passages';
  } finally {
    passagesLoading.value = false;
  }
}
watch([tab, () => route.params.id], () => { if (tab.value === 'passages') loadPassages(); });
watch(() => route.params.id, () => { if (!route.params.id) tab.value = 'sources'; });

const kindLabel = (k) => SOURCE_KINDS.find(x => x.value === k)?.label || k;

// Responses can arrive out of order (debounced typing, fast list switching);
// only the latest request may write results.
let seq = 0;
async function load() {
  const mine = ++seq;
  loading.value = true;
  loadError.value = '';
  try {
    const res = await research.fetchSources({
      chapter_id: chapterId.value || undefined,
      needs_attention: view.value === 'attention' ? 'true' : undefined,
      unassigned: view.value === 'unassigned' ? 'true' : undefined,
      q: q.value.trim() || undefined,
      kind: kind.value || undefined
    });
    if (mine !== seq) return;
    sources.value = res.data;
    total.value = res.meta.total;
  } catch (err) {
    if (mine !== seq) return;
    loadError.value = err.message || 'Could not load sources';
  } finally {
    if (mine === seq) loading.value = false;
  }
}

let searchTimer = null;
function onSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(load, 250);
}

function onCreated(source) {
  creating.value = false;
  router.push(`/notes/${source.note_id}`);
}

// Sources also arrive from outside this tab (the browser extension), so
// Refresh — and returning to the tab — reloads the list and the chapter counts.
function refresh() {
  load();
  research.fetchChapters().catch(() => {});
  if (tab.value === 'passages') loadPassages();
}
function onVisible() {
  if (document.visibilityState === 'visible') refresh();
}

onMounted(() => {
  research.ensureLoaded().catch(() => {});
  document.addEventListener('visibilitychange', onVisible);
});
onBeforeUnmount(() => {
  clearTimeout(searchTimer);
  document.removeEventListener('visibilitychange', onVisible);
});
watch(() => [route.params.id, route.query.view], load, { immediate: true });
watch(kind, load);
// Switching the active book: a chapter of the old book no longer belongs here.
watch(() => research.activeBook?.id, (id, prev) => {
  if (prev && id !== prev && chapterId.value) router.replace('/research/sources');
});
</script>

<template>
  <component :is="isMobile ? MobileLayout : 'div'" v-bind="isMobile ? { title: 'Research' } : { class: 'research-layout' }">
  <AppSidebar v-if="!isMobile" />
  <main class="research-view">
    <header class="rv-header">
      <div>
        <h2>{{ heading }}</h2>
        <p v-if="chapter?.part" class="rv-sub">{{ chapter.part }}</p>
        <p class="rv-sub">
          <template v-if="sources.length < total">Showing {{ sources.length }} of {{ total }} sources</template>
          <template v-else>{{ total }} source<span v-if="total !== 1">s</span></template>
        </p>
      </div>
      <div class="rv-actions">
        <button class="rv-refresh" title="Refresh" aria-label="Refresh" :disabled="loading" @click="refresh">
          <RefreshCw :size="14" />
        </button>
        <ReferenceExport v-if="exportTarget" :key="exportTarget.id" v-bind="exportTarget" />
        <button class="rv-new" @click="creating = true">
          <Plus :size="14" /> New source
        </button>
      </div>
    </header>
    <p v-if="exportTarget?.scope === 'book'" class="rv-sub rv-export-hint">
      Export covers every chapter of {{ research.activeBook.title }}, in outline order.
    </p>

    <div v-if="chapterId" class="rv-tabs" role="tablist">
      <button role="tab" :aria-selected="tab === 'sources'" :class="{ on: tab === 'sources' }" @click="tab = 'sources'">Sources</button>
      <button role="tab" :aria-selected="tab === 'passages'" :class="{ on: tab === 'passages' }" @click="tab = 'passages'">
        Passages<span v-if="chapter?.highlight_count" class="rv-tab-count">{{ chapter.highlight_count }}</span>
      </button>
    </div>

    <section v-if="chapterId && tab === 'passages'" class="rv-passages" aria-label="Passages">
      <p v-if="passagesLoading && !passageGroups.length" class="rv-empty-line">Loading…</p>
      <p v-else-if="!passageGroups.length" class="rv-empty-line">No highlights in this chapter yet — select text in a source to add one.</p>
      <div v-for="g in passageGroups" :key="g.source.note_id" class="rv-pg">
        <h3 class="rv-pg-title">
          <router-link :to="`/notes/${g.source.note_id}`">{{ g.source.title }}</router-link>
          <span class="rv-pg-by">{{ [formatAuthors(g.source.authors), formatPublished(g.source.published_date, g.source.published_precision)].filter(Boolean).join(' · ') }}</span>
        </h3>
        <ul class="rv-pl">
          <li v-for="h in g.highlights" :key="h.id" :class="`hs-${h.color}`">
            <router-link :to="{ path: `/notes/${g.source.note_id}`, query: { hl: h.id } }" class="rv-quote">
              <span v-if="h.page_label" class="rv-page">p. {{ h.page_label }} — </span>“{{ h.exact }}”
            </router-link>
            <span class="rv-meaning">{{ legendLabel(h.color) }}</span>
            <span v-if="h.anchor_status === 'orphaned'" class="rv-orphan" title="No longer in the source text; kept and exported">unanchored</span>
            <p v-if="h.comment" class="rv-comment">{{ h.comment }}</p>
          </li>
        </ul>
      </div>
    </section>

    <template v-if="!chapterId || tab === 'sources'">
    <div class="rv-filters">
      <input v-model="q" type="search" class="rv-search" aria-label="Search sources"
             placeholder="Search title, author, publication, text…" @input="onSearch" />
      <select v-model="kind" class="rv-kind" aria-label="Filter by kind">
        <option value="">All kinds</option>
        <option v-for="k in SOURCE_KINDS" :key="k.value" :value="k.value">{{ k.label }}</option>
      </select>
    </div>

    <div v-if="loadError" class="rv-empty" role="alert">
      <p>Couldn't load sources: {{ loadError }}</p>
      <button class="rv-retry" @click="load">Retry</button>
    </div>
    <div v-else-if="loading && sources.length === 0" class="rv-empty">
      <p>Loading…</p>
    </div>
    <div v-else-if="sources.length === 0" class="rv-empty">
      <BookOpen :size="28" />
      <p>{{ emptyText }}</p>
    </div>

    <div v-else class="rv-table-wrap">
      <table class="rv-table">
        <thead>
          <tr>
            <th>Author</th>
            <th>Title</th>
            <th class="col-pub">Publication</th>
            <th class="col-date">Date</th>
            <th>Status</th>
            <th v-if="!chapterId" class="col-ch">Chapters</th>
          </tr>
        </thead>
        <tbody>
          <!-- Row click is a mouse convenience; the title link is the keyboard path. -->
          <tr v-for="s in sources" :key="s.note_id" @click="router.push(`/notes/${s.note_id}`)">
            <td>{{ formatAuthors(s.authors) || '—' }}</td>
            <td class="col-title">
              <router-link :to="`/notes/${s.note_id}`" class="rv-title-link" @click.stop>{{ s.title }}</router-link>
              <span class="rv-kind-tag">{{ kindLabel(s.source_kind) }}</span>
            </td>
            <td class="col-pub">{{ s.container || '—' }}</td>
            <td class="col-date">{{ formatPublished(s.published_date, s.published_precision) || '—' }}</td>
            <td><span class="rv-status" :class="`st-${s.metadata_status}`">{{ STATUS_LABELS[s.metadata_status] }}</span></td>
            <td v-if="!chapterId" class="col-ch">{{ s.chapters.map(c => c.label).join(', ') || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    </template>

    <SourceFormModal
      v-if="creating"
      :defaultChapterId="chapterId"
      @saved="onCreated"
      @cancel="creating = false"
    />
  </main>
  </component>
</template>

<style scoped>
.research-layout { display: flex; height: 100vh; }
.research-view { flex: 1; min-width: 0; padding: 16px; box-sizing: border-box; background: var(--bg-main); color: var(--text-primary); }
/* Desktop owns its scroll; on mobile MobileLayout's content area scrolls. */
.research-layout .research-view { height: 100vh; overflow-y: auto; padding: 24px 28px; }
.rv-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.rv-header h2 { margin: 0; font-size: 20px; }
.rv-sub { margin: 2px 0 0; font-size: 12px; color: var(--text-muted); }
.rv-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.rv-export-hint { margin-top: 8px; }
.rv-new {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--accent-primary); color: #fff; border: none; border-radius: 6px;
  padding: 7px 12px; font-size: 13px; cursor: pointer; white-space: nowrap;
}
.rv-refresh {
  display: inline-flex; align-items: center; background: transparent; color: var(--text-secondary);
  border: 1px solid var(--border-strong); border-radius: 6px; padding: 6px 9px; cursor: pointer;
}
.rv-refresh:hover:not(:disabled) { color: var(--text-primary); background: var(--hover-bg); }
.rv-refresh:disabled { opacity: 0.5; cursor: default; }
.rv-tabs { display: flex; gap: 4px; margin-top: 14px; border-bottom: 1px solid var(--border-subtle); }
.rv-tabs button { background: none; border: none; border-bottom: 2px solid transparent; color: var(--text-secondary); padding: 6px 12px; font-size: 13px; cursor: pointer; }
.rv-tabs button.on { color: var(--text-primary); border-bottom-color: var(--accent-primary); }
.rv-tab-count { margin-left: 6px; font-size: 11px; color: var(--text-muted); }
.rv-passages { margin-top: 16px; display: flex; flex-direction: column; gap: 18px; }
.rv-empty-line { color: var(--text-muted); font-size: 13px; }
.rv-pg-title { margin: 0 0 6px; font-size: 14px; display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; }
.rv-pg-title a { color: var(--text-primary); }
.rv-pg-by { font-size: 12px; font-weight: 400; color: var(--text-muted); }
.rv-pl { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.rv-pl li { border-left: 3px solid; padding: 4px 10px; }
.hs-yellow { border-left-color: rgb(250, 204, 21); }
.hs-red { border-left-color: rgb(248, 113, 113); }
.hs-green { border-left-color: rgb(74, 222, 128); }
.hs-blue { border-left-color: rgb(96, 165, 250); }
.rv-quote { color: var(--text-primary); text-decoration: none; font-size: 14px; }
.rv-quote:hover, .rv-quote:focus-visible { text-decoration: underline; }
.rv-page { color: var(--text-muted); }
.rv-meaning { margin-left: 8px; font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em; }
.rv-orphan { margin-left: 6px; font-size: 10px; border-radius: 999px; padding: 0 6px; background: var(--status-error-bg); color: var(--status-error); }
.rv-comment { margin: 3px 0 0; font-size: 13px; color: var(--text-secondary); white-space: pre-wrap; }
.rv-filters { display: flex; gap: 8px; margin: 16px 0; flex-wrap: wrap; }
.rv-search, .rv-kind {
  background: var(--bg-card); color: var(--text-primary);
  border: 1px solid var(--border-strong); border-radius: 6px; padding: 7px 10px; font-size: 13px;
}
.rv-search { flex: 1 1 260px; }
.rv-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 48px 0; color: var(--text-muted); font-size: 13px; }
.rv-empty p { margin: 0; }
.rv-retry {
  background: transparent; color: var(--text-primary); border: 1px solid var(--border-strong);
  border-radius: 6px; padding: 5px 12px; font-size: 12px; cursor: pointer;
}
.rv-table-wrap { overflow-x: auto; }
.rv-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.rv-table th { text-align: left; font-weight: 600; color: var(--text-secondary); padding: 8px; border-bottom: 1px solid var(--border-strong); white-space: nowrap; }
.rv-table td { padding: 8px; border-bottom: 1px solid var(--border-subtle); vertical-align: top; }
.rv-table tbody tr { cursor: pointer; }
.rv-table tbody tr:hover { background: var(--hover-bg); }
.rv-title-link { display: block; color: var(--text-primary); text-decoration: none; }
.rv-title-link:hover, .rv-title-link:focus-visible { text-decoration: underline; }
.rv-kind-tag { font-size: 11px; color: var(--text-muted); }
.rv-status { border-radius: 999px; padding: 1px 8px; font-size: 11px; white-space: nowrap; }
.st-verified { background: var(--status-success-bg); color: var(--status-success); }
.st-incomplete { background: var(--status-error-bg); color: var(--status-error); }
.st-auto, .st-llm { background: var(--status-warning-bg); color: var(--status-warning); }
@media (max-width: 760px) {
  .col-pub, .col-ch { display: none; }
}
</style>
