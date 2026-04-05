async function tagRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /api/v1/tags — all tags with note counts
  fastify.get('/', async (request) => {
    const result = await fastify.db.query(
      `SELECT t.*, COUNT(nt.note_id)::int AS note_count
       FROM tags t
       LEFT JOIN note_tags nt ON nt.tag_id = t.id
       WHERE t.user_id = $1
       GROUP BY t.id
       ORDER BY t.name`,
      [request.user.id]
    );
    return { data: result.rows };
  });

  // POST /api/v1/tags
  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }
        }
      }
    }
  }, async (request, reply) => {
    const { name, color } = request.body;
    const result = await fastify.db.query(
      'INSERT INTO tags (user_id, name, color) VALUES ($1, $2, $3) RETURNING *',
      [request.user.id, name.toLowerCase(), color || null]
    );
    return reply.code(201).send({ data: result.rows[0] });
  });

  // PUT /api/v1/tags/:id
  fastify.put('/:id', {
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const { name, color } = request.body;

    const result = await fastify.db.query(
      `UPDATE tags
       SET name = COALESCE($1, name),
           color = COALESCE($2, color)
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [name ? name.toLowerCase() : null, color, id, request.user.id]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Not Found', message: 'Tag not found', statusCode: 404 });
    }
    return { data: result.rows[0] };
  });

  // DELETE /api/v1/tags/:id
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params;
    const result = await fastify.db.query(
      'DELETE FROM tags WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, request.user.id]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Not Found', message: 'Tag not found', statusCode: 404 });
    }
    return reply.code(204).send();
  });
}

module.exports = tagRoutes;
