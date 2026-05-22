const { extractWikilinks, resolveWikilinks } = require('../services/wikilinkParser');
const llmService = require('../services/llmService');

async function syncWikilinks(fastify, noteId, userId, content) {
  const extracted = extractWikilinks(content);

  // Always clear old links first
  await fastify.db.query('DELETE FROM note_links WHERE source_note_id = $1', [noteId]);

  if (extracted.length === 0) return;

  // Batch lookup all referenced titles
  const titles = [...new Set(extracted.map(e => e.title.toLowerCase()))];
  const titleResult = await fastify.db.query(
    `SELECT id, LOWER(title) AS lower_title FROM notes
     WHERE user_id = $1 AND deleted_at IS NULL AND LOWER(title) = ANY($2) AND id != $3`,
    [userId, titles, noteId]
  );

  const titleToId = {};
  titleResult.rows.forEach(r => { titleToId[r.lower_title] = r.id; });

  const { resolved } = resolveWikilinks(extracted, titleToId);
  if (resolved.length === 0) return;

  const values = resolved.map((_, i) =>
    `($1, $${i * 2 + 2}, $${i * 2 + 3})`
  ).join(', ');
  const params = [noteId];
  resolved.forEach(r => { params.push(r.targetNoteId, r.contextSnippet); });

  await fastify.db.query(
    `INSERT INTO note_links (source_note_id, target_note_id, context_snippet)
     VALUES ${values}
     ON CONFLICT (source_note_id, target_note_id) DO UPDATE SET context_snippet = EXCLUDED.context_snippet`,
    params
  );
}

async function noteRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /api/v1/notes — excludes trashed notes
  fastify.get('/', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          notebook_id: { type: 'string', format: 'uuid' },
          tag_id: { type: 'string', format: 'uuid' },
          is_inbox: { type: 'string', enum: ['true', 'false'] },
          note_type: { type: 'string', enum: ['note', 'idea'] },
          search: { type: 'string' },
          pinned: { type: 'string', enum: ['true', 'false'] },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          offset: { type: 'integer', minimum: 0, default: 0 }
        }
      }
    }
  }, async (request) => {
    const { notebook_id, tag_id, is_inbox, note_type, search, pinned, limit = 50, offset = 0 } = request.query;
    const userId = request.user.id;

    const conditions = ['n.user_id = $1', 'n.deleted_at IS NULL'];
    const params = [userId];
    let paramIndex = 2;

    if (notebook_id) {
      conditions.push(`n.notebook_id = $${paramIndex++}`);
      params.push(notebook_id);
    }

    if (is_inbox !== undefined) {
      conditions.push(`n.is_inbox = $${paramIndex++}`);
      params.push(is_inbox === 'true');
    }

    if (note_type !== undefined) {
      conditions.push(`n.note_type = $${paramIndex++}`);
      params.push(note_type);
    }

    if (pinned !== undefined) {
      conditions.push(`n.pinned = $${paramIndex++}`);
      params.push(pinned === 'true');
    }

    if (search) {
      // Match title substring (case-insensitive) OR content full-text
      conditions.push(`(n.title ILIKE $${paramIndex} OR n.content_tsv @@ plainto_tsquery('english', $${paramIndex + 1}))`);
      params.push(`%${search}%`, search);
      paramIndex += 2;
    }

    let joinClause = '';
    if (tag_id) {
      joinClause = `JOIN note_tags nt ON nt.note_id = n.id`;
      conditions.push(`nt.tag_id = $${paramIndex++}`);
      params.push(tag_id);
    }

    const where = conditions.join(' AND ');

    const countResult = await fastify.db.query(
      `SELECT COUNT(DISTINCT n.id)::int AS total FROM notes n ${joinClause} WHERE ${where}`,
      params
    );

    params.push(limit, offset);
    const result = await fastify.db.query(
      `SELECT DISTINCT n.id, n.title, n.content, n.notebook_id, n.is_inbox, n.note_type, n.pinned,
              n.reminder_at, n.created_at, n.updated_at
       FROM notes n ${joinClause}
       WHERE ${where}
       ORDER BY n.pinned DESC, n.updated_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );

    return {
      data: result.rows,
      meta: { total: countResult.rows[0].total, limit, offset }
    };
  });

  // GET /api/v1/notes/trash — trashed notes only
  fastify.get('/trash', async (request) => {
    const result = await fastify.db.query(
      `SELECT id, title, content, notebook_id, deleted_at, created_at, updated_at
       FROM notes
       WHERE user_id = $1 AND deleted_at IS NOT NULL
       ORDER BY deleted_at DESC`,
      [request.user.id]
    );
    return { data: result.rows };
  });

  // GET /api/v1/notes/:id
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params;

    const result = await fastify.db.query(
      `SELECT n.*,
              COALESCE(
                json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color))
                FILTER (WHERE t.id IS NOT NULL), '[]'
              ) AS tags,
              EXISTS(
                SELECT 1 FROM import_history ih
                WHERE ih.note_id = n.id AND ih.status = 'success'
              ) AS drive_imported
       FROM notes n
       LEFT JOIN note_tags nt ON nt.note_id = n.id
       LEFT JOIN tags t ON t.id = nt.tag_id
       WHERE n.id = $1 AND n.user_id = $2
       GROUP BY n.id`,
      [id, request.user.id]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Not Found', message: 'Note not found', statusCode: 404 });
    }
    return { data: result.rows[0] };
  });

  // POST /api/v1/notes
  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        properties: {
          title: { type: 'string', maxLength: 500 },
          content: { type: 'string' },
          notebook_id: { type: 'string', format: 'uuid' },
          is_inbox: { type: 'boolean' },
          note_type: { type: 'string', enum: ['note', 'idea'] },
          reminder_at: { type: 'string', format: 'date-time' },
          client_id: { type: 'string', format: 'uuid' },
          tag_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
          is_ai_generated: { type: 'boolean' },
          ai_prompt: { type: 'string', maxLength: 4000 },
          format: { type: 'string', enum: ['markdown', 'html'] }
        }
      }
    }
  }, async (request, reply) => {
    const { title, content, notebook_id, is_inbox, note_type, reminder_at, client_id, tag_ids, is_ai_generated, ai_prompt, format } = request.body;
    const userId = request.user.id;

    // Idempotency: if this client_id already exists for the user, return existing row.
    if (client_id) {
      const existing = await fastify.db.query(
        'SELECT * FROM notes WHERE user_id = $1 AND client_id = $2',
        [userId, client_id]
      );
      if (existing.rows.length > 0) {
        return reply.code(200).send({ data: existing.rows[0] });
      }
    }

    const finalNoteType = note_type || 'note';
    let finalNotebookId = notebook_id;
    // Ideas are notebook-less by default; only regular notes fall back to default notebook
    if (!finalNotebookId && !is_inbox && finalNoteType !== 'idea') {
      const defaultNb = await fastify.db.query(
        'SELECT id FROM notebooks WHERE user_id = $1 AND is_default = TRUE LIMIT 1',
        [userId]
      );
      if (defaultNb.rows.length > 0) {
        finalNotebookId = defaultNb.rows[0].id;
      }
    }

    const finalFormat = format || 'markdown';

    const result = await fastify.db.query(
      `INSERT INTO notes (user_id, notebook_id, title, content, is_inbox, note_type, reminder_at, client_id, is_ai_generated, ai_prompt, format)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [userId, finalNotebookId || null, title || 'Untitled', content || '', is_inbox || false, finalNoteType, reminder_at || null, client_id || null, is_ai_generated || false, ai_prompt || null, finalFormat]
    );

    const note = result.rows[0];

    if (tag_ids && tag_ids.length > 0) {
      const tagValues = tag_ids.map((tid, i) => `($1, $${i + 2})`).join(', ');
      const tagParams = [note.id, ...tag_ids];
      await fastify.db.query(
        `INSERT INTO note_tags (note_id, tag_id) VALUES ${tagValues} ON CONFLICT DO NOTHING`,
        tagParams
      );
    }

    // Wikilinks are markdown-only in v1 (CR023).
    if (content && finalFormat === 'markdown') {
      await syncWikilinks(fastify, note.id, userId, content);
    }

    return reply.code(201).send({ data: note });
  });

  // PUT /api/v1/notes/:id
  fastify.put('/:id', {
    schema: {
      body: {
        type: 'object',
        properties: {
          title: { type: 'string', maxLength: 500 },
          content: { type: 'string' },
          notebook_id: { type: 'string', format: 'uuid' },
          pinned: { type: 'boolean' },
          is_inbox: { type: 'boolean' },
          note_type: { type: 'string', enum: ['note', 'idea'] },
          reminder_at: { type: ['string', 'null'], format: 'date-time', nullable: true },
          auto_update: { type: 'boolean' },
          tag_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
          format: { type: 'string', enum: ['markdown', 'html'] }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const { title, content, notebook_id, pinned, is_inbox, note_type, tag_ids, format } = request.body;

    // Build SET clause — reminder_at needs explicit null handling
    const setClauses = [
      'title = COALESCE($1, title)',
      'content = COALESCE($2, content)',
      'notebook_id = COALESCE($3, notebook_id)',
      'pinned = COALESCE($4, pinned)',
      'is_inbox = COALESCE($5, is_inbox)',
      'note_type = COALESCE($6, note_type)'
    ];
    const params = [title, content, notebook_id, pinned, is_inbox, note_type];
    let idx = 7;

    if ('reminder_at' in request.body) {
      setClauses.push(`reminder_at = $${idx++}`);
      params.push(request.body.reminder_at);
    }

    if ('auto_update' in request.body) {
      setClauses.push(`auto_update = $${idx++}`);
      params.push(request.body.auto_update);
    }

    if (format !== undefined) {
      setClauses.push(`format = $${idx++}`);
      params.push(format);
    }

    params.push(id, request.user.id);
    const result = await fastify.db.query(
      `UPDATE notes
       SET ${setClauses.join(', ')}
       WHERE id = $${idx++} AND user_id = $${idx} AND deleted_at IS NULL
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Not Found', message: 'Note not found', statusCode: 404 });
    }

    if (tag_ids !== undefined) {
      await fastify.db.query('DELETE FROM note_tags WHERE note_id = $1', [id]);
      if (tag_ids.length > 0) {
        const tagValues = tag_ids.map((tid, i) => `($1, $${i + 2})`).join(', ');
        await fastify.db.query(
          `INSERT INTO note_tags (note_id, tag_id) VALUES ${tagValues} ON CONFLICT DO NOTHING`,
          [id, ...tag_ids]
        );
      }
    }

    // Sync wikilinks when content changes — markdown only (CR023)
    if (content !== undefined && result.rows[0].format === 'markdown') {
      await syncWikilinks(fastify, id, request.user.id, content);
    } else if (content !== undefined && result.rows[0].format === 'html') {
      // Format flipped to/edited as HTML — clear any stale links
      await fastify.db.query('DELETE FROM note_links WHERE source_note_id = $1', [id]);
    }

    return { data: result.rows[0] };
  });

  // POST /api/v1/notes/:id/checkin — CR027 offline checkout flow
  // Optimistic-concurrency check-in: client passes the updated_at it captured
  // at checkout time as base_version. If the row hasn't moved past that, apply
  // the update. Otherwise return 409 with the current server row so the
  // client can open the conflict-resolution modal.
  fastify.post('/:id/checkin', {
    schema: {
      body: {
        type: 'object',
        required: ['base_version'],
        properties: {
          base_version: { type: 'string' },
          title: { type: 'string', maxLength: 500 },
          content: { type: 'string' },
          notebook_id: { type: ['string', 'null'], format: 'uuid', nullable: true },
          tag_ids: { type: 'array', items: { type: 'string', format: 'uuid' } }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const { base_version, title, content, notebook_id, tag_ids } = request.body;
    const userId = request.user.id;

    // Load the row with its current tags so we can return a complete server
    // copy on conflict (same shape as GET /notes/:id).
    const currentRes = await fastify.db.query(
      `SELECT n.*,
              COALESCE(
                json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color))
                FILTER (WHERE t.id IS NOT NULL), '[]'
              ) AS tags
       FROM notes n
       LEFT JOIN note_tags nt ON nt.note_id = n.id
       LEFT JOIN tags t ON t.id = nt.tag_id
       WHERE n.id = $1 AND n.user_id = $2 AND n.deleted_at IS NULL
       GROUP BY n.id`,
      [id, userId]
    );

    if (currentRes.rows.length === 0) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Note not found',
        statusCode: 404
      });
    }

    const current = currentRes.rows[0];
    // Compare as ISO strings. Postgres returns timestamps as Date objects via
    // node-postgres; coerce both sides to ISO for a stable equality test.
    const currentVersion = new Date(current.updated_at).toISOString();
    const incomingVersion = new Date(base_version).toISOString();

    if (currentVersion !== incomingVersion) {
      return reply.code(409).send({
        error: 'checkin_conflict',
        message: 'Note was modified on the server since checkout.',
        statusCode: 409,
        data: { server: current }
      });
    }

    // Apply the update — only fields actually present in the request body.
    const setClauses = [];
    const params = [];
    let idx = 1;
    if (title !== undefined) { setClauses.push(`title = $${idx++}`); params.push(title); }
    if (content !== undefined) { setClauses.push(`content = $${idx++}`); params.push(content); }
    if ('notebook_id' in request.body) {
      setClauses.push(`notebook_id = $${idx++}`);
      params.push(notebook_id);
    }
    // updated_at advances automatically via the row's trigger (or via NOW()).
    setClauses.push(`updated_at = NOW()`);
    params.push(id, userId);

    const updateRes = await fastify.db.query(
      `UPDATE notes SET ${setClauses.join(', ')}
       WHERE id = $${idx++} AND user_id = $${idx} AND deleted_at IS NULL
       RETURNING *`,
      params
    );

    if (updateRes.rows.length === 0) {
      // Row was deleted between SELECT and UPDATE — surface as 404.
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Note not found',
        statusCode: 404
      });
    }

    if (tag_ids !== undefined) {
      await fastify.db.query('DELETE FROM note_tags WHERE note_id = $1', [id]);
      if (tag_ids.length > 0) {
        const tagValues = tag_ids.map((_, i) => `($1, $${i + 2})`).join(', ');
        await fastify.db.query(
          `INSERT INTO note_tags (note_id, tag_id) VALUES ${tagValues} ON CONFLICT DO NOTHING`,
          [id, ...tag_ids]
        );
      }
    }

    if (content !== undefined && updateRes.rows[0].format === 'markdown') {
      await syncWikilinks(fastify, id, userId, content);
    }

    // Re-load with tags so the response matches the GET shape.
    const finalRes = await fastify.db.query(
      `SELECT n.*,
              COALESCE(
                json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color))
                FILTER (WHERE t.id IS NOT NULL), '[]'
              ) AS tags
       FROM notes n
       LEFT JOIN note_tags nt ON nt.note_id = n.id
       LEFT JOIN tags t ON t.id = nt.tag_id
       WHERE n.id = $1 AND n.user_id = $2
       GROUP BY n.id`,
      [id, userId]
    );

    return { data: finalRes.rows[0] };
  });

  // DELETE /api/v1/notes/:id — soft delete (move to trash)
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params;
    const result = await fastify.db.query(
      `UPDATE notes SET deleted_at = NOW()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, request.user.id]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Not Found', message: 'Note not found', statusCode: 404 });
    }
    return reply.code(204).send();
  });

  // POST /api/v1/notes/:id/restore — restore from trash
  fastify.post('/:id/restore', async (request, reply) => {
    const { id } = request.params;
    const result = await fastify.db.query(
      `UPDATE notes SET deleted_at = NULL
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL
       RETURNING *`,
      [id, request.user.id]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Not Found', message: 'Note not in trash', statusCode: 404 });
    }
    return { data: result.rows[0] };
  });

  // DELETE /api/v1/notes/:id/permanent — permanently delete from trash
  fastify.delete('/:id/permanent', async (request, reply) => {
    const { id } = request.params;
    const result = await fastify.db.query(
      `DELETE FROM notes
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL
       RETURNING id`,
      [id, request.user.id]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Not Found', message: 'Note not in trash', statusCode: 404 });
    }
    return reply.code(204).send();
  });

  // POST /api/v1/notes/:id/promote — promote an idea to a regular note
  fastify.post('/:id/promote', {
    schema: {
      body: {
        type: 'object',
        required: ['notebook_id'],
        properties: {
          notebook_id: { type: 'string', format: 'uuid' }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const { notebook_id } = request.body;
    const userId = request.user.id;

    const existing = await fastify.db.query(
      `SELECT note_type FROM notes WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [id, userId]
    );
    if (existing.rows.length === 0) {
      return reply.code(404).send({ error: 'Not Found', message: 'Note not found', statusCode: 404 });
    }
    if (existing.rows[0].note_type !== 'idea') {
      return reply.code(409).send({ error: 'Conflict', message: 'Note is not an idea', statusCode: 409 });
    }

    const nb = await fastify.db.query(
      `SELECT id FROM notebooks WHERE id = $1 AND user_id = $2`,
      [notebook_id, userId]
    );
    if (nb.rows.length === 0) {
      return reply.code(404).send({ error: 'Not Found', message: 'Notebook not found', statusCode: 404 });
    }

    const result = await fastify.db.query(
      `UPDATE notes
       SET note_type = 'note', notebook_id = $1, is_inbox = FALSE
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [notebook_id, id, userId]
    );
    return { data: result.rows[0] };
  });

  // POST /api/v1/notes/:id/merge-into — merge an idea's content into a target note as a bullet
  fastify.post('/:id/merge-into', {
    schema: {
      body: {
        type: 'object',
        required: ['target_note_id'],
        properties: {
          target_note_id: { type: 'string', format: 'uuid' }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const { target_note_id } = request.body;
    const userId = request.user.id;

    if (id === target_note_id) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Cannot merge a note into itself', statusCode: 400 });
    }

    const source = await fastify.db.query(
      `SELECT id, content FROM notes WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [id, userId]
    );
    if (source.rows.length === 0) {
      return reply.code(404).send({ error: 'Not Found', message: 'Source note not found', statusCode: 404 });
    }

    const target = await fastify.db.query(
      `SELECT id, content FROM notes WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [target_note_id, userId]
    );
    if (target.rows.length === 0) {
      return reply.code(404).send({ error: 'Not Found', message: 'Target note not found', statusCode: 404 });
    }

    const sourceContent = (source.rows[0].content || '').trim();
    const lines = sourceContent.split('\n');
    const firstLine = lines[0] || '';
    const restLines = lines.slice(1);
    // First line becomes a bullet; remaining lines indented under it
    const bullet = restLines.length > 0
      ? `- ${firstLine}\n${restLines.map(l => `  ${l}`).join('\n')}`
      : `- ${firstLine}`;

    const targetContent = target.rows[0].content || '';
    const separator = targetContent.length > 0 && !targetContent.endsWith('\n') ? '\n' : '';
    const newContent = `${targetContent}${separator}${bullet}\n`;

    const updated = await fastify.db.query(
      `UPDATE notes SET content = $1 WHERE id = $2 AND user_id = $3 RETURNING *`,
      [newContent, target_note_id, userId]
    );

    // Soft-delete source
    await fastify.db.query(
      `UPDATE notes SET deleted_at = NOW() WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    // Re-sync wikilinks for the target since its content changed
    await syncWikilinks(fastify, target_note_id, userId, newContent);

    return { data: updated.rows[0] };
  });

  // POST /api/v1/notes/:id/convert-to-task — convert an idea into a standalone task
  // (note_id=null, lands in Tasks/Inbox). Soft-deletes the source idea.
  fastify.post('/:id/convert-to-task', async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.id;

    const existing = await fastify.db.query(
      `SELECT note_type, title, content FROM notes
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [id, userId]
    );
    if (existing.rows.length === 0) {
      return reply.code(404).send({ error: 'Not Found', message: 'Note not found', statusCode: 404 });
    }
    if (existing.rows[0].note_type !== 'idea') {
      return reply.code(409).send({ error: 'Conflict', message: 'Note is not an idea', statusCode: 409 });
    }

    const content = (existing.rows[0].content || '').trim() || existing.rows[0].title || 'Untitled task';

    const taskResult = await fastify.db.query(
      `INSERT INTO tasks (user_id, note_id, content)
       VALUES ($1, NULL, $2)
       RETURNING *`,
      [userId, content]
    );

    await fastify.db.query(
      `UPDATE notes SET deleted_at = NOW() WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    return reply.code(201).send({ data: taskResult.rows[0] });
  });

  // POST /api/v1/notes/:id/translate — translate note content via the LLM
  // gateway and append the translated block below the original (preserves
  // both versions for search). Long content is truncated by llmService.
  fastify.post('/:id/translate', {
    schema: {
      body: {
        type: 'object',
        required: ['source_lang', 'target_lang'],
        properties: {
          source_lang: { type: 'string', minLength: 2, maxLength: 8 },
          target_lang: { type: 'string', minLength: 2, maxLength: 8 }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.id;
    const { source_lang, target_lang } = request.body;

    if (source_lang === target_lang) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'source_lang and target_lang must differ',
        statusCode: 400
      });
    }

    if (!llmService.isEnabled()) {
      return reply.code(503).send({
        error: 'Service Unavailable',
        message: 'Translation is disabled (LLM_ENABLED=false)',
        statusCode: 503
      });
    }

    const noteRes = await fastify.db.query(
      'SELECT id, user_id, content FROM notes WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [id, userId]
    );
    if (noteRes.rows.length === 0) {
      return reply.code(404).send({ error: 'Not Found', message: 'Note not found', statusCode: 404 });
    }
    const note = noteRes.rows[0];

    if (!note.content || note.content.trim().length === 0) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Note has no content to translate',
        statusCode: 400
      });
    }

    let translated;
    try {
      translated = await llmService.translateText({
        text: note.content,
        sourceLang: source_lang,
        targetLang: target_lang
      });
    } catch (err) {
      fastify.log.warn({ err, noteId: id }, 'translate failed');
      return reply.code(502).send({
        error: 'Bad Gateway',
        message: 'Translation failed: ' + (err.message || 'unknown error'),
        statusCode: 502
      });
    }

    if (!translated) {
      return reply.code(502).send({
        error: 'Bad Gateway',
        message: 'Translation returned no content',
        statusCode: 502
      });
    }

    const updatedContent =
      note.content +
      `\n\n---\n\n**Translated (${source_lang} → ${target_lang}):**\n\n` +
      translated;

    const updated = await fastify.db.query(
      `UPDATE notes SET content = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *`,
      [updatedContent, id, userId]
    );
    return { data: updated.rows[0] };
  });

  // DELETE /api/v1/notes/trash/empty — empty entire trash
  fastify.delete('/trash/empty', async (request) => {
    const result = await fastify.db.query(
      `DELETE FROM notes
       WHERE user_id = $1 AND deleted_at IS NOT NULL
       RETURNING id`,
      [request.user.id]
    );
    return { data: { deleted: result.rowCount } };
  });
}

module.exports = noteRoutes;
