<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { api } from '../../api/client.js';
import { Search, X, FileText } from 'lucide-vue-next';

const props = defineProps({
  modelValue: { type: Array, required: true } // [{ id, title }]
});
const emit = defineEmits(['update:modelValue']);

const query = ref('');
const results = ref([]);
const loading = ref(false);
const showDropdown = ref(false);
const inputRef = ref(null);
let debounceTimer = null;

const selectedIds = computed(() => new Set(props.modelValue.map(n => n.id)));

watch(query, (val) => {
  clearTimeout(debounceTimer);
  if (!val || val.trim().length === 0) {
    results.value = [];
    return;
  }
  debounceTimer = setTimeout(async () => {
    loading.value = true;
    try {
      const res = await api.get(`/notes?search=${encodeURIComponent(val)}&limit=20`);
      results.value = (res.data || []).filter(n => !selectedIds.value.has(n.id));
    } catch {
      results.value = [];
    } finally {
      loading.value = false;
    }
  }, 200);
});

function addNote(note) {
  if (selectedIds.value.has(note.id)) return;
  emit('update:modelValue', [...props.modelValue, { id: note.id, title: note.title }]);
  query.value = '';
  results.value = [];
  inputRef.value?.focus();
}

function removeNote(id) {
  emit('update:modelValue', props.modelValue.filter(n => n.id !== id));
}

function onFocus() { showDropdown.value = true; }
function onBlur() {
  // Delay so click on result registers before dropdown closes
  setTimeout(() => { showDropdown.value = false; }, 150);
}

function onKeydown(e) {
  if (e.key === 'Enter' && results.value.length > 0) {
    e.preventDefault();
    addNote(results.value[0]);
  } else if (e.key === 'Backspace' && query.value === '' && props.modelValue.length > 0) {
    removeNote(props.modelValue[props.modelValue.length - 1].id);
  }
}

onBeforeUnmount(() => clearTimeout(debounceTimer));
</script>

<template>
  <div class="picker">
    <div class="picker-input-row">
      <Search :size="14" class="picker-icon" />
      <div class="chips-wrap">
        <span v-for="note in modelValue" :key="note.id" class="chip">
          <FileText :size="12" />
          <span class="chip-title">{{ note.title || 'Untitled' }}</span>
          <button class="chip-remove" @click="removeNote(note.id)" :title="`Remove ${note.title}`">
            <X :size="12" />
          </button>
        </span>
        <input
          ref="inputRef"
          v-model="query"
          class="picker-input"
          :placeholder="modelValue.length === 0 ? 'Search notes to add as context...' : 'Add another...'"
          @focus="onFocus"
          @blur="onBlur"
          @keydown="onKeydown"
        />
      </div>
    </div>

    <div v-if="showDropdown && (loading || results.length > 0 || query)" class="picker-dropdown">
      <div v-if="loading" class="picker-empty">Searching...</div>
      <div v-else-if="results.length === 0" class="picker-empty">No matches</div>
      <button
        v-for="note in results"
        :key="note.id"
        class="picker-result"
        @mousedown.prevent="addNote(note)"
      >
        <FileText :size="14" />
        <span class="result-title">{{ note.title || 'Untitled' }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.picker { position: relative; }

.picker-input-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  background: var(--bg-main);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  min-height: 38px;
}
.picker-input-row:focus-within { border-color: var(--accent-primary); }

.picker-icon { color: var(--text-muted); margin-top: 4px; flex-shrink: 0; }

.chips-wrap {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 6px 3px 7px;
  background: rgba(58, 134, 255, 0.15);
  color: var(--accent-primary);
  border-radius: 4px;
  font-size: 11px;
  max-width: 220px;
}
.chip-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chip-remove {
  background: none;
  border: none;
  color: var(--accent-primary);
  cursor: pointer;
  padding: 0;
  display: flex;
  opacity: 0.7;
}
.chip-remove:hover { opacity: 1; }

.picker-input {
  flex: 1;
  min-width: 140px;
  background: none;
  border: none;
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  outline: none;
  padding: 2px 0;
}
.picker-input::placeholder { color: var(--text-muted); }

.picker-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  max-height: 220px;
  overflow-y: auto;
  z-index: 10;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.picker-empty {
  padding: 10px 12px;
  color: var(--text-muted);
  font-size: 12px;
}

.picker-result {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}
.picker-result:hover { background: rgba(58, 134, 255, 0.1); color: var(--text-primary); }

.result-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
