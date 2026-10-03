// CR039 Phase A1 — research sources, books and chapters.
// A source is a note (note_type='source') plus a 1:1 `sources` citation row.
// Ownership is per user in application SQL (no RLS): every query filters by
// request.user.id, and join-table writes verify both parents first.

const { normalizeSourceUrl } = require('../utils/sourceUrl');
const {
  SOURCE_KINDS, metadataProperties, SourceError, createSource, sourceExistsError, hasAuthorAndDate, rollbackQuietly
} = require('../services/sourceService');
const { renderReferences } = require('../services/citationFormatter');

const METADATA_STATUSES = ['auto', 'llm', 'verified', 'incomplete'];

// Citation fields a client may write. url is normalized separately.
const META_FIELDS = ['source_kind', 'title', 'container', 'publisher', 'volume', 'issue', 'pages',
  'published_date', 'published_precision', 'doi', 'isbn'];

const nullableText = (max) => ({ type: ['string', 'null'], maxLength: max });

const uuidParam = (...names) => ({
  type: 'object',
  properties: Object.fromEntries(names.map(n => [n, { type: 'string', format: 'uuid' }]))
});

function notFound(reply, what) {
  return reply.code(404).send({ error: 'Not Found', message: `${what} not found`, statusCode: 404 });
}

function conflict(reply, error, message, data) {
  return reply.code(409).send({ error, message, statusCode: 409, ...(data ? { data } : {}) });
}

function badRequest(reply, message) {
  return reply.code(400).send({ error: 'Bad Request', message, statusCode: 400 });
}

// Source row + its chapters, excluding trashed notes. Shared by list and get.
const SOURCE_SELECT = `
  SELECT s.*, to_char(s.published_date, 'YYYY-MM-DD') AS published_date,
         n.title AS note_title, n.deleted_at,
         COALESCE((
           SELECT json_agg(json_build_object('id', c.id, 'book_id', c.book_id, 'label', c.label, 'title', c.title)
                           ORDER BY c.sort_order)
           FROM source_chapters sc JOIN chapters c ON c.id = sc.chapter_id AND c.user_id = s.user_id
           WHERE sc.source_note_id = s.note_id
         ), '[]') AS chapters
  FROM sources s
  JOIN notes n ON n.id = s.note_id`;
// published_date is re-selected as text (the later column wins in node-pg) so
// a DATE never round-trips through a timezone-shifted JS Date.

async function researchRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  // ---------------------------------------------------------------- books

  fastify.get('/books', async (request) => {
    const result = await fastify.db.query(
      `SELECT b.*, COUNT(c.id)::int AS chapter_count
       FROM books b LEFT JOIN chapters c ON c.book_id = b.id AND c.user_id = b.user_id
       WHERE b.user_id = $1
       GROUP BY b.id
       ORDER BY b.is_active DESC, b.created_at`,
      [request.user.id]
    );
    return { data: result.rows };
  });

  fastify.post('/books', {
    schema: {
      body: {
        type: 'object',
        required: ['title'],
        properties: { title: { type: 'string', minLength: 1, maxLength: 500 } }
      }
    }
  }, async (request, reply) => {
    const userId = request.user.id;
    // The first book becomes the active one; later books start inactive.
    try {
      const result = await fastify.db.query(
        `INSERT INTO books (user_id, title, is_active)
         VALUES ($1, $2, NOT EXISTS (SELECT 1 FROM books WHERE user_id = $1 AND is_active))
         RETURNING *`,
        [userId, request.body.title]
      );
      return reply.code(201).send({ data: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') return conflict(reply, 'book_conflict', 'Another book change is in progress; retry');
      throw err;
    }
  });

  fastify.put('/books/:id', {
    schema: {
      params: uuidParam('id'),
      body: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 500 },
          is_active: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    const userId = request.user.id;
    const { id } = request.params;
    const { title, is_active } = request.body;

    const client = await fastify.db.connect();
    let releaseErr;
    try {
      await client.query('BEGIN');
      const existing = await client.query('SELECT id FROM books WHERE id = $1 AND user_id = $2', [id, userId]);
      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        return notFound(reply, 'Book');
      }
      // books_one_active_idx is checked per row, so deactivate everything
      // first, then activate the one — two statements, one transaction.
      if (is_active === true) {
        await client.query('UPDATE books SET is_active = FALSE WHERE user_id = $1 AND is_active', [userId]);
      }
      const result = await client.query(
        `UPDATE books SET title = COALESCE($1, title), is_active = COALESCE($2, is_active)
         WHERE id = $3 AND user_id = $4 RETURNING *`,
        [title ?? null, is_active ?? null, id, userId]
      );
      await client.query('COMMIT');
      return { data: result.rows[0] };
    } catch (err) {
      releaseErr = await rollbackQuietly(client);
      if (err.code === '23505') return conflict(reply, 'book_conflict', 'Another book change is in progress; retry');
      throw err;
    } finally {
      client.release(releaseErr);
    }
  });

  fastify.delete('/books/:id', { schema: { params: uuidParam('id') } }, async (request, reply) => {
    const result = await fastify.db.query(
      'DELETE FROM books WHERE id = $1 AND user_id = $2 RETURNING id',
      [request.params.id, request.user.id]
    );
    if (result.rows.length === 0) return notFound(reply, 'Book');
    // Deleting the active book promotes the oldest remaining one, so the
    // Research panel and pickers never end up with no active book.
    await fastify.db.query(
      `UPDATE books SET is_active = TRUE
       WHERE id = (SELECT id FROM books WHERE user_id = $1 ORDER BY created_at LIMIT 1)
         AND NOT EXISTS (SELECT 1 FROM books WHERE user_id = $1 AND is_active)`,
      [request.user.id]
    ).catch(err => { if (err.code !== '23505') throw err; });
    return reply.code(204).send();
  });

  // ------------------------------------------------------------- chapters

  fastify.get('/books/:id/chapters', { schema: { params: uuidParam('id') } }, async (request, reply) => {
    const userId = request.user.id;
    const book = await fastify.db.query('SELECT id FROM books WHERE id = $1 AND user_id = $2', [request.params.id, userId]);
    if (book.rows.length === 0) return notFound(reply, 'Book');

    const result = await fastify.db.query(
      `SELECT c.*,
              (SELECT COUNT(*)::int FROM source_chapters sc
                 JOIN notes n ON n.id = sc.source_note_id AND n.deleted_at IS NULL AND n.user_id = c.user_id
               WHERE sc.chapter_id = c.id) AS source_count
       FROM chapters c
       WHERE c.book_id = $1 AND c.user_id = $2
       ORDER BY c.sort_order`,
      [request.params.id, userId]
    );
    return { data: result.rows };
  });

  fastify.post('/books/:id/chapters', {
    schema: {
      params: uuidParam('id'),
      body: {
        type: 'object',
        required: ['label', 'title'],
        properties: {
          label: { type: 'string', minLength: 1, maxLength: 50 },
          title: { type: 'string', minLength: 1, maxLength: 500 },
          part: nullableText(200),
          sort_order: { type: 'integer', minimum: 0 }
        }
      }
    }
  }, async (request, reply) => {
    const userId = request.user.id;
    const { label, title, part, sort_order } = request.body;
    const book = await fastify.db.query('SELECT id FROM books WHERE id = $1 AND user_id = $2', [request.params.id, userId]);
    if (book.rows.length === 0) return notFound(reply, 'Book');

    try {
      const result = await fastify.db.query(
        `INSERT INTO chapters (user_id, book_id, label, title, part, sort_order)
         VALUES ($1, $2, $3, $4, $5,
                 COALESCE($6, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM chapters WHERE book_id = $2)))
         RETURNING *`,
        [userId, request.params.id, label.trim(), title, part ?? null, sort_order ?? null]
      );
      return reply.code(201).send({ data: { ...result.rows[0], source_count: 0 } });
    } catch (err) {
      if (err.code === '23505') {
        return err.constraint === 'chapters_book_label_uq'
          ? conflict(reply, 'chapter_label_exists', `A chapter labelled "${label}" already exists in this book`)
          : conflict(reply, 'chapter_order_conflict', 'Another chapter already has that position; reload and retry');
      }
      throw err;
    }
  });

  fastify.put('/chapters/:id', {
    schema: {
      params: uuidParam('id'),
      body: {
        type: 'object',
        properties: {
          label: { type: 'string', minLength: 1, maxLength: 50 },
          title: { type: 'string', minLength: 1, maxLength: 500 },
          part: nullableText(200)
        }
      }
    }
  }, async (request, reply) => {
    const { label, title } = request.body;
    const setPart = 'part' in request.body;
    try {
      const result = await fastify.db.query(
        `UPDATE chapters
         SET label = COALESCE($1, label), title = COALESCE($2, title),
             part = CASE WHEN $3 THEN $4 ELSE part END
         WHERE id = $5 AND user_id = $6 RETURNING *`,
        [label?.trim() ?? null, title ?? null, setPart, request.body.part ?? null, request.params.id, request.user.id]
      );
      if (result.rows.length === 0) return notFound(reply, 'Chapter');
      return { data: result.rows[0] };
    } catch (err) {
      if (err.code === '23505') return conflict(reply, 'chapter_label_exists', `A chapter labelled "${label}" already exists in this book`);
      throw err;
    }
  });

  fastify.put('/books/:id/chapters/reorder', {
    schema: {
      params: uuidParam('id'),
      body: {
        type: 'object',
        required: ['chapter_ids'],
        properties: {
          chapter_ids: { type: 'array', items: { type: 'string', format: 'uuid' }, uniqueItems: true, maxItems: 500 }
        }
      }
    }
  }, async (request, reply) => {
    const userId = request.user.id;
    const bookId = request.params.id;
    const { chapter_ids } = request.body;

    const client = await fastify.db.connect();
    let releaseErr;
    try {
      await client.query('BEGIN');
      const book = await client.query('SELECT id FROM books WHERE id = $1 AND user_id = $2', [bookId, userId]);
      if (book.rows.length === 0) {
        await client.query('ROLLBACK');
        return notFound(reply, 'Book');
      }
      const current = await client.query(
        'SELECT id FROM chapters WHERE book_id = $1 AND user_id = $2 FOR UPDATE',
        [bookId, userId]
      );
      const currentIds = new Set(current.rows.map(r => r.id));
      // Must be the full set: a partial list would leave gaps or collisions.
      if (chapter_ids.length !== currentIds.size || !chapter_ids.every(id => currentIds.has(id))) {
        await client.query('ROLLBACK');
        return badRequest(reply, 'chapter_ids must list every chapter of the book exactly once');
      }
      // The (book_id, sort_order) constraint is DEFERRABLE, so renumbering in
      // one statement is checked at COMMIT, not row by row.
      await client.query(
        `UPDATE chapters c SET sort_order = v.ord - 1
         FROM unnest($1::uuid[]) WITH ORDINALITY AS v(id, ord)
         WHERE c.id = v.id AND c.book_id = $2 AND c.user_id = $3`,
        [chapter_ids, bookId, userId]
      );
      await client.query('COMMIT');
    } catch (err) {
      releaseErr = await rollbackQuietly(client);
      throw err;
    } finally {
      client.release(releaseErr);
    }

    const result = await fastify.db.query(
      'SELECT * FROM chapters WHERE book_id = $1 AND user_id = $2 ORDER BY sort_order',
      [bookId, userId]
    );
    return { data: result.rows };
  });

  fastify.delete('/chapters/:id', {
    schema: {
      params: uuidParam('id'),
      querystring: { type: 'object', properties: { force: { type: 'string', enum: ['true', 'false'] } } }
    }
  }, async (request, reply) => {
    const userId = request.user.id;
    const { id } = request.params;
    const chapter = await fastify.db.query(
      `SELECT c.id, (SELECT COUNT(*)::int FROM source_chapters WHERE chapter_id = c.id) AS assignments
       FROM chapters c WHERE c.id = $1 AND c.user_id = $2`,
      [id, userId]
    );
    if (chapter.rows.length === 0) return notFound(reply, 'Chapter');
    const { assignments } = chapter.rows[0];
    if (assignments > 0 && request.query.force !== 'true') {
      return conflict(reply, 'chapter_has_assignments',
        `This chapter has ${assignments} source(s) assigned; pass force=true to delete it anyway`, { assignments });
    }
    await fastify.db.query('DELETE FROM chapters WHERE id = $1 AND user_id = $2', [id, userId]);
    return reply.code(204).send();
  });

  // -------------------------------------------------------------- sources

  fastify.get('/sources', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          chapter_id: { type: 'string', format: 'uuid' },
          kind: { type: 'string', enum: SOURCE_KINDS },
          status: { type: 'string', enum: METADATA_STATUSES },
          q: { type: 'string', maxLength: 200 },
          needs_attention: { type: 'string', enum: ['true', 'false'] },
          unassigned: { type: 'string', enum: ['true', 'false'] },
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 200 },
          offset: { type: 'integer', minimum: 0, default: 0 }
        }
      }
    }
  }, async (request) => {
    const { chapter_id, kind, status, q, needs_attention, unassigned, limit = 200, offset = 0 } = request.query;
    const conditions = ['s.user_id = $1', 'n.deleted_at IS NULL'];
    const params = [request.user.id];
    let i = 2;

    if (chapter_id) {
      conditions.push(`EXISTS (SELECT 1 FROM source_chapters sc WHERE sc.source_note_id = s.note_id AND sc.chapter_id = $${i++})`);
      params.push(chapter_id);
    }
    if (unassigned === 'true') {
      conditions.push('NOT EXISTS (SELECT 1 FROM source_chapters sc WHERE sc.source_note_id = s.note_id)');
    }
    if (kind) { conditions.push(`s.source_kind = $${i++}`); params.push(kind); }
    if (status) { conditions.push(`s.metadata_status = $${i++}`); params.push(status); }
    if (needs_attention === 'true') conditions.push(`s.metadata_status <> 'verified'`);
    if (q) {
      conditions.push(`(s.title ILIKE $${i} OR s.container ILIKE $${i} OR s.authors::text ILIKE $${i}
                        OR n.content_tsv @@ plainto_tsquery('english', $${i + 1}))`);
      params.push(`%${q}%`, q);
      i += 2;
    }
    const where = conditions.join(' AND ');

    const count = await fastify.db.query(
      `SELECT COUNT(*)::int AS total FROM sources s JOIN notes n ON n.id = s.note_id WHERE ${where}`,
      params
    );
    params.push(limit, offset);
    const result = await fastify.db.query(
      `${SOURCE_SELECT}
       WHERE ${where}
       ORDER BY lower(COALESCE(s.authors->0->>'family', s.authors->0->>'literal', s.title)), lower(s.title)
       LIMIT $${i++} OFFSET $${i}`,
      params
    );
    return { data: result.rows, meta: { total: count.rows[0].total, limit, offset } };
  });

  fastify.get('/sources/:id', { schema: { params: uuidParam('id') } }, async (request, reply) => {
    const result = await fastify.db.query(
      `${SOURCE_SELECT} WHERE s.note_id = $1 AND s.user_id = $2`,
      [request.params.id, request.user.id]
    );
    if (result.rows.length === 0) return notFound(reply, 'Source');
    return { data: result.rows[0] };
  });

  // Manual entry (A1). The clipper (A2) and PDF upload (A3) build on this.
  fastify.post('/sources', {
    schema: {
      body: {
        type: 'object',
        required: ['source_kind', 'title'],
        properties: {
          ...metadataProperties,
          content: { type: 'string', maxLength: 900000 },
          chapter_ids: { type: 'array', items: { type: 'string', format: 'uuid' }, uniqueItems: true, maxItems: 500 }
        }
      }
    }
  }, async (request, reply) => {
    const userId = request.user.id;
    const body = request.body;
    try {
      const noteId = await createSource(fastify.db, userId, {
        ...body,
        // Typed in by the user, so complete entries are already verified.
        metadata_status: hasAuthorAndDate(body.authors, body.published_date) ? 'verified' : 'incomplete'
      });
      const created = await fastify.db.query(`${SOURCE_SELECT} WHERE s.note_id = $1 AND s.user_id = $2`, [noteId, userId]);
      return reply.code(201).send({ data: created.rows[0] });
    } catch (err) {
      if (err instanceof SourceError) return reply.code(err.statusCode).send(err.body);
      throw err;
    }
  });


  // Metadata edits. Any edit — including an empty body, which is the
  // "Verify" button — marks the metadata verified and clears LLM flags.
  // The citation title never renames the note, and vice versa.
  fastify.put('/sources/:id', {
    schema: {
      params: uuidParam('id'),
      body: { type: 'object', properties: metadataProperties }
    }
  }, async (request, reply) => {
    const userId = request.user.id;
    const body = request.body;
    const sets = [];
    const params = [];
    let i = 1;

    for (const field of META_FIELDS) {
      if (field in body) { sets.push(`${field} = $${i++}`); params.push(body[field]); }
    }
    if ('authors' in body) { sets.push(`authors = $${i++}`); params.push(JSON.stringify(body.authors)); }
    let url;
    if ('url' in body) {
      try {
        url = normalizeSourceUrl(body.url);
      } catch (err) {
        return badRequest(reply, err.message);
      }
      sets.push(`url = $${i++}`);
      params.push(url);
    }
    sets.push(`metadata_status = 'verified'`, `metadata_llm_fields = '{}'`);
    params.push(request.params.id, userId);

    try {
      const result = await fastify.db.query(
        `UPDATE sources s SET ${sets.join(', ')}
         FROM notes n
         WHERE s.note_id = $${i++} AND s.user_id = $${i} AND n.id = s.note_id AND n.deleted_at IS NULL
         RETURNING s.note_id`,
        params
      );
      if (result.rows.length === 0) return notFound(reply, 'Source');
    } catch (err) {
      if (err.code === '23505' && err.constraint === 'sources_user_url_idx') {
        const dup = await sourceExistsError(fastify.db, userId, url);
        return reply.code(dup.statusCode).send(dup.body);
      }
      throw err;
    }
    const updated = await fastify.db.query(`${SOURCE_SELECT} WHERE s.note_id = $1 AND s.user_id = $2`, [request.params.id, userId]);
    return { data: updated.rows[0] };
  });

  // Manual chapter assignment. Both parents are checked against the caller:
  // source_chapters has no user_id of its own.
  fastify.post('/sources/:id/chapters', {
    schema: {
      params: uuidParam('id'),
      body: {
        type: 'object',
        required: ['chapter_id'],
        properties: { chapter_id: { type: 'string', format: 'uuid' } }
      }
    }
  }, async (request, reply) => {
    const userId = request.user.id;
    const result = await fastify.db.query(
      `INSERT INTO source_chapters (source_note_id, chapter_id)
       SELECT s.note_id, c.id
       FROM sources s
       JOIN notes n ON n.id = s.note_id AND n.deleted_at IS NULL
       JOIN chapters c ON c.id = $2 AND c.user_id = $3
       WHERE s.note_id = $1 AND s.user_id = $3
       ON CONFLICT DO NOTHING
       RETURNING source_note_id`,
      [request.params.id, request.body.chapter_id, userId]
    );
    if (result.rows.length === 0) {
      // Either a parent is missing / not the caller's, or it was already assigned.
      const already = await fastify.db.query(
        `SELECT 1 FROM source_chapters sc
         JOIN sources s ON s.note_id = sc.source_note_id AND s.user_id = $3
         JOIN chapters c ON c.id = sc.chapter_id AND c.user_id = $3
         WHERE sc.source_note_id = $1 AND sc.chapter_id = $2`,
        [request.params.id, request.body.chapter_id, userId]
      );
      if (already.rows.length === 0) return notFound(reply, 'Source or chapter');
    }
    const updated = await fastify.db.query(`${SOURCE_SELECT} WHERE s.note_id = $1 AND s.user_id = $2`, [request.params.id, userId]);
    return reply.code(result.rows.length ? 201 : 200).send({ data: updated.rows[0] });
  });

  fastify.delete('/sources/:id/chapters/:chId', { schema: { params: uuidParam('id', 'chId') } }, async (request, reply) => {
    const result = await fastify.db.query(
      `DELETE FROM source_chapters sc
       USING sources s
       WHERE sc.source_note_id = s.note_id AND s.user_id = $3
         AND sc.source_note_id = $1 AND sc.chapter_id = $2
       RETURNING sc.source_note_id`,
      [request.params.id, request.params.chId, request.user.id]
    );
    if (result.rows.length === 0) return notFound(reply, 'Assignment');
    return reply.code(204).send();
  });

  // ------------------------------------------------------------ export
  // Phase B — Chicago "Sources and Further Reading" per chapter, or per book
  // (one section per chapter, in outline order). Returns HTML (Copy for Word),
  // Markdown and plain text together; the client copies or downloads them.
  async function chapterSources(chapterIds, userId) {
    const result = await fastify.db.query(
      `SELECT sc.chapter_id, s.source_kind, s.authors, s.title, s.container, s.publisher, s.volume,
              s.issue, s.pages, to_char(s.published_date, 'YYYY-MM-DD') AS published_date,
              s.published_precision, s.accessed_at, s.url, s.doi
       FROM source_chapters sc
       JOIN sources s ON s.note_id = sc.source_note_id AND s.user_id = $2
       JOIN notes n ON n.id = s.note_id AND n.deleted_at IS NULL
       WHERE sc.chapter_id = ANY($1::uuid[])`,
      [chapterIds, userId]
    );
    const byChapter = new Map(chapterIds.map(id => [id, []]));
    for (const row of result.rows) byChapter.get(row.chapter_id).push(row);
    return byChapter;
  }

  fastify.get('/chapters/:id/references', { schema: { params: uuidParam('id') } }, async (request, reply) => {
    const userId = request.user.id;
    const chapter = await fastify.db.query(
      'SELECT id, label, title FROM chapters WHERE id = $1 AND user_id = $2',
      [request.params.id, userId]
    );
    if (chapter.rows.length === 0) return notFound(reply, 'Chapter');
    const sources = await chapterSources([chapter.rows[0].id], userId);
    return { data: renderReferences([{ chapter: chapter.rows[0], sources: sources.get(chapter.rows[0].id) }]) };
  });

  fastify.get('/books/:id/references', { schema: { params: uuidParam('id') } }, async (request, reply) => {
    const userId = request.user.id;
    const book = await fastify.db.query('SELECT id FROM books WHERE id = $1 AND user_id = $2', [request.params.id, userId]);
    if (book.rows.length === 0) return notFound(reply, 'Book');
    const chapters = await fastify.db.query(
      'SELECT id, label, title FROM chapters WHERE book_id = $1 AND user_id = $2 ORDER BY sort_order',
      [request.params.id, userId]
    );
    const sources = await chapterSources(chapters.rows.map(c => c.id), userId);
    return { data: renderReferences(chapters.rows.map(c => ({ chapter: c, sources: sources.get(c.id) }))) };
  });

  // The only sanctioned way to change a source body (§6.1). Opts past the
  // guard_source_body trigger for this transaction only. Highlights arrive in
  // Phase C; until then there is nothing to re-anchor.
  fastify.post('/sources/:id/replace-body', {
    schema: {
      params: uuidParam('id'),
      body: {
        type: 'object',
        required: ['content'],
        properties: { content: { type: 'string', maxLength: 900000 } }
      }
    }
  }, async (request, reply) => {
    const userId = request.user.id;
    const client = await fastify.db.connect();
    let releaseErr;
    try {
      await client.query('BEGIN');
      const locked = await client.query(
        `SELECT s.note_id, s.pdf_attachment_id FROM sources s
         JOIN notes n ON n.id = s.note_id AND n.deleted_at IS NULL
         WHERE s.note_id = $1 AND s.user_id = $2
         FOR UPDATE OF s`,
        [request.params.id, userId]
      );
      if (locked.rows.length === 0) {
        await client.query('ROLLBACK');
        return notFound(reply, 'Source');
      }
      if (locked.rows[0].pdf_attachment_id) {
        await client.query('ROLLBACK');
        return reply.code(422).send({
          error: 'pdf_source', message: 'PDF sources anchor to the PDF; their body cannot be replaced', statusCode: 422
        });
      }
      await client.query(`SET LOCAL noted.allow_source_body = 'on'`);
      const note = await client.query(
        'UPDATE notes SET content = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
        [request.body.content, request.params.id, userId]
      );
      await client.query('COMMIT');
      return { data: { note: note.rows[0], anchored: 0, fuzzy: 0, orphaned: 0 } };
    } catch (err) {
      releaseErr = await rollbackQuietly(client);
      throw err;
    } finally {
      client.release(releaseErr);
    }
  });
}

module.exports = researchRoutes;
