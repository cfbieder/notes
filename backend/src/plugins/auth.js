const fp = require('fastify-plugin');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

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

  fastify.decorate('auth', {
    generateAccessToken,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    hashPassword,
    comparePassword
  });

  // Authentication decorator for protected routes
  fastify.decorate('authenticate', async function (request, reply) {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Missing or invalid token', statusCode: 401 });
      return;
    }

    try {
      const token = authHeader.split(' ')[1];
      const decoded = verifyAccessToken(token);
      request.user = decoded;
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Token expired or invalid', statusCode: 401 });
    }
  });
}

module.exports = fp(authPlugin, { name: 'auth' });
