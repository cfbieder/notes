async function searchRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /api/v1/search
  fastify.get('/', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string', minLength: 0 },
          notebook_id: { type: 'string', format: 'uuid' },
          tag_id: { type: 'string', format: 'uuid' },
          from_drive: { type: 'string', enum: ['true'] },
          auto_update: { type: 'string', enum: ['true'] },
          from: { type: 'string', format: 'date' },
          to: { type: 'string', format: 'date' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 }
        }
      }
    }
  }, async (request) => {
    const { q, notebook_id, tag_id, from_drive, auto_update, from, to, limit = 20, offset = 0 } = request.query;

    const hasTextQuery = q && q.trim().length > 0;

    // Base conditions
    const conditions = [
      'n.user_id = $1',
      'n.deleted_at IS NULL'
    ];
    const params = [request.user.id];
    let idx = 2;

    // Full-text search condition (only when text query is provided)
    if (hasTextQuery) {
      params.push(q);
      conditions.push(
        `(n.content_tsv @@ websearch_to_tsquery('english', $${idx})
          OR a.ocr_tsv @@ websearch_to_tsquery('english', $${idx}))`
      );
      idx++;
    }

    let joinClause = 'LEFT JOIN attachments a ON a.note_id = n.id';

    // Filter: from:drive — notes that were imported from Google Drive
    if (from_drive === 'true') {
      joinClause += ' JOIN import_history ih ON ih.note_id = n.id AND ih.status = \'success\'';
    }

    // Filter: is:auto-update — notes with auto_update enabled
    if (auto_update === 'true') {
      conditions.push('n.auto_update = TRUE');
    }

    if (notebook_id) {
      conditions.push(`n.notebook_id = $${idx++}`);
      params.push(notebook_id);
    }

    if (tag_id) {
      joinClause += ' JOIN note_tags nt ON nt.note_id = n.id';
      conditions.push(`nt.tag_id = $${idx++}`);
      params.push(tag_id);
    }

    if (from) {
      conditions.push(`n.created_at >= $${idx++}`);
      params.push(from);
    }

    if (to) {
      conditions.push(`n.created_at <= $${idx++}`);
      params.push(to);
    }

    const where = conditions.join(' AND ');

    // Count
    const countResult = await fastify.db.query(
      `SELECT COUNT(DISTINCT n.id)::int AS total FROM notes n ${joinClause} WHERE ${where}`,
      params
    );

    // Results — use ranking + snippets when text query present, otherwise sort by updated_at
    params.push(limit, offset);

    let result;
    if (hasTextQuery) {
      const qIdx = 2; // q is always $2 when hasTextQuery
      result = await fastify.db.query(
        `SELECT n.id, n.title, n.notebook_id, n.note_type, n.auto_update, n.format, n.created_at, n.updated_at,
                MAX(GREATEST(
                  ts_rank(n.content_tsv, websearch_to_tsquery('english', $${qIdx})),
                  ts_rank(COALESCE(a.ocr_tsv, ''::tsvector), websearch_to_tsquery('english', $${qIdx}))
                )) AS rank,
                ts_headline('english',
                  n.content || ' ' || COALESCE(string_agg(DISTINCT a.ocr_text, ' '), ''),
                  websearch_to_tsquery('english', $${qIdx}),
                  'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MaxWords=30'
                ) AS snippet
         FROM notes n ${joinClause}
         WHERE ${where}
         GROUP BY n.id
         ORDER BY rank DESC
         LIMIT $${idx++} OFFSET $${idx}`,
        params
      );
    } else {
      // Filter-only search (no text query) — return notes sorted by updated_at
      result = await fastify.db.query(
        `SELECT DISTINCT n.id, n.title, n.notebook_id, n.note_type, n.auto_update, n.format,
                n.created_at, n.updated_at,
                0 AS rank,
                LEFT(n.content, 120) AS snippet
         FROM notes n ${joinClause}
         WHERE ${where}
         ORDER BY n.updated_at DESC
         LIMIT $${idx++} OFFSET $${idx}`,
        params
      );
    }

    return {
      data: result.rows,
      meta: { total: countResult.rows[0].total, query: q || '', limit, offset }
    };
  });
}

module.exports = searchRoutes;
