async function authRoutes(fastify) {
  // POST /api/v1/auth/login
  fastify.post('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 1 },
          password: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (request, reply) => {
    const { username, password } = request.body;

    const result = await fastify.db.query(
      'SELECT id, username, email, password_hash FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid username or password',
        statusCode: 401
      });
    }

    const user = result.rows[0];
    const valid = await fastify.auth.comparePassword(password, user.password_hash);

    if (!valid) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid username or password',
        statusCode: 401
      });
    }

    const accessToken = fastify.auth.generateAccessToken(user);
    const refreshToken = fastify.auth.generateRefreshToken(user);

    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth/refresh',
      maxAge: 30 * 24 * 60 * 60 // 30 days
    });

    return {
      data: {
        accessToken,
        // Returned in the body for non-browser clients (e.g. the Chrome
        // web clipper). The web app continues to use the httpOnly cookie
        // set above and ignores this field.
        refreshToken,
        user: { id: user.id, username: user.username, email: user.email }
      }
    };
  });

  // POST /api/v1/auth/refresh
  fastify.post('/refresh', async (request, reply) => {
    // Prefer the httpOnly cookie (web app). Fall back to a body-supplied
    // token for clients that can't receive SameSite=Strict cookies — the
    // Chrome clipper sends { refreshToken } in its request body.
    const token = request.cookies.refreshToken || request.body?.refreshToken;

    if (!token) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'No refresh token',
        statusCode: 401
      });
    }

    try {
      const decoded = fastify.auth.verifyRefreshToken(token);

      const result = await fastify.db.query(
        'SELECT id, username, email FROM users WHERE id = $1',
        [decoded.id]
      );

      if (result.rows.length === 0) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'User not found',
          statusCode: 401
        });
      }

      const user = result.rows[0];
      const accessToken = fastify.auth.generateAccessToken(user);
      const newRefreshToken = fastify.auth.generateRefreshToken(user);

      reply.setCookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/v1/auth/refresh',
        maxAge: 30 * 24 * 60 * 60
      });

      return {
        accessToken,
        // See /auth/login — returned in body so non-browser clients (Chrome
        // clipper) can persist the new refresh token. Web app ignores this.
        refreshToken: newRefreshToken,
        user: { id: user.id, username: user.username, email: user.email }
      };
    } catch {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid refresh token',
        statusCode: 401
      });
    }
  });

  // PUT /api/v1/auth/password
  fastify.put('/password', { onRequest: fastify.authenticate, schema: {
    body: {
      type: 'object',
      required: ['currentPassword', 'newPassword'],
      properties: {
        currentPassword: { type: 'string', minLength: 1 },
        newPassword: { type: 'string', minLength: 8 }
      }
    }
  }}, async (request, reply) => {
    const { currentPassword, newPassword } = request.body;

    const result = await fastify.db.query(
      'SELECT id, password_hash FROM users WHERE id = $1',
      [request.user.id]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'User not found',
        statusCode: 404
      });
    }

    const user = result.rows[0];
    const valid = await fastify.auth.comparePassword(currentPassword, user.password_hash);

    if (!valid) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Current password is incorrect',
        statusCode: 400
      });
    }

    const newHash = await fastify.auth.hashPassword(newPassword);
    await fastify.db.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [newHash, request.user.id]
    );

    return { data: { message: 'Password updated' } };
  });

  // POST /api/v1/auth/logout
  fastify.post('/logout', async (request, reply) => {
    reply.clearCookie('refreshToken', {
      path: '/api/v1/auth/refresh'
    });

    return { data: { message: 'Logged out' } };
  });
}

module.exports = authRoutes;
