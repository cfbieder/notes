<script setup>
import { ref, computed, watch } from 'vue';

const emit = defineEmits(['insert', 'cancel']);

const rows = ref(3);
const cols = ref(3);
const includeHeader = ref(true);
const alignments = ref(['left', 'left', 'left']);

watch(cols, (n) => {
  const next = Math.max(1, Math.min(20, Number(n) || 1));
  while (alignments.value.length < next) alignments.value.push('left');
  alignments.value.length = next;
});

const safeRows = computed(() => Math.max(1, Math.min(50, Number(rows.value) || 1)));
const safeCols = computed(() => Math.max(1, Math.min(20, Number(cols.value) || 1)));

function sepFor(align) {
  if (align === 'center') return ':---:';
  if (align === 'right') return '---:';
  return '---';
}

function onInsert() {
  const c = safeCols.value;
  const r = safeRows.value;
  const aligns = alignments.value.slice(0, c);
  const headerCells = Array.from({ length: c }, (_, i) =>
    includeHeader.value ? ` Col ${i + 1} ` : '   '
  );
  const sepCells = aligns.map((a) => ` ${sepFor(a)} `);
  const emptyRow = '|' + Array.from({ length: c }, () => '   ').join('|') + '|';
  const lines = [
    '|' + headerCells.join('|') + '|',
    '|' + sepCells.join('|') + '|'
  ];
  for (let i = 0; i < r; i++) lines.push(emptyRow);
  emit('insert', lines.join('\n'));
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('cancel')">
      <div class="modal">
        <div class="modal-header">
          <h3>Insert Table</h3>
        </div>
        <div class="modal-body">
          <div class="field-row">
            <label>
              Rows
              <input type="number" min="1" max="50" v-model.number="rows" />
            </label>
            <label>
              Columns
              <input type="number" min="1" max="20" v-model.number="cols" />
            </label>
          </div>

          <label class="checkbox-row">
            <input type="checkbox" v-model="includeHeader" />
            <span>Include header labels</span>
          </label>

          <div class="align-section">
            <div class="align-label">Column alignment</div>
            <div class="align-grid">
              <div v-for="(_, i) in alignments" :key="i" class="align-col">
                <div class="align-col-label">{{ i + 1 }}</div>
                <select v-model="alignments[i]">
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="$emit('cancel')">Cancel</button>
          <button class="btn-action" @click="onInsert">Insert</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  width: 440px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.modal-header {
  padding: 16px 20px 0;
}
.modal-header h3 {
  margin: 0;
  font-size: 16px;
}

.modal-body {
  padding: 12px 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field-row {
  display: flex;
  gap: 16px;
}
.field-row label {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}
.field-row input {
  padding: 6px 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.align-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.align-label {
  font-size: 12px;
  color: var(--text-secondary);
}
.align-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.align-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}
.align-col-label {
  font-size: 11px;
  color: var(--text-muted);
}
.align-col select {
  padding: 4px 6px;
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 5px;
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
}
.align-col select option {
  background: #1a2332;
  color: #e6edf3;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border-subtle);
}

.btn-cancel {
  padding: 7px 16px;
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  cursor: pointer;
}
.btn-cancel:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.btn-action {
  padding: 7px 16px;
  background: var(--accent-primary);
  border: none;
  border-radius: 6px;
  color: white;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.btn-action:hover { opacity: 0.88; }
</style>
