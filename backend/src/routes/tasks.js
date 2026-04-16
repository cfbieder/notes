async function taskRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /api/v1/tasks
  fastify.get('/', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          note_id: { type: 'string', format: 'uuid' },
          is_done: { type: 'string', enum: ['true', 'false'] },
          due_before: { type: 'string', format: 'date' },
          due_after: { type: 'string', format: 'date' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          offset: { type: 'integer', minimum: 0, default: 0 }
        }
      }
    }
  }, async (request) => {
    const { note_id, is_done, due_before, due_after, limit = 50, offset = 0 } = request.query;

    const conditions = ['t.user_id = $1'];
    const params = [request.user.id];
    let idx = 2;

    if (note_id) {
      conditions.push(`t.note_id = $${idx++}`);
      params.push(note_id);
    }

    if (is_done !== undefined) {
      conditions.push(`t.is_done = $${idx++}`);
      params.push(is_done === 'true');
    }

    if (due_before) {
      conditions.push(`t.due_date <= $${idx++}`);
      params.push(due_before);
    }

    if (due_after) {
      conditions.push(`t.due_date >= $${idx++}`);
      params.push(due_after);
    }

    const where = conditions.join(' AND ');

    const countResult = await fastify.db.query(
      `SELECT COUNT(*)::int AS total FROM tasks t WHERE ${where}`,
      params
    );

    params.push(limit, offset);
    const result = await fastify.db.query(
      `SELECT t.*, n.title AS note_title
       FROM tasks t
       LEFT JOIN notes n ON n.id = t.note_id
       WHERE ${where}
       ORDER BY t.is_done ASC, t.due_date ASC NULLS LAST, t.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      params
    );

    return {
      data: result.rows,
      meta: { total: countResult.rows[0].total, limit, offset }
    };
  });

  // GET /api/v1/tasks/inbox — tasks not assigned to a note
  fastify.get('/inbox', async (request) => {
    const result = await fastify.db.query(
      `SELECT * FROM tasks
       WHERE user_id = $1 AND note_id IS NULL
       ORDER BY is_done ASC, created_at DESC`,
      [request.user.id]
    );
    return { data: result.rows };
  });

  // POST /api/v1/tasks
  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', minLength: 1 },
          note_id: { type: 'string', format: 'uuid' },
          due_date: { type: 'string', format: 'date' },
          reminder_at: { type: 'string', format: 'date-time' }
        }
      }
    }
  }, async (request, reply) => {
    const { content, note_id, due_date, reminder_at } = request.body;
    const result = await fastify.db.query(
      `INSERT INTO tasks (user_id, note_id, content, due_date, reminder_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [request.user.id, note_id || null, content, due_date || null, reminder_at || null]
    );
    return reply.code(201).send({ data: result.rows[0] });
  });

  // PUT /api/v1/tasks/:id
  fastify.put('/:id', {
    schema: {
      body: {
        type: 'object',
        properties: {
          content: { type: 'string', minLength: 1 },
          is_done: { type: 'boolean' },
          note_id: { type: 'string', format: 'uuid' },
          due_date: { type: 'string', format: 'date' },
          reminder_at: { type: ['string', 'null'], format: 'date-time', nullable: true }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const { content, is_done, note_id, due_date } = request.body;

    // Build SET clause dynamically — reminder_at needs explicit null handling
    // (COALESCE can't clear a value to NULL)
    const setClauses = [
      'content = COALESCE($1, content)',
      'is_done = COALESCE($2, is_done)',
      'note_id = COALESCE($3, note_id)',
      'due_date = COALESCE($4, due_date)'
    ];
    const params = [content, is_done, note_id, due_date];
    let idx = 5;

    if ('reminder_at' in request.body) {
      setClauses.push(`reminder_at = $${idx++}`);
      params.push(request.body.reminder_at);
    }

    params.push(id, request.user.id);
    const result = await fastify.db.query(
      `UPDATE tasks
       SET ${setClauses.join(', ')}
       WHERE id = $${idx++} AND user_id = $${idx}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Not Found', message: 'Task not found', statusCode: 404 });
    }
    return { data: result.rows[0] };
  });

  // DELETE /api/v1/tasks/:id
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params;
    const result = await fastify.db.query(
      'DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, request.user.id]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Not Found', message: 'Task not found', statusCode: 404 });
    }
    return reply.code(204).send();
  });
}

module.exports = taskRoutes;
