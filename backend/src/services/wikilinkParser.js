const WIKILINK_REGEX = /\[\[([^\]]+)\]\]/g;

/**
 * Extract all [[wikilink]] references from markdown content.
 * Handles alias syntax: [[Title|display text]] — uses text before pipe as title.
 * Returns array of { title, displayText, contextSnippet }.
 */
function extractWikilinks(content) {
  if (!content) return [];

  const results = [];
  const lines = content.split('\n');

  for (const line of lines) {
    let match;
    WIKILINK_REGEX.lastIndex = 0;

    while ((match = WIKILINK_REGEX.exec(line)) !== null) {
      const inner = match[1];
      const pipeIndex = inner.indexOf('|');
      const title = pipeIndex >= 0 ? inner.slice(0, pipeIndex).trim() : inner.trim();
      const displayText = pipeIndex >= 0 ? inner.slice(pipeIndex + 1).trim() : inner.trim();

      if (!title) continue;

      // Context snippet: the line containing the wikilink, trimmed
      const contextSnippet = line.trim().slice(0, 120);

      results.push({ title, displayText, contextSnippet });
    }
  }

  return results;
}

/**
 * Resolve extracted wikilink titles to note IDs using a title-to-ID map.
 * titleToIdMap: { lowerCaseTitle: noteId }
 * Returns { resolved: [{ targetNoteId, contextSnippet }], unresolved: [title] }
 */
function resolveWikilinks(extracted, titleToIdMap) {
  const resolved = [];
  const unresolved = [];
  const seen = new Set();

  for (const { title, contextSnippet } of extracted) {
    const lower = title.toLowerCase();
    const targetId = titleToIdMap[lower];

    if (targetId && !seen.has(targetId)) {
      seen.add(targetId);
      resolved.push({ targetNoteId: targetId, contextSnippet });
    } else if (!targetId) {
      unresolved.push(title);
    }
  }

  return { resolved, unresolved };
}

module.exports = { extractWikilinks, resolveWikilinks };
