const { MEMBERS } = require('../services/sourceService');

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
          // CR039 §10.4: is:source and ch:<label> (active book's chapter label)
          note_type: { type: 'string', enum: ['note', 'idea', 'source'] },
          chapter: { type: 'string', minLength: 1, maxLength: 50 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 }
        }
      }
    }
  }, async (request) => {
    const { q, notebook_id, tag_id, from_drive, auto_update, from, to, note_type, chapter, limit = 20, offset = 0 } = request.query;

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

    if (note_type) {
      conditions.push(`n.note_type = $${idx++}`);
      params.push(note_type);
    }

    // ch:<label> — sources in that chapter of the user's active book, assigned by
    // hand or via a highlight (MEMBERS is owner-checked per arm).
    if (chapter) {
      conditions.push(`EXISTS (
        SELECT 1 FROM ${MEMBERS} m
        JOIN chapters c ON c.id = m.chapter_id AND c.user_id = $1
        JOIN books b ON b.id = c.book_id AND b.user_id = $1 AND b.is_active
        WHERE m.source_note_id = n.id AND lower(c.label) = lower($${idx++}))`);
      params.push(chapter);
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

  // CR039 §10.4 — highlights as their own result type: quotes and comments
  // matching the query, newest-ranked first, trashed sources excluded. Returned
  // as plain fields (no ts_headline HTML): the client renders them as text.
  fastify.get('/highlights', {
    schema: {
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', minLength: 1, maxLength: 500 },
          chapter: { type: 'string', minLength: 1, maxLength: 50 },
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 }
        }
      }
    }
  }, async (request) => {
    const { q, chapter, limit = 10 } = request.query;
    const params = [request.user.id, q];
    let chapterJoin = '';
    if (chapter) {
      params.push(chapter);
      chapterJoin = `JOIN highlight_chapters hc ON hc.highlight_id = h.id
        JOIN chapters c ON c.id = hc.chapter_id AND c.user_id = $1 AND lower(c.label) = lower($3)
        JOIN books b ON b.id = c.book_id AND b.user_id = $1 AND b.is_active`;
    }
    params.push(limit);
    const r = await fastify.db.query(
      `SELECT DISTINCT ON (rank, h.id) h.id, h.source_note_id, h.exact, h.comment, h.color, h.anchor_status,
              s.title AS source_title, ts_rank(h.search_tsv, websearch_to_tsquery('english', $2)) AS rank
       FROM highlights h
       JOIN sources s ON s.note_id = h.source_note_id AND s.user_id = $1
       JOIN notes n ON n.id = s.note_id AND n.deleted_at IS NULL
       ${chapterJoin}
       WHERE h.user_id = $1 AND h.search_tsv @@ websearch_to_tsquery('english', $2)
       ORDER BY rank DESC, h.id
       LIMIT $${params.length}`,
      params
    );
    return { data: r.rows.map(({ rank, ...h }) => h), meta: { query: q } };
  });
}

module.exports = searchRoutes;
