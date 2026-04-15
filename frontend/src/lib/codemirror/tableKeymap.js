import { keymap } from '@codemirror/view';
import {
  isTableRow,
  isSeparatorRow,
  countCells,
  emptyRowText,
  splitRowCells
} from '../tableParser.js';

function rowIsEmpty(rowText) {
  const cells = splitRowCells(rowText);
  if (!cells) return false;
  return cells.every((c) => c === '');
}

// Are we inside a contiguous table block (current line is a table row,
// and at least one neighboring line is also a table row)?
function inTableBlock(state, lineNum) {
  const line = state.doc.line(lineNum);
  if (!isTableRow(line.text)) return false;
  const above = lineNum > 1 ? state.doc.line(lineNum - 1).text : '';
  const below = lineNum < state.doc.lines ? state.doc.line(lineNum + 1).text : '';
  return isTableRow(above) || isTableRow(below);
}

function handleEnter(view) {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  if (!inTableBlock(state, line.number)) return false;
  if (isSeparatorRow(line.text)) return false;

  const nextLineText = line.number < state.doc.lines
    ? state.doc.line(line.number + 1).text
    : '';
  const isLastRow = !isTableRow(nextLineText);
  if (rowIsEmpty(line.text) && isLastRow) {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: '' },
      selection: { anchor: line.from }
    });
    return true;
  }

  const cols = countCells(line.text);
  if (cols < 1) return false;
  const newRow = '\n' + emptyRowText(cols);
  const insertPos = line.to;
  view.dispatch({
    changes: { from: insertPos, to: insertPos, insert: newRow },
    selection: { anchor: insertPos + 2 }
  });
  return true;
}

function handleTab(view) {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  if (!inTableBlock(state, line.number)) return false;
  if (isSeparatorRow(line.text)) return false;

  const offsetInLine = sel.head - line.from;
  const text = line.text;

  const nextPipe = text.indexOf('|', offsetInLine);

  if (nextPipe !== -1 && nextPipe < text.length - 1) {
    const target = line.from + nextPipe + 2;
    view.dispatch({ selection: { anchor: Math.min(target, line.to) } });
    return true;
  }

  if (line.number < state.doc.lines) {
    const next = state.doc.line(line.number + 1);
    if (isTableRow(next.text) && !isSeparatorRow(next.text)) {
      view.dispatch({ selection: { anchor: next.from + 2 } });
      return true;
    }
  }

  const cols = countCells(text);
  if (cols < 1) return false;
  const insertPos = line.to;
  const newRow = '\n' + emptyRowText(cols);
  view.dispatch({
    changes: { from: insertPos, to: insertPos, insert: newRow },
    selection: { anchor: insertPos + 2 }
  });
  return true;
}

export const tableKeymap = keymap.of([
  { key: 'Enter', run: handleEnter },
  { key: 'Tab', run: handleTab }
]);
