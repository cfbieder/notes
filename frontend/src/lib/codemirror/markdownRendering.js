import { ViewPlugin, Decoration, WidgetType } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import { getAccessToken } from '../../api/client.js';

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
    cb.style.cssText = 'margin: 0 6px 0 0; vertical-align: middle; accent-color: #4cc9f0; cursor: pointer;';

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
    img.style.cssText = sizeCSS + ' border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); display: block;';

    img.onerror = () => {
      img.style.display = 'none';
      const fallback = document.createElement('span');
      fallback.textContent = `[Image: ${this.alt}]`;
      fallback.style.cssText = 'color: #6b8dbb; font-size: 12px; font-style: italic;';
      wrapper.appendChild(fallback);
    };

    // Resize handle (bottom-right corner)
    const handle = document.createElement('div');
    handle.classList.add('cm-image-resize-handle');
    handle.style.cssText = 'position: absolute; right: -2px; bottom: -2px; width: 14px; height: 14px; background: #4cc9f0; border: 2px solid #0b1220; border-radius: 50%; cursor: nwse-resize; opacity: 0; transition: opacity 0.15s; z-index: 2;';
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
    return event.type !== 'mousedown' && event.type !== 'mousemove' && event.type !== 'mouseup';
  }
}

class BulletWidget extends WidgetType {
  toDOM() {
    const span = document.createElement('span');
    span.textContent = '\u2022';
    span.style.cssText = 'color: #ff9f1c; font-weight: bold; margin-right: 4px;';
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
        if (node.name === 'QuoteMark') {
          builder.add(node.from, Math.min(node.to + 1, doc.length), Decoration.replace({}));
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

export const markdownRenderPlugin = [markdownSyntaxPlugin, imageRenderPlugin];
