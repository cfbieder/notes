async function notebookRoutes(fastify) {
  // All routes require authentication
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /api/v1/notebooks
  fastify.get('/', async (request) => {
    const result = await fastify.db.query(
      `SELECT n.*, COUNT(notes.id)::int AS note_count
       FROM notebooks n
       LEFT JOIN notes ON notes.notebook_id = n.id AND notes.deleted_at IS NULL
       WHERE n.user_id = $1
       GROUP BY n.id
       ORDER BY n.is_default DESC, n.name`,
      [request.user.id]
    );
    return { data: result.rows };
  });

  // POST /api/v1/notebooks
  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          stack_id: { type: 'string', format: 'uuid' }
        }
      }
    }
  }, async (request, reply) => {
    const { name, stack_id } = request.body;
    const result = await fastify.db.query(
      `INSERT INTO notebooks (user_id, name, stack_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [request.user.id, name, stack_id || null]
    );
    return reply.code(201).send({ data: result.rows[0] });
  });

  // PUT /api/v1/notebooks/:id
  fastify.put('/:id', {
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } }
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          stack_id: {}
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const { name, stack_id } = request.body;

    // Build dynamic SET clause — stack_id can be explicitly null (remove from stack)
    const sets = [];
    const params = [];
    let idx = 1;

    if (name !== undefined) {
      sets.push(`name = $${idx++}`);
      params.push(name);
    }
    if (stack_id !== undefined) {
      sets.push(`stack_id = $${idx++}`);
      params.push(stack_id || null);
    }

    if (sets.length === 0) {
      return reply.code(400).send({ error: 'Bad Request', message: 'No fields to update', statusCode: 400 });
    }

    params.push(id, request.user.id);
    const result = await fastify.db.query(
      `UPDATE notebooks SET ${sets.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Not Found', message: 'Notebook not found', statusCode: 404 });
    }
    return { data: result.rows[0] };
  });

  // GET /api/v1/notebooks/:id/info — get notebook with note count (for delete confirmation)
  fastify.get('/:id/info', async (request, reply) => {
    const { id } = request.params;
    const result = await fastify.db.query(
      `SELECT n.*, COUNT(notes.id)::int AS note_count
       FROM notebooks n
       LEFT JOIN notes ON notes.notebook_id = n.id AND notes.deleted_at IS NULL
       WHERE n.id = $1 AND n.user_id = $2
       GROUP BY n.id`,
      [id, request.user.id]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Not Found', message: 'Notebook not found', statusCode: 404 });
    }
    return { data: result.rows[0] };
  });

  // DELETE /api/v1/notebooks/:id
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params;

    // Prevent deleting the default notebook
    const check = await fastify.db.query(
      'SELECT id, is_default FROM notebooks WHERE id = $1 AND user_id = $2',
      [id, request.user.id]
    );

    if (check.rows.length === 0) {
      return reply.code(404).send({ error: 'Not Found', message: 'Notebook not found', statusCode: 404 });
    }
    if (check.rows[0].is_default) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Cannot delete the default notebook', statusCode: 400 });
    }

    // Find the default (Inbox) notebook to move notes into
    const defaultNb = await fastify.db.query(
      'SELECT id FROM notebooks WHERE user_id = $1 AND is_default = TRUE LIMIT 1',
      [request.user.id]
    );

    if (defaultNb.rows.length > 0) {
      // Move all notes from this notebook to Inbox
      await fastify.db.query(
        'UPDATE notes SET notebook_id = $1 WHERE notebook_id = $2 AND user_id = $3',
        [defaultNb.rows[0].id, id, request.user.id]
      );
    }

    await fastify.db.query(
      'DELETE FROM notebooks WHERE id = $1 AND user_id = $2',
      [id, request.user.id]
    );
    return reply.code(204).send();
  });
}

module.exports = notebookRoutes;
