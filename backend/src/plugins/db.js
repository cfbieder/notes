const fp = require('fastify-plugin');
const { Pool } = require('pg');

async function dbPlugin(fastify) {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_NAME || 'noted_dev',
    user: process.env.DB_USER || 'noteduser',
    password: process.env.DB_PASSWORD || 'noted_dev_password'
  });

  // Test connection
  try {
    const client = await pool.connect();
    fastify.log.info('Connected to PostgreSQL');
    client.release();
  } catch (err) {
    fastify.log.error('Failed to connect to PostgreSQL:', err.message);
  }

  fastify.decorate('db', pool);

  fastify.addHook('onClose', async () => {
    await pool.end();
  });
}

module.exports = fp(dbPlugin, { name: 'db' });
