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
        user: { id: user.id, username: user.username, email: user.email }
      }
    };
  });

  // POST /api/v1/auth/refresh
  fastify.post('/refresh', async (request, reply) => {
    const token = request.cookies.refreshToken;

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

  // POST /api/v1/auth/logout
  fastify.post('/logout', async (request, reply) => {
    reply.clearCookie('refreshToken', {
      path: '/api/v1/auth/refresh'
    });

    return { data: { message: 'Logged out' } };
  });
}

module.exports = authRoutes;
