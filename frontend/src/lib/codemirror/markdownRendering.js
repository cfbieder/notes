import { ViewPlugin, Decoration, WidgetType, EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder, StateField } from '@codemirror/state';
import MarkdownIt from 'markdown-it';
import { getAccessToken } from '../../api/client.js';
import {
  splitRowCells,
  isSeparatorCells,
  parseAlignFromSeparatorCell
} from '../tableParser.js';

// Inline-only markdown renderer for table cells. GFM allows `**bold**`,
// `*italic*`, `` `code` ``, `~~strike~~`, and `[text](url)` inside cells.
// `html: false` escapes raw HTML; markdown-it's default link validator blocks
// `javascript:` / `vbscript:` / `data:` schemes, so innerHTML is safe here.
const cellMd = new MarkdownIt({ html: false, linkify: false, breaks: false });

// Widget for rendering interactive checkboxes
class CheckboxWidget extends WidgetType {
  constructor(checked, pos, view) {
    super();
    this.checked = checked;
    this.pos = pos;
    this.view = view;
  }

  toDOM() {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = this.checked;
    cb.classList.add('cm-checkbox');
    cb.style.cssText = 'margin: 0 6px 0 0; vertical-align: middle; accent-color: var(--accent-success); cursor: pointer;';

    cb.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const newText = this.checked ? '[ ]' : '[x]';
      this.view.dispatch({
        changes: { from: this.pos, to: this.pos + 3, insert: newText }
      });
    });

    return cb;
  }

  eq(other) {
    return this.checked === other.checked && this.pos === other.pos;
  }

  ignoreEvent() {
    return false;
  }
}

// Widget for rendering inline images
class ImageWidget extends WidgetType {
  constructor(alt, src, width, from, to, view) {
    super();
    this.alt = alt;
    this.src = src;
    this.width = width;
    this.from = from;
    this.to = to;
    this.view = view;
  }

  toDOM() {
    const wrapper = document.createElement('div');
    wrapper.classList.add('cm-image-wrapper');
    wrapper.style.cssText = 'margin: 8px 0; max-width: 100%; position: relative; display: inline-block;';

    const img = document.createElement('img');
    // Append auth token for our API URLs
    let imgSrc = this.src;
    if (imgSrc.startsWith('/api/')) {
      const token = getAccessToken();
      if (token) {
        imgSrc += (imgSrc.includes('?') ? '&' : '?') + 'token=' + token;
      }
    }
    img.src = imgSrc;
    img.alt = this.alt;
    img.title = this.alt;
    img.loading = 'lazy';
    const sizeCSS = this.width
      ? `width: ${this.width}px; max-width: 100%; height: auto;`
      : 'max-width: 100%; max-height: 400px;';
    // SVGs often use dark ink designed for light backgrounds — give them a
    // white backing so they remain legible in dark themes.
    const isSvg = /\.svg(\b|$)/i.test(this.alt) || /\.svg(\?|$)/i.test(this.src);
    const bgCSS = isSvg ? ' background: #ffffff; padding: 8px;' : '';
    img.style.cssText = sizeCSS + ' border-radius: 8px; border: 1px solid var(--border-subtle); display: block;' + bgCSS;

    img.onerror = () => {
      img.style.display = 'none';
      const fallback = document.createElement('span');
      fallback.textContent = `[Image: ${this.alt}]`;
      fallback.style.cssText = 'color: var(--text-muted); font-size: 12px; font-style: italic;';
      wrapper.appendChild(fallback);
    };

    // Resize handle (bottom-right corner)
    const handle = document.createElement('div');
    handle.classList.add('cm-image-resize-handle');
    handle.style.cssText = 'position: absolute; right: -2px; bottom: -2px; width: 14px; height: 14px; background: var(--accent-success); border: 2px solid var(--bg-sidebar); border-radius: 50%; cursor: nwse-resize; opacity: 0; transition: opacity 0.15s; z-index: 2;';
    wrapper.addEventListener('mouseenter', () => { handle.style.opacity = '1'; });
    wrapper.addEventListener('mouseleave', () => { handle.style.opacity = '0'; });

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = img.getBoundingClientRect().width;
      let pendingWidth = Math.round(startWidth);

      const onMove = (ev) => {
        pendingWidth = Math.max(40, Math.round(startWidth + (ev.clientX - startX)));
        img.style.width = pendingWidth + 'px';
        img.style.maxHeight = 'none';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        const baseAlt = this.alt;
        const newText = `![${baseAlt}|${pendingWidth}](${this.src})`;
        this.view.dispatch({
          changes: { from: this.from, to: this.to, insert: newText }
        });
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    wrapper.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.querySelectorAll('.cm-image-context-menu').forEach((m) => m.remove());

      const menu = document.createElement('div');
      menu.classList.add('cm-image-context-menu');
      menu.style.cssText = `position: fixed; left: ${e.clientX}px; top: ${e.clientY}px; background: var(--bg-sidebar); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 4px 0; z-index: 10000; box-shadow: var(--shadow-md); font-family: Inter, sans-serif; font-size: 13px; color: var(--text-primary); min-width: 140px;`;

      const item = document.createElement('div');
      item.textContent = 'Delete image';
      item.style.cssText = 'padding: 8px 14px; cursor: pointer;';
      item.addEventListener('mouseenter', () => { item.style.background = 'var(--hover-bg)'; });
      item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
      item.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        let delFrom = this.from;
        let delTo = this.to;
        const docText = this.view.state.doc;
        const line = docText.lineAt(delFrom);
        const before = docText.sliceString(line.from, delFrom);
        const after = docText.sliceString(delTo, line.to);
        if (before.trim() === '' && after.trim() === '') {
          delFrom = line.from;
          delTo = Math.min(docText.length, line.to + 1);
        }
        this.view.dispatch({ changes: { from: delFrom, to: delTo, insert: '' } });
        menu.remove();
      });
      menu.appendChild(item);

      const close = (ev) => {
        if (!menu.contains(ev.target)) {
          menu.remove();
          document.removeEventListener('mousedown', close, true);
        }
      };
      document.addEventListener('mousedown', close, true);

      document.body.appendChild(menu);
    });

    wrapper.appendChild(img);
    wrapper.appendChild(handle);
    return wrapper;
  }

  eq(other) {
    return this.alt === other.alt && this.src === other.src
      && this.width === other.width && this.from === other.from && this.to === other.to;
  }

  ignoreEvent(event) {
    // Let mouse events through so the resize handle can capture them
    return event.type !== 'mousedown' && event.type !== 'mousemove' && event.type !== 'mouseup' && event.type !== 'contextmenu';
  }
}

class TableWidget extends WidgetType {
  constructor(header, aligns, rows, from, to, sourceText) {
    super();
    this.header = header;
    this.aligns = aligns;
    this.rows = rows;
    this.from = from;
    this.to = to;
    this.sourceText = sourceText;
  }

  toDOM() {
    const wrapper = document.createElement('div');
    wrapper.classList.add('cm-table-wrapper');
    wrapper.style.cssText = 'margin: 10px 0; overflow-x: auto; cursor: pointer;';
    wrapper.title = 'Click to edit table';

    const from = this.from;
    const to = this.to;
    const sourceText = this.sourceText;
    wrapper.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      wrapper.dispatchEvent(new CustomEvent('noter-edit-table', {
        bubbles: true,
        detail: { from, to, text: sourceText }
      }));
    });

    const table = document.createElement('table');
    table.classList.add('cm-rendered-table');
    table.style.cssText = 'border-collapse: collapse; width: auto; min-width: 50%; font-family: Inter, sans-serif; font-size: 13px; color: var(--text-primary); background: var(--hover-bg); border: 1px solid var(--border-subtle); border-radius: 6px; overflow: hidden;';

    const thead = document.createElement('thead');
    const hrow = document.createElement('tr');
    this.header.forEach((cell, i) => {
      const th = document.createElement('th');
      th.innerHTML = cellMd.renderInline(cell || '');
      th.style.cssText = `padding: 6px 12px; text-align: ${this.aligns[i] || 'left'}; background: var(--hover-bg); border-bottom: 1px solid var(--border-subtle); font-weight: 600;`;
      hrow.appendChild(th);
    });
    thead.appendChild(hrow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    this.rows.forEach((row) => {
      const tr = document.createElement('tr');
      for (let i = 0; i < this.header.length; i++) {
        const td = document.createElement('td');
        td.innerHTML = cellMd.renderInline(row[i] ?? '');
        td.style.cssText = `padding: 6px 12px; text-align: ${this.aligns[i] || 'left'}; border-top: 1px solid var(--border-subtle);`;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    wrapper.appendChild(table);
    return wrapper;
  }

  eq(other) {
    return this.from === other.from && this.to === other.to
      && this.sourceText === other.sourceText;
  }

  get estimatedHeight() {
    // Header row + body rows at ~28px each + 20px wrapper margin
    return (this.rows.length + 1) * 28 + 20;
  }

  ignoreEvent(event) {
    return event.type !== 'mousedown';
  }
}

function buildTableDecorationsFromState(state) {
  const builder = new RangeSetBuilder();
  const doc = state.doc;
  const cursorLine = doc.lineAt(state.selection.main.head).number;
  const totalLines = doc.lines;

  let lineNum = 1;
  while (lineNum <= totalLines) {
    const line = doc.line(lineNum);
    const headerCells = splitRowCells(line.text);
    if (!headerCells || headerCells.length === 0) {
      lineNum++;
      continue;
    }
    if (lineNum + 1 > totalLines) break;
    const sepLine = doc.line(lineNum + 1);
    const sepCells = splitRowCells(sepLine.text);
    if (!isSeparatorCells(sepCells) || sepCells.length !== headerCells.length) {
      lineNum++;
      continue;
    }

    const aligns = sepCells.map(parseAlignFromSeparatorCell);
    const bodyRows = [];
    let endLine = lineNum + 1;
    let probe = lineNum + 2;
    while (probe <= totalLines) {
      const pl = doc.line(probe);
      const cells = splitRowCells(pl.text);
      if (!cells || cells.length === 0) break;
      // pad/truncate to header width
      const padded = [];
      for (let i = 0; i < headerCells.length; i++) padded.push(cells[i] ?? '');
      bodyRows.push(padded);
      endLine = probe;
      probe++;
    }

    const blockFrom = line.from;
    const blockTo = doc.line(endLine).to;
    const cursorInside = cursorLine >= lineNum && cursorLine <= endLine;

    if (!cursorInside) {
      const sourceText = doc.sliceString(blockFrom, blockTo);
      builder.add(blockFrom, blockTo, Decoration.replace({
        widget: new TableWidget(headerCells, aligns, bodyRows, blockFrom, blockTo, sourceText),
        block: true
      }));
    }
    lineNum = endLine + 1;
  }

  return builder.finish();
}

class BulletWidget extends WidgetType {
  toDOM() {
    const span = document.createElement('span');
    span.textContent = '\u2022';
    span.style.cssText = 'color: var(--accent-warn); font-weight: bold; margin-right: 4px;';
    return span;
  }

  eq() { return true; }
}

// Hide markdown syntax markers in normal mode
function buildDecorations(view) {
  const builder = new RangeSetBuilder();
  const doc = view.state.doc;

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from, to,
      enter(node) {
        // Hide heading markers: # ## ### etc.
        if (node.name === 'HeaderMark') {
          const end = Math.min(node.to + 1, doc.length);
          builder.add(node.from, end, Decoration.replace({}));
        }

        // Hide emphasis markers: * _ ** __
        if (node.name === 'EmphasisMark' || node.name === 'StrongEmphasisMark') {
          builder.add(node.from, node.to, Decoration.replace({}));
        }

        // Hide code markers: `
        if (node.name === 'CodeMark' && node.to - node.from <= 1) {
          builder.add(node.from, node.to, Decoration.replace({}));
        }

        // Hide strikethrough markers: ~~
        if (node.name === 'StrikethroughMark') {
          builder.add(node.from, node.to, Decoration.replace({}));
        }

        // Replace task list markers with interactive checkboxes
        if (node.name === 'TaskMarker') {
          const text = doc.sliceString(node.from, node.to);
          const checked = text.includes('x') || text.includes('X');
          // TaskMarker covers [x] or [ ] — the inner part between brackets
          // Find the actual [ ] or [x] position
          const markerText = doc.sliceString(node.from, node.to);
          builder.add(node.from, node.to, Decoration.replace({
            widget: new CheckboxWidget(checked, node.from, view)
          }));
        }

        // Style horizontal rules
        if (node.name === 'HorizontalRule') {
          builder.add(node.from, node.from, Decoration.line({
            class: 'cm-hr-line'
          }));
        }

        // Style blockquotes
        if (node.name === 'Blockquote') {
          const line = doc.lineAt(node.from);
          builder.add(line.from, line.from, Decoration.line({
            class: 'cm-blockquote-line'
          }));
        }

        // Hide blockquote markers: >
        // Only extend past node.to if the next char is a space, never swallow newlines —
        // an inline Decoration.replace that spans a line break confuses CodeMirror layout.
        if (node.name === 'QuoteMark') {
          const nextChar = doc.sliceString(node.to, Math.min(node.to + 1, doc.length));
          const end = nextChar === ' ' ? node.to + 1 : node.to;
          builder.add(node.from, end, Decoration.replace({}));
        }

        // Note: inline image rendering handled separately via regex scan below

        // Style list markers as bullets
        if (node.name === 'ListMark') {
          const text = doc.sliceString(node.from, node.to).trim();
          if (text === '-' || text === '*' || text === '+') {
            builder.add(node.from, node.to, Decoration.replace({
              widget: new BulletWidget()
            }));
          }
        }
      }
    });
  }

  return builder.finish();
}

// Separate image decoration builder using regex (avoids parser issues with underscores in alt text)
function buildImageDecorations(view) {
  const builder = new RangeSetBuilder();
  const doc = view.state.doc;
  const cursorLine = doc.lineAt(view.state.selection.main.head).number;
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

  for (const { from, to } of view.visibleRanges) {
    const text = doc.sliceString(from, to);
    let match;
    while ((match = imageRegex.exec(text)) !== null) {
      const matchFrom = from + match.index;
      const matchTo = matchFrom + match[0].length;
      const rawAlt = match[1];
      const src = match[2];

      // Parse Obsidian-style width: ![alt|300](src)
      let alt = rawAlt;
      let width = null;
      const pipeIdx = rawAlt.lastIndexOf('|');
      if (pipeIdx !== -1) {
        const w = parseInt(rawAlt.slice(pipeIdx + 1), 10);
        if (!isNaN(w) && w > 0) {
          alt = rawAlt.slice(0, pipeIdx);
          width = w;
        }
      }

      if (src.startsWith('/api/') || src.startsWith('http')) {
        const matchLine = doc.lineAt(matchFrom).number;
        if (matchLine !== cursorLine) {
          builder.add(matchFrom, matchTo, Decoration.replace({
            widget: new ImageWidget(alt, src, width, matchFrom, matchTo, view)
          }));
        }
      }
    }
  }

  return builder.finish();
}

const markdownSyntaxPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildDecorations(view);
    }

    update(update) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: () => []
  }
);

const imageRenderPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildImageDecorations(view);
    }

    update(update) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildImageDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: () => []
  }
);

const tableDecorationField = StateField.define({
  create(state) {
    return buildTableDecorationsFromState(state);
  },
  update(deco, tr) {
    if (tr.docChanged || tr.selection) {
      return buildTableDecorationsFromState(tr.state);
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f)
});

export const markdownRenderPlugin = [markdownSyntaxPlugin, imageRenderPlugin, tableDecorationField];
