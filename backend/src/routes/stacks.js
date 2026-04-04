async function stackRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /api/v1/stacks
  fastify.get('/', async (request) => {
    const result = await fastify.db.query(
      `SELECT s.*,
              json_agg(
                json_build_object('id', n.id, 'name', n.name, 'is_default', n.is_default)
                ORDER BY n.name
              ) FILTER (WHERE n.id IS NOT NULL) AS notebooks
       FROM stacks s
       LEFT JOIN notebooks n ON n.stack_id = s.id
       WHERE s.user_id = $1
       GROUP BY s.id
       ORDER BY s.name`,
      [request.user.id]
    );
    return { data: result.rows };
  });

  // POST /api/v1/stacks
  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 }
        }
      }
    }
  }, async (request, reply) => {
    const { name } = request.body;
    const result = await fastify.db.query(
      'INSERT INTO stacks (user_id, name) VALUES ($1, $2) RETURNING *',
      [request.user.id, name]
    );
    return reply.code(201).send({ data: result.rows[0] });
  });

  // PUT /api/v1/stacks/:id
  fastify.put('/:id', {
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const { name } = request.body;

    const result = await fastify.db.query(
      'UPDATE stacks SET name = COALESCE($1, name) WHERE id = $2 AND user_id = $3 RETURNING *',
      [name, id, request.user.id]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Not Found', message: 'Stack not found', statusCode: 404 });
    }
    return { data: result.rows[0] };
  });

  // DELETE /api/v1/stacks/:id
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params;
    const result = await fastify.db.query(
      'DELETE FROM stacks WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, request.user.id]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Not Found', message: 'Stack not found', statusCode: 404 });
    }
    return reply.code(204).send();
  });
}

module.exports = stackRoutes;
