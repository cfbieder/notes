async function exportRoutes(fastify) {
  // Custom auth hook: accept Bearer header OR ?token= query param (for curl/scripts)
  fastify.addHook('onRequest', async (request, reply) => {
    const queryToken = request.query.token;
    if (queryToken) {
      // Inject as Bearer header so the standard authenticate hook handles it
      // (works for both JWT and noted_ API tokens)
      request.headers.authorization = `Bearer ${queryToken}`;
    }
    return fastify.authenticate(request, reply);
  });

  // GET /api/v1/notes/export/:title — raw markdown export by note title
  // Supports both Bearer token and ?token= query param for curl/script usage
  fastify.get('/:title', {
    schema: {
      params: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (request, reply) => {
    const { title } = request.params;
    const userId = request.user.id;

    const result = await fastify.db.query(
      `SELECT title, content FROM notes
       WHERE user_id = $1 AND LOWER(title) = LOWER($2) AND deleted_at IS NULL
       LIMIT 1`,
      [userId, decodeURIComponent(title)]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({
        error: 'Not Found',
        message: `No note found with title "${decodeURIComponent(title)}"`,
        statusCode: 404
      });
    }

    const note = result.rows[0];
    const filename = note.title.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_') + '.md';

    return reply
      .header('Content-Type', 'text/markdown; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(note.content);
  });
}

module.exports = exportRoutes;
