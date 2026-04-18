<script setup>
import { ref, reactive, onMounted, nextTick, computed } from 'vue';
import { parseTable, serializeTable } from '../../lib/tableParser.js';
import { Plus, Trash2, AlignLeft, AlignCenter, AlignRight } from 'lucide-vue-next';

const props = defineProps({
  initialText: { type: String, required: true }
});

const emit = defineEmits(['save', 'cancel']);

// Structured state: header (strings), aligns (l/c/r), rows (string[][])
const state = reactive({
  header: [],
  aligns: [],
  rows: []
});

const selected = ref({ row: -1, col: 0 }); // row -1 = header
const parseError = ref(false);

onMounted(() => {
  const parsed = parseTable(props.initialText);
  if (!parsed) {
    parseError.value = true;
    // Fall back to a minimal 2x2 so the user isn't stuck
    state.header = ['Col 1', 'Col 2'];
    state.aligns = ['left', 'left'];
    state.rows = [['', ''], ['', '']];
    return;
  }
  state.header = parsed.header.slice();
  state.aligns = parsed.aligns.slice();
  state.rows = parsed.rows.map((r) => r.slice());
  nextTick(() => focusCell(-1, 0));
});

const cols = computed(() => state.header.length);

function cellId(row, col) {
  return `tem-cell-${row}-${col}`;
}

function focusCell(row, col) {
  const el = document.getElementById(cellId(row, col));
  if (el) {
    el.focus();
    if (el.select) el.select();
  }
  selected.value = { row, col };
}

function onCellFocus(row, col) {
  selected.value = { row, col };
}

function onCellKeydown(e, row, col) {
  const totalRows = state.rows.length;
  if (e.key === 'Tab') {
    e.preventDefault();
    if (e.shiftKey) {
      // Prev cell
      if (col > 0) focusCell(row, col - 1);
      else if (row > -1) focusCell(row - 1, cols.value - 1);
    } else {
      // Next cell
      if (col < cols.value - 1) {
        focusCell(row, col + 1);
      } else if (row === -1) {
        if (totalRows === 0) addRow(0);
        focusCell(0, 0);
      } else if (row < totalRows - 1) {
        focusCell(row + 1, 0);
      } else {
        // Last cell of last row — append a new row
        addRow(row + 1);
        nextTick(() => focusCell(row + 1, 0));
      }
    }
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    if (row === -1) {
      if (totalRows === 0) addRow(0);
      focusCell(0, col);
      return;
    }
    if (row < totalRows - 1) {
      focusCell(row + 1, col);
    } else {
      addRow(row + 1);
      nextTick(() => focusCell(row + 1, col));
    }
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('cancel');
    return;
  }
  if (e.key === 'ArrowUp' && e.altKey) {
    e.preventDefault();
    if (row > 0) focusCell(row - 1, col);
    else if (row === 0) focusCell(-1, col);
    return;
  }
  if (e.key === 'ArrowDown' && e.altKey) {
    e.preventDefault();
    if (row === -1) focusCell(0, col);
    else if (row < totalRows - 1) focusCell(row + 1, col);
    return;
  }
}

function addRow(at) {
  const blank = Array.from({ length: cols.value }, () => '');
  const idx = at === undefined ? state.rows.length : at;
  state.rows.splice(idx, 0, blank);
}

function addRowAbove() {
  const r = selected.value.row;
  const at = r === -1 ? 0 : r;
  addRow(at);
  nextTick(() => focusCell(at, selected.value.col));
}

function addRowBelow() {
  const r = selected.value.row;
  const at = r === -1 ? 0 : r + 1;
  addRow(at);
  nextTick(() => focusCell(at, selected.value.col));
}

function deleteRow() {
  const r = selected.value.row;
  if (r === -1) return; // can't delete header
  if (state.rows.length === 0) return;
  state.rows.splice(r, 1);
  const newRow = Math.min(r, state.rows.length - 1);
  nextTick(() => {
    if (state.rows.length === 0) focusCell(-1, selected.value.col);
    else focusCell(newRow, selected.value.col);
  });
}

function addCol(at) {
  state.header.splice(at, 0, `Col ${state.header.length + 1}`);
  state.aligns.splice(at, 0, 'left');
  state.rows.forEach((r) => r.splice(at, 0, ''));
}

function addColLeft() {
  const c = selected.value.col;
  addCol(c);
  nextTick(() => focusCell(selected.value.row, c));
}

function addColRight() {
  const c = selected.value.col;
  addCol(c + 1);
  nextTick(() => focusCell(selected.value.row, c + 1));
}

function deleteCol() {
  if (cols.value <= 1) return;
  const c = selected.value.col;
  state.header.splice(c, 1);
  state.aligns.splice(c, 1);
  state.rows.forEach((r) => r.splice(c, 1));
  const newCol = Math.min(c, cols.value - 1);
  nextTick(() => focusCell(selected.value.row, newCol));
}

function setAlign(align) {
  const c = selected.value.col;
  state.aligns[c] = align;
}

function onSave() {
  const text = serializeTable({
    header: state.header,
    aligns: state.aligns,
    rows: state.rows
  });
  emit('save', text);
}

function cellStyle(col) {
  return { textAlign: state.aligns[col] || 'left' };
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('cancel')">
      <div class="modal">
        <div class="modal-header">
          <h3>Edit Table</h3>
          <p v-if="parseError" class="parse-warning">
            Couldn't parse the original table — starting with a blank grid.
          </p>
        </div>

        <div class="toolbar">
          <div class="toolbar-group">
            <button @click="addRowAbove" title="Insert row above">
              <Plus :size="12" /> Row ↑
            </button>
            <button @click="addRowBelow" title="Insert row below">
              <Plus :size="12" /> Row ↓
            </button>
            <button @click="deleteRow" title="Delete row" :disabled="selected.row === -1 || state.rows.length === 0">
              <Trash2 :size="12" /> Row
            </button>
          </div>
          <div class="toolbar-group">
            <button @click="addColLeft" title="Insert column left">
              <Plus :size="12" /> Col ←
            </button>
            <button @click="addColRight" title="Insert column right">
              <Plus :size="12" /> Col →
            </button>
            <button @click="deleteCol" title="Delete column" :disabled="cols <= 1">
              <Trash2 :size="12" /> Col
            </button>
          </div>
          <div class="toolbar-group">
            <button
              @click="setAlign('left')"
              title="Align column left"
              :class="{ active: state.aligns[selected.col] === 'left' }"
            >
              <AlignLeft :size="12" />
            </button>
            <button
              @click="setAlign('center')"
              title="Align column center"
              :class="{ active: state.aligns[selected.col] === 'center' }"
            >
              <AlignCenter :size="12" />
            </button>
            <button
              @click="setAlign('right')"
              title="Align column right"
              :class="{ active: state.aligns[selected.col] === 'right' }"
            >
              <AlignRight :size="12" />
            </button>
          </div>
        </div>

        <div class="grid-scroll">
          <table class="grid">
            <thead>
              <tr>
                <th v-for="(h, c) in state.header" :key="'h' + c" :style="cellStyle(c)">
                  <input
                    :id="cellId(-1, c)"
                    type="text"
                    :value="state.header[c]"
                    @input="state.header[c] = $event.target.value"
                    @focus="onCellFocus(-1, c)"
                    @keydown="onCellKeydown($event, -1, c)"
                    :style="cellStyle(c)"
                    class="cell-input header-input"
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, r) in state.rows" :key="'r' + r">
                <td v-for="(_, c) in state.header" :key="'c' + r + '-' + c" :style="cellStyle(c)">
                  <input
                    :id="cellId(r, c)"
                    type="text"
                    :value="state.rows[r][c]"
                    @input="state.rows[r][c] = $event.target.value"
                    @focus="onCellFocus(r, c)"
                    @keydown="onCellKeydown($event, r, c)"
                    :style="cellStyle(c)"
                    class="cell-input"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="modal-footer">
          <div class="hint">Tab/Shift+Tab: move cell · Enter: next row · Esc: cancel</div>
          <div class="actions">
            <button class="btn-cancel" @click="$emit('cancel')">Cancel</button>
            <button class="btn-action" @click="onSave">Save</button>
          </div>
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
  width: min(820px, 92vw);
  max-height: 86vh;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 16px 20px 0;
}
.modal-header h3 {
  margin: 0;
  font-size: 16px;
}
.parse-warning {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--accent-warn);
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-subtle);
}
.toolbar-group {
  display: flex;
  gap: 4px;
  padding-right: 10px;
  border-right: 1px solid var(--border-subtle);
}
.toolbar-group:last-child {
  border-right: none;
}
.toolbar button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 9px;
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 5px;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.1s;
}
.toolbar button:hover:not(:disabled) {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}
.toolbar button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.toolbar button.active {
  background-color: rgba(58, 134, 255, 0.14);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.grid-scroll {
  flex: 1;
  overflow: auto;
  padding: 16px 20px;
}

.grid {
  border-collapse: collapse;
  width: 100%;
}
.grid th, .grid td {
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 0;
}
.grid th {
  background: rgba(58, 134, 255, 0.08);
}

.cell-input {
  width: 100%;
  min-width: 110px;
  padding: 6px 10px;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  box-sizing: border-box;
}
.cell-input:focus {
  background: rgba(58, 134, 255, 0.10);
}
.header-input {
  font-weight: 600;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 20px;
  border-top: 1px solid var(--border-subtle);
}
.hint {
  font-size: 11px;
  color: var(--text-muted);
}
.actions {
  display: flex;
  gap: 8px;
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
