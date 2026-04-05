<script setup>
import { ref, computed } from 'vue';
import { useTagsStore } from '../../stores/tags.js';
import { useNotesStore } from '../../stores/notes.js';
import { Tag, X, Plus } from 'lucide-vue-next';

const tagsStore = useTagsStore();
const notesStore = useNotesStore();

const showDropdown = ref(false);
const newTagName = ref('');

const currentTags = computed(() => {
  return notesStore.currentNote?.tags || [];
});

const availableTags = computed(() => {
  const currentIds = new Set(currentTags.value.map(t => t.id));
  return tagsStore.tags.filter(t => !currentIds.has(t.id));
});

async function addTag(tag) {
  if (!notesStore.currentNote) return;
  const currentIds = currentTags.value.map(t => t.id);
  await notesStore.updateNote(notesStore.currentNote.id, {
    tag_ids: [...currentIds, tag.id]
  });
  await notesStore.fetchNote(notesStore.currentNote.id);
  showDropdown.value = false;
}

async function removeTag(tagId) {
  if (!notesStore.currentNote) return;
  const remaining = currentTags.value.filter(t => t.id !== tagId).map(t => t.id);
  await notesStore.updateNote(notesStore.currentNote.id, {
    tag_ids: remaining
  });
  await notesStore.fetchNote(notesStore.currentNote.id);
}

async function createAndAddTag() {
  const name = newTagName.value.trim();
  if (!name) return;
  const tag = await tagsStore.createTag(name);
  await addTag(tag);
  newTagName.value = '';
}
</script>

<template>
  <div class="note-tags">
    <span
      v-for="tag in currentTags"
      :key="tag.id"
      class="tag-pill"
      :style="{ '--tag-color': tag.color || '#3a86ff' }"
    >
      <Tag :size="10" />
      {{ tag.name }}
      <button class="tag-remove" @click="removeTag(tag.id)">
        <X :size="10" />
      </button>
    </span>

    <div class="add-tag-wrapper">
      <button class="add-tag-btn" @click="showDropdown = !showDropdown">
        <Plus :size="12" />
        <span>Tag</span>
      </button>

      <div v-if="showDropdown" class="tag-dropdown">
        <input
          v-model="newTagName"
          class="tag-input"
          placeholder="New or existing tag..."
          @keydown.enter="createAndAddTag"
          @keydown.escape="showDropdown = false"
          autofocus
        />
        <button
          v-for="tag in availableTags"
          :key="tag.id"
          class="tag-option"
          @click="addTag(tag)"
        >
          <Tag :size="12" :style="{ color: tag.color || 'var(--text-muted)' }" />
          {{ tag.name }}
        </button>
        <div v-if="availableTags.length === 0 && !newTagName" class="tag-empty">
          No more tags available
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.note-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.tag-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  background: color-mix(in srgb, var(--tag-color) 20%, transparent);
  color: var(--tag-color);
}

.tag-remove {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
  display: flex;
  opacity: 0.6;
}
.tag-remove:hover { opacity: 1; }

.add-tag-wrapper {
  position: relative;
}

.add-tag-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: none;
  border: 1px dashed var(--border-subtle);
  border-radius: 12px;
  color: var(--text-muted);
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  cursor: pointer;
}
.add-tag-btn:hover {
  border-color: var(--accent-primary);
  color: var(--text-secondary);
}

.tag-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 4px;
  min-width: 180px;
  box-shadow: var(--shadow-sm);
  z-index: 100;
}

.tag-input {
  width: 100%;
  padding: 6px 8px;
  background: var(--bg-main);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  margin-bottom: 4px;
  box-sizing: border-box;
}
.tag-input:focus { outline: none; border-color: var(--accent-primary); }

.tag-option {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 8px;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}
.tag-option:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
}

.tag-empty {
  padding: 6px 8px;
  color: var(--text-muted);
  font-size: 11px;
}
</style>
