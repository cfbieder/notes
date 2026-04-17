const fp = require('fastify-plugin');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const SALT_ROUNDS = 10;

async function authPlugin(fastify) {
  const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
  const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me';
  const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '15m';
  const JWT_REFRESH_EXPIRATION = process.env.JWT_REFRESH_EXPIRATION || '30d';

  function generateAccessToken(user) {
    return jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRATION }
    );
  }

  function generateRefreshToken(user) {
    return jwt.sign(
      { id: user.id },
      JWT_REFRESH_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRATION }
    );
  }

  function verifyAccessToken(token) {
    return jwt.verify(token, JWT_SECRET);
  }

  function verifyRefreshToken(token) {
    return jwt.verify(token, JWT_REFRESH_SECRET);
  }

  async function hashPassword(password) {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  async function comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  function generateApiToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  function hashApiToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  fastify.decorate('auth', {
    generateAccessToken,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    hashPassword,
    comparePassword,
    generateApiToken,
    hashApiToken
  });

  // Authentication decorator for protected routes
  // Supports JWT Bearer tokens and long-lived API tokens (prefixed with "noted_")
  fastify.decorate('authenticate', async function (request, reply) {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Missing or invalid token', statusCode: 401 });
      return;
    }

    const token = authHeader.split(' ')[1];

    // Long-lived API token (prefixed with "noted_")
    if (token.startsWith('noted_')) {
      const tokenHash = hashApiToken(token);
      try {
        const result = await fastify.db.query(
          `SELECT at.id AS token_id, u.id, u.username
           FROM api_tokens at JOIN users u ON u.id = at.user_id
           WHERE at.token_hash = $1 AND (at.expires_at IS NULL OR at.expires_at > NOW())`,
          [tokenHash]
        );
        if (result.rows.length === 0) {
          reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired API token', statusCode: 401 });
          return;
        }
        request.user = { id: result.rows[0].id, username: result.rows[0].username };
        // Update last_used in background
        fastify.db.query('UPDATE api_tokens SET last_used = NOW() WHERE id = $1', [result.rows[0].token_id]).catch(() => {});
      } catch {
        reply.code(401).send({ error: 'Unauthorized', message: 'Token validation failed', statusCode: 401 });
      }
      return;
    }

    // Standard JWT token
    try {
      const decoded = verifyAccessToken(token);
      request.user = decoded;
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Token expired or invalid', statusCode: 401 });
    }
  });
}

module.exports = fp(authPlugin, { name: 'auth' });
