import DOMPurify from 'dompurify';

// Tags we explicitly do NOT want even if DOMPurify's default policy might
// otherwise allow them — these cover the obvious script/embed vectors and the
// document-level metadata that has no business inside a rendered note.
const FORBID_TAGS = ['script', 'iframe', 'object', 'embed', 'meta', 'link', 'base'];

const FORBID_ATTR = ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus'];

// Allow inline <style> for v1 (we scope it per-note, see scopeStyleBlocks
// below). svg/data: image URIs are needed for self-contained pages.
const PURIFY_CONFIG = {
  ADD_TAGS: ['style'],
  ADD_ATTR: ['target'],
  FORBID_TAGS,
  FORBID_ATTR,
  // Keep relative + http(s) + data: URIs; DOMPurify already blocks javascript:
  // and other unsafe schemes via its default uri regex.
  ALLOW_DATA_ATTR: false,
  USE_PROFILES: { html: true, svg: true, svgFilters: true }
};

// Prefix every selector in a <style> block with the per-note scope so uploaded
// CSS can't bleed into the app shell. Crude rewriter: handles comma-separated
// selector lists and ignores @-rules other than @media (which gets recursed).
function scopeCss(css, scope) {
  // Strip block comments first so we don't accidentally rewrite text inside them.
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

  // Walk top-level rules. We use a simple state machine instead of a real CSS
  // parser; good enough for the inline <style> blocks that exported HTML
  // documents typically contain.
  let out = '';
  let i = 0;
  while (i < noComments.length) {
    // Skip whitespace
    const wsMatch = noComments.slice(i).match(/^\s+/);
    if (wsMatch) {
      out += wsMatch[0];
      i += wsMatch[0].length;
      continue;
    }

    // @media / @supports — recurse into the inner block, leave the @-rule alone.
    if (noComments[i] === '@') {
      const ruleEnd = noComments.indexOf('{', i);
      if (ruleEnd === -1) break;
      const atRule = noComments.slice(i, ruleEnd + 1);
      out += atRule;
      i = ruleEnd + 1;
      // Find matching close brace
      let depth = 1;
      let inner = '';
      while (i < noComments.length && depth > 0) {
        const ch = noComments[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) break;
        }
        inner += ch;
        i++;
      }
      out += scopeCss(inner, scope) + '}';
      i++; // consume closing }
      continue;
    }

    // Regular rule: read until '{', scope each selector
    const braceIdx = noComments.indexOf('{', i);
    if (braceIdx === -1) break;
    const selectors = noComments.slice(i, braceIdx);
    const blockEnd = noComments.indexOf('}', braceIdx);
    if (blockEnd === -1) break;
    const block = noComments.slice(braceIdx, blockEnd + 1);

    const scoped = selectors
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(sel => {
        // Don't double-scope :root or html/body — rewrite to the scope itself.
        if (/^(:root|html|body)\b/i.test(sel)) {
          return scope;
        }
        return `${scope} ${sel}`;
      })
      .join(', ');

    out += scoped + ' ' + block;
    i = blockEnd + 1;
  }

  return out;
}

function scopeStyleBlocks(html, scope) {
  return html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, css) => {
    return `<style>${scopeCss(css, scope)}</style>`;
  });
}

/**
 * Sanitize a note body for safe rendering as HTML.
 *
 * @param {string} raw  Untrusted HTML from a note body
 * @param {object} [opts]
 * @param {string} [opts.scope] CSS scope selector (default `.note-html`); any
 *   <style> blocks in the input have their selectors prefixed with this so
 *   uploaded CSS can't bleed into the app shell.
 * @returns {string} Sanitized HTML, safe to v-html into the matching scope.
 */
export function sanitizeNoteHtml(raw, opts = {}) {
  if (!raw) return '';
  const scope = opts.scope || '.note-html';
  const scoped = scopeStyleBlocks(raw, scope);
  return DOMPurify.sanitize(scoped, PURIFY_CONFIG);
}

/**
 * Strip every tag from an HTML string, leaving only text content. Used for
 * search snippets / list previews where rendering markup is not appropriate.
 */
export function stripHtmlTags(raw) {
  if (!raw) return '';
  // Use the browser's parser via DOMPurify with allowed tags = [] to get a
  // text-only version that already had script/style content removed.
  return DOMPurify.sanitize(raw, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
