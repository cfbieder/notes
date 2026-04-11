async function linkRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /api/v1/notes/:id/backlinks — notes that link TO this note
  fastify.get('/:id/backlinks', async (request) => {
    const { id } = request.params;

    const result = await fastify.db.query(
      `SELECT n.id, n.title, n.updated_at, nl.context_snippet
       FROM note_links nl
       JOIN notes n ON n.id = nl.source_note_id
       WHERE nl.target_note_id = $1
         AND n.user_id = $2
         AND n.deleted_at IS NULL
       ORDER BY n.updated_at DESC`,
      [id, request.user.id]
    );

    return { data: result.rows };
  });

  // GET /api/v1/notes/:id/unlinked-mentions — notes mentioning this note's title without [[]]
  fastify.get('/:id/unlinked-mentions', async (request) => {
    const { id } = request.params;

    // Get the target note's title
    const noteResult = await fastify.db.query(
      `SELECT title FROM notes WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [id, request.user.id]
    );

    if (noteResult.rows.length === 0) {
      return { data: [] };
    }

    const title = noteResult.rows[0].title;
    if (!title || title.length < 2) return { data: [] };

    // Find notes containing the title text (case-insensitive)
    const result = await fastify.db.query(
      `SELECT id, title, content FROM notes
       WHERE user_id = $1
         AND id != $2
         AND deleted_at IS NULL
         AND content ILIKE '%' || $3 || '%'
       LIMIT 50`,
      [request.user.id, id, title]
    );

    // Filter: only include mentions NOT already inside [[]]
    const mentions = [];
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const linkedRegex = new RegExp(`\\[\\[${escapedTitle}(\\|[^\\]]*)?\\]\\]`, 'gi');
    const mentionRegex = new RegExp(escapedTitle, 'gi');

    for (const row of result.rows) {
      // Remove all [[...]] wrapped mentions, then check if bare mentions remain
      const contentWithoutLinks = row.content.replace(linkedRegex, '');
      if (mentionRegex.test(contentWithoutLinks)) {
        // Extract context snippet around first mention
        const idx = contentWithoutLinks.toLowerCase().indexOf(title.toLowerCase());
        const start = Math.max(0, idx - 40);
        const end = Math.min(contentWithoutLinks.length, idx + title.length + 40);
        const contextSnippet = (start > 0 ? '...' : '') +
          contentWithoutLinks.slice(start, end).trim() +
          (end < contentWithoutLinks.length ? '...' : '');

        mentions.push({
          id: row.id,
          title: row.title,
          context_snippet: contextSnippet
        });
      }

      if (mentions.length >= 20) break;
    }

    return { data: mentions };
  });

  // GET /api/v1/notes/:id/graph — local 1-degree graph
  fastify.get('/:id/graph', async (request) => {
    const { id } = request.params;
    const userId = request.user.id;

    // Get all direct connections (both directions)
    const linksResult = await fastify.db.query(
      `SELECT nl.source_note_id, nl.target_note_id
       FROM note_links nl
       JOIN notes s ON s.id = nl.source_note_id AND s.deleted_at IS NULL AND s.user_id = $2
       JOIN notes t ON t.id = nl.target_note_id AND t.deleted_at IS NULL AND t.user_id = $2
       WHERE nl.source_note_id = $1 OR nl.target_note_id = $1`,
      [id, userId]
    );

    // Collect all unique note IDs
    const noteIds = new Set([id]);
    const edges = [];
    for (const row of linksResult.rows) {
      noteIds.add(row.source_note_id);
      noteIds.add(row.target_note_id);
      edges.push({ source: row.source_note_id, target: row.target_note_id, type: 'link' });
    }

    // Fetch note details + tags
    const notesResult = await fastify.db.query(
      `SELECT n.id, n.title,
              COALESCE(
                json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color))
                FILTER (WHERE t.id IS NOT NULL), '[]'
              ) AS tags
       FROM notes n
       LEFT JOIN note_tags nt ON nt.note_id = n.id
       LEFT JOIN tags t ON t.id = nt.tag_id
       WHERE n.id = ANY($1) AND n.user_id = $2 AND n.deleted_at IS NULL
       GROUP BY n.id`,
      [[...noteIds], userId]
    );

    const nodes = notesResult.rows.map(n => ({
      id: n.id,
      title: n.title,
      type: 'note',
      tags: n.tags
    }));

    // Add tag nodes and tag edges for the connected notes
    const tagNodes = new Map();
    for (const note of notesResult.rows) {
      for (const tag of note.tags) {
        if (!tagNodes.has(tag.id)) {
          tagNodes.set(tag.id, { id: tag.id, title: tag.name, type: 'tag', color: tag.color });
        }
        edges.push({ source: note.id, target: tag.id, type: 'tag' });
      }
    }

    return {
      data: {
        nodes: [...nodes, ...tagNodes.values()],
        edges
      }
    };
  });
}

module.exports = linkRoutes;
