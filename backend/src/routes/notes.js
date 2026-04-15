const { extractWikilinks, resolveWikilinks } = require('../services/wikilinkParser');

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
      conditions.push(`n.content_tsv @@ plainto_tsquery('english', $${paramIndex++})`);
      params.push(search);
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
              n.created_at, n.updated_at
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
              ) AS tags
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
          client_id: { type: 'string', format: 'uuid' },
          tag_ids: { type: 'array', items: { type: 'string', format: 'uuid' } }
        }
      }
    }
  }, async (request, reply) => {
    const { title, content, notebook_id, is_inbox, note_type, client_id, tag_ids } = request.body;
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

    const result = await fastify.db.query(
      `INSERT INTO notes (user_id, notebook_id, title, content, is_inbox, note_type, client_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, finalNotebookId || null, title || 'Untitled', content || '', is_inbox || false, finalNoteType, client_id || null]
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

    // Sync wikilinks
    if (content) {
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
          tag_ids: { type: 'array', items: { type: 'string', format: 'uuid' } }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const { title, content, notebook_id, pinned, is_inbox, note_type, tag_ids } = request.body;

    const result = await fastify.db.query(
      `UPDATE notes
       SET title = COALESCE($1, title),
           content = COALESCE($2, content),
           notebook_id = COALESCE($3, notebook_id),
           pinned = COALESCE($4, pinned),
           is_inbox = COALESCE($5, is_inbox),
           note_type = COALESCE($6, note_type)
       WHERE id = $7 AND user_id = $8 AND deleted_at IS NULL
       RETURNING *`,
      [title, content, notebook_id, pinned, is_inbox, note_type, id, request.user.id]
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

    // Sync wikilinks when content changes
    if (content !== undefined) {
      await syncWikilinks(fastify, id, request.user.id, content);
    }

    return { data: result.rows[0] };
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
