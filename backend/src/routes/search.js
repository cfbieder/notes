async function searchRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /api/v1/search
  fastify.get('/', {
    schema: {
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', minLength: 1 },
          notebook_id: { type: 'string', format: 'uuid' },
          tag_id: { type: 'string', format: 'uuid' },
          from: { type: 'string', format: 'date' },
          to: { type: 'string', format: 'date' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 }
        }
      }
    }
  }, async (request) => {
    const { q, notebook_id, tag_id, from, to, limit = 20, offset = 0 } = request.query;

    // Match note body OR OCR text from any attachment on the note.
    const conditions = [
      'n.user_id = $1',
      'n.deleted_at IS NULL',
      `(n.content_tsv @@ websearch_to_tsquery('english', $2)
        OR a.ocr_tsv @@ websearch_to_tsquery('english', $2))`
    ];
    const params = [request.user.id, q];
    let idx = 3;

    let joinClause = 'LEFT JOIN attachments a ON a.note_id = n.id';

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

    // Results with rank. A note may match via body, OCR, or both — take the max
    // rank across the join and collapse per-note with GROUP BY.
    params.push(limit, offset);
    const result = await fastify.db.query(
      `SELECT n.id, n.title, n.notebook_id, n.is_inbox, n.created_at, n.updated_at,
              MAX(GREATEST(
                ts_rank(n.content_tsv, websearch_to_tsquery('english', $2)),
                ts_rank(COALESCE(a.ocr_tsv, ''::tsvector), websearch_to_tsquery('english', $2))
              )) AS rank,
              ts_headline('english',
                n.content || ' ' || COALESCE(string_agg(DISTINCT a.ocr_text, ' '), ''),
                websearch_to_tsquery('english', $2),
                'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MaxWords=30'
              ) AS snippet
       FROM notes n ${joinClause}
       WHERE ${where}
       GROUP BY n.id
       ORDER BY rank DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      params
    );

    return {
      data: result.rows,
      meta: { total: countResult.rows[0].total, query: q, limit, offset }
    };
  });
}

module.exports = searchRoutes;
