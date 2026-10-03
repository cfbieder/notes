// CR039 Phase C — highlights on research sources (§5.3, §7.3).
// Ownership: highlights carry user_id; highlight_chapters has none, so every
// write verifies the highlight's source and each chapter belong to the caller.
// Anchoring runs in the browser (§16 #13): the Reader re-finds quotes in what
// it rendered and reports statuses back through PUT …/highlights/anchors.

// The fixed legend (§16 #3), validated here rather than by a CHECK so a later
// user-defined legend needs no migration.
const COLORS = ['yellow', 'red', 'green', 'blue'];
const STATUSES = ['anchored', 'fuzzy', 'orphaned'];

const uuid = { type: 'string', format: 'uuid' };
const uuidParam = (...names) => ({ type: 'object', properties: Object.fromEntries(names.map(n => [n, uuid])) });
const chapterIdsSchema = { type: 'array', items: uuid, uniqueItems: true, maxItems: 50 };

function notFound(reply, what) {
  return reply.code(404).send({ error: 'Not Found', message: `${what} not found`, statusCode: 404 });
}

// Highlight rows + their chapters. Callers add the WHERE with a user filter.
const HIGHLIGHT_SELECT = `
  SELECT h.id, h.source_note_id, h.anchor_type, h.exact, h.prefix, h.suffix, h.position_start, h.position_end,
         h.page_index, h.page_label, h.rects, h.anchor_status, h.color, h.comment, h.created_at, h.updated_at,
         COALESCE((
           SELECT json_agg(json_build_object('id', c.id, 'label', c.label, 'title', c.title) ORDER BY c.sort_order)
           FROM highlight_chapters hc JOIN chapters c ON c.id = hc.chapter_id AND c.user_id = h.user_id
           WHERE hc.highlight_id = h.id
         ), '[]') AS chapters
  FROM highlights h`;

async function highlightRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  async function ownedChapterCount(db, userId, chapterIds) {
    if (!chapterIds.length) return 0;
    const r = await db.query('SELECT COUNT(*)::int AS n FROM chapters WHERE user_id = $1 AND id = ANY($2::uuid[])', [userId, chapterIds]);
    return r.rows[0].n;
  }

  async function getHighlight(id, userId) {
    const r = await fastify.db.query(`${HIGHLIGHT_SELECT} WHERE h.id = $1 AND h.user_id = $2`, [id, userId]);
    return r.rows[0] || null;
  }

  fastify.get('/sources/:id/highlights', { schema: { params: uuidParam('id') } }, async (request, reply) => {
    const userId = request.user.id;
    const own = await fastify.db.query('SELECT 1 FROM sources WHERE note_id = $1 AND user_id = $2', [request.params.id, userId]);
    if (own.rows.length === 0) return notFound(reply, 'Source');
    const r = await fastify.db.query(
      `${HIGHLIGHT_SELECT} WHERE h.source_note_id = $1 AND h.user_id = $2
       ORDER BY h.page_index NULLS FIRST, h.position_start NULLS LAST, (h.rects->0->>'y')::float NULLS LAST, h.created_at`,
      [request.params.id, userId]
    );
    return { data: r.rows };
  });

  fastify.post('/sources/:id/highlights', {
    schema: {
      params: uuidParam('id'),
      body: {
        type: 'object',
        required: ['anchor_type', 'exact'],
        properties: {
          anchor_type: { type: 'string', enum: ['text_quote', 'pdf'] },
          exact: { type: 'string', minLength: 1, maxLength: 5000 },
          prefix: { type: ['string', 'null'], maxLength: 200 },
          suffix: { type: ['string', 'null'], maxLength: 200 },
          position_start: { type: ['integer', 'null'], minimum: 0 },
          position_end: { type: ['integer', 'null'], minimum: 0 },
          page_index: { type: ['integer', 'null'], minimum: 0 },
          page_label: { type: ['string', 'null'], maxLength: 20 },
          rects: {
            type: ['array', 'null'],
            maxItems: 200,
            items: {
              type: 'object',
              required: ['x', 'y', 'w', 'h'],
              properties: {
                x: { type: 'number', minimum: 0, maximum: 1 }, y: { type: 'number', minimum: 0, maximum: 1 },
                w: { type: 'number', minimum: 0, maximum: 1 }, h: { type: 'number', minimum: 0, maximum: 1 }
              },
              additionalProperties: false
            }
          },
          color: { type: 'string', enum: COLORS },
          comment: { type: ['string', 'null'], maxLength: 10000 },
          chapter_ids: chapterIdsSchema
        },
        // A PDF highlight is its page and boxes; without them it can't be shown.
        if: { properties: { anchor_type: { const: 'pdf' } } },
        then: { required: ['page_index', 'rects'], properties: { page_index: { type: 'integer' }, rects: { type: 'array', minItems: 1 } } }
      }
    }
  }, async (request, reply) => {
    const userId = request.user.id;
    const b = request.body;
    const source = await fastify.db.query(
      `SELECT s.note_id FROM sources s JOIN notes n ON n.id = s.note_id AND n.deleted_at IS NULL
       WHERE s.note_id = $1 AND s.user_id = $2`,
      [request.params.id, userId]
    );
    if (source.rows.length === 0) return notFound(reply, 'Source');
    const chapterIds = b.chapter_ids || [];
    if ((await ownedChapterCount(fastify.db, userId, chapterIds)) !== chapterIds.length) return notFound(reply, 'Chapter');

    const client = await fastify.db.connect();
    let releaseErr;
    let id;
    try {
      await client.query('BEGIN');
      const ins = await client.query(
        `INSERT INTO highlights (user_id, source_note_id, anchor_type, exact, prefix, suffix, position_start, position_end,
                                 page_index, page_label, rects, color, comment)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [userId, request.params.id, b.anchor_type, b.exact, b.prefix ?? null, b.suffix ?? null,
          b.position_start ?? null, b.position_end ?? null, b.page_index ?? null, b.page_label ?? null,
          b.rects ? JSON.stringify(b.rects) : null, b.color || 'yellow', b.comment ?? null]
      );
      id = ins.rows[0].id;
      if (chapterIds.length) {
        await client.query('INSERT INTO highlight_chapters (highlight_id, chapter_id) SELECT $1, unnest($2::uuid[])', [id, chapterIds]);
      }
      await client.query('COMMIT');
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (e) { releaseErr = e; }
      throw err;
    } finally {
      client.release(releaseErr);
    }
    return reply.code(201).send({ data: await getHighlight(id, userId) });
  });

  fastify.put('/highlights/:id', {
    schema: {
      params: uuidParam('id'),
      body: {
        type: 'object',
        properties: {
          color: { type: 'string', enum: COLORS },
          comment: { type: ['string', 'null'], maxLength: 10000 },
          chapter_ids: chapterIdsSchema
        }
      }
    }
  }, async (request, reply) => {
    const userId = request.user.id;
    const { id } = request.params;
    const b = request.body;
    if (!(await getHighlight(id, userId))) return notFound(reply, 'Highlight');
    if (b.chapter_ids && (await ownedChapterCount(fastify.db, userId, b.chapter_ids)) !== b.chapter_ids.length) {
      return notFound(reply, 'Chapter');
    }
    const client = await fastify.db.connect();
    let releaseErr;
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE highlights SET color = COALESCE($1, color),
                comment = CASE WHEN $2 THEN $3 ELSE comment END
         WHERE id = $4 AND user_id = $5`,
        [b.color ?? null, 'comment' in b, b.comment ?? null, id, userId]
      );
      if (b.chapter_ids) {
        await client.query('DELETE FROM highlight_chapters WHERE highlight_id = $1', [id]);
        if (b.chapter_ids.length) {
          await client.query('INSERT INTO highlight_chapters (highlight_id, chapter_id) SELECT $1, unnest($2::uuid[])', [id, b.chapter_ids]);
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (e) { releaseErr = e; }
      throw err;
    } finally {
      client.release(releaseErr);
    }
    return { data: await getHighlight(id, userId) };
  });

  // §16 #13 — the Reader reports what it found when it re-anchored. Only the
  // status and the position hint change; the quote itself is never rewritten.
  fastify.put('/sources/:id/highlights/anchors', {
    schema: {
      params: uuidParam('id'),
      body: {
        type: 'object',
        required: ['updates'],
        properties: {
          updates: {
            type: 'array',
            maxItems: 2000,
            items: {
              type: 'object',
              required: ['id', 'anchor_status'],
              properties: {
                id: uuid,
                anchor_status: { type: 'string', enum: STATUSES },
                position_start: { type: ['integer', 'null'], minimum: 0 },
                position_end: { type: ['integer', 'null'], minimum: 0 }
              },
              additionalProperties: false
            }
          }
        }
      }
    }
  }, async (request) => {
    // De-duplicate by id (last wins) so UPDATE … FROM never picks a row arbitrarily.
    const updates = [...new Map(request.body.updates.map(u => [u.id, u])).values()];
    if (!updates.length) return { data: { updated: 0 } };
    const r = await fastify.db.query(
      `UPDATE highlights h
       SET anchor_status = u.anchor_status,
           position_start = COALESCE(u.position_start, h.position_start),
           position_end = COALESCE(u.position_end, h.position_end)
       FROM jsonb_to_recordset($1::jsonb) AS u(id uuid, anchor_status text, position_start int, position_end int)
       WHERE h.id = u.id AND h.source_note_id = $2 AND h.user_id = $3
         AND (h.anchor_status IS DISTINCT FROM u.anchor_status
              OR h.position_start IS DISTINCT FROM COALESCE(u.position_start, h.position_start)
              OR h.position_end IS DISTINCT FROM COALESCE(u.position_end, h.position_end))
       RETURNING h.id`,
      [JSON.stringify(updates), request.params.id, request.user.id]
    );
    return { data: { updated: r.rowCount } };
  });

  fastify.delete('/highlights/:id', { schema: { params: uuidParam('id') } }, async (request, reply) => {
    const r = await fastify.db.query('DELETE FROM highlights WHERE id = $1 AND user_id = $2 RETURNING id', [request.params.id, request.user.id]);
    if (r.rows.length === 0) return notFound(reply, 'Highlight');
    return reply.code(204).send();
  });

  // Every highlight for a chapter, grouped by source (trashed sources excluded).
  fastify.get('/chapters/:id/highlights', { schema: { params: uuidParam('id') } }, async (request, reply) => {
    const userId = request.user.id;
    const chapter = await fastify.db.query('SELECT id FROM chapters WHERE id = $1 AND user_id = $2', [request.params.id, userId]);
    if (chapter.rows.length === 0) return notFound(reply, 'Chapter');
    const r = await fastify.db.query(
      `${HIGHLIGHT_SELECT}
       JOIN highlight_chapters hcx ON hcx.highlight_id = h.id AND hcx.chapter_id = $1
       JOIN notes n ON n.id = h.source_note_id AND n.deleted_at IS NULL
       WHERE h.user_id = $2
       ORDER BY h.source_note_id, h.page_index NULLS FIRST, h.position_start NULLS LAST, (h.rects->0->>'y')::float NULLS LAST, h.created_at`,
      [request.params.id, userId]
    );
    const sourceIds = [...new Set(r.rows.map(h => h.source_note_id))];
    const sources = sourceIds.length ? (await fastify.db.query(
      `SELECT note_id, title, authors, container, to_char(published_date, 'YYYY-MM-DD') AS published_date,
              published_precision, source_kind
       FROM sources WHERE note_id = ANY($1::uuid[]) AND user_id = $2`,
      [sourceIds, userId]
    )).rows : [];
    const byId = new Map(sources.map(s => [s.note_id, { source: s, highlights: [] }]));
    for (const h of r.rows) byId.get(h.source_note_id)?.highlights.push(h);
    return { data: [...byId.values()] };
  });
}

module.exports = highlightRoutes;
module.exports.COLORS = COLORS;
