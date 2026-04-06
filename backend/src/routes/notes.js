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
          search: { type: 'string' },
          pinned: { type: 'string', enum: ['true', 'false'] },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          offset: { type: 'integer', minimum: 0, default: 0 }
        }
      }
    }
  }, async (request) => {
    const { notebook_id, tag_id, is_inbox, search, pinned, limit = 50, offset = 0 } = request.query;
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
      `SELECT DISTINCT n.id, n.title, n.content, n.notebook_id, n.is_inbox, n.pinned,
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
          tag_ids: { type: 'array', items: { type: 'string', format: 'uuid' } }
        }
      }
    }
  }, async (request, reply) => {
    const { title, content, notebook_id, is_inbox, tag_ids } = request.body;
    const userId = request.user.id;

    let finalNotebookId = notebook_id;
    if (!finalNotebookId && !is_inbox) {
      const defaultNb = await fastify.db.query(
        'SELECT id FROM notebooks WHERE user_id = $1 AND is_default = TRUE LIMIT 1',
        [userId]
      );
      if (defaultNb.rows.length > 0) {
        finalNotebookId = defaultNb.rows[0].id;
      }
    }

    const result = await fastify.db.query(
      `INSERT INTO notes (user_id, notebook_id, title, content, is_inbox)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, finalNotebookId || null, title || 'Untitled', content || '', is_inbox || false]
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
          tag_ids: { type: 'array', items: { type: 'string', format: 'uuid' } }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const { title, content, notebook_id, pinned, is_inbox, tag_ids } = request.body;

    const result = await fastify.db.query(
      `UPDATE notes
       SET title = COALESCE($1, title),
           content = COALESCE($2, content),
           notebook_id = COALESCE($3, notebook_id),
           pinned = COALESCE($4, pinned),
           is_inbox = COALESCE($5, is_inbox)
       WHERE id = $6 AND user_id = $7 AND deleted_at IS NULL
       RETURNING *`,
      [title, content, notebook_id, pinned, is_inbox, id, request.user.id]
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
