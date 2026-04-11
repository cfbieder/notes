async function graphRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /api/v1/graph — full knowledge graph
  fastify.get('/', async (request) => {
    const userId = request.user.id;

    // All non-deleted notes with their tags
    const notesResult = await fastify.db.query(
      `SELECT n.id, n.title,
              COALESCE(
                json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color))
                FILTER (WHERE t.id IS NOT NULL), '[]'
              ) AS tags
       FROM notes n
       LEFT JOIN note_tags nt ON nt.note_id = n.id
       LEFT JOIN tags t ON t.id = nt.tag_id
       WHERE n.user_id = $1 AND n.deleted_at IS NULL
       GROUP BY n.id`,
      [userId]
    );

    // All note-to-note links
    const linksResult = await fastify.db.query(
      `SELECT nl.source_note_id AS source, nl.target_note_id AS target
       FROM note_links nl
       JOIN notes s ON s.id = nl.source_note_id AND s.deleted_at IS NULL AND s.user_id = $1
       JOIN notes t ON t.id = nl.target_note_id AND t.deleted_at IS NULL AND t.user_id = $1`,
      [userId]
    );

    // Build nodes (notes)
    const nodes = notesResult.rows.map(n => ({
      id: n.id,
      title: n.title,
      type: 'note',
      linkCount: 0
    }));

    // Build edges (note-to-note links)
    const edges = linksResult.rows.map(r => ({
      source: r.source,
      target: r.target,
      type: 'link'
    }));

    // Count links per node
    const linkCounts = {};
    for (const edge of edges) {
      linkCounts[edge.source] = (linkCounts[edge.source] || 0) + 1;
      linkCounts[edge.target] = (linkCounts[edge.target] || 0) + 1;
    }
    for (const node of nodes) {
      node.linkCount = linkCounts[node.id] || 0;
    }

    // Build tag nodes and tag edges
    const tagNodes = new Map();
    const tagEdges = [];

    for (const note of notesResult.rows) {
      for (const tag of note.tags) {
        if (!tagNodes.has(tag.id)) {
          tagNodes.set(tag.id, {
            id: tag.id,
            title: tag.name,
            type: 'tag',
            color: tag.color,
            linkCount: 0
          });
        }
        tagNodes.get(tag.id).linkCount++;
        tagEdges.push({ source: note.id, target: tag.id, type: 'tag' });
      }
    }

    return {
      data: {
        nodes: [...nodes, ...tagNodes.values()],
        edges: [...edges, ...tagEdges]
      }
    };
  });
}

module.exports = graphRoutes;
