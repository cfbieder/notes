require('dotenv').config({
  path: process.env.NODE_ENV === 'production' ? '.env' : '.env.dev'
});

const fastify = require('fastify')({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    ...(process.env.NODE_ENV === 'production' && {
      file: process.env.LOG_DIR
        ? `${process.env.LOG_DIR}/combined.log`
        : './logs/combined.log'
    })
  }
});

// Register plugins
const registerPlugins = async () => {
  await fastify.register(require('@fastify/cors'), {
    // Allow the configured web origin plus any chrome-extension:// origin
    // (Noted Web Clipper). Extensions always present a chrome-extension://<id>
    // Origin header, so a single string isn't enough.
    origin: (origin, cb) => {
      const configured = process.env.CORS_ORIGIN || 'http://localhost:5173';
      if (!origin) return cb(null, true); // same-origin or server-to-server
      if (origin === configured) return cb(null, true);
      if (origin.startsWith('chrome-extension://')) return cb(null, true);
      return cb(null, false);
    },
    credentials: true
  });

  await fastify.register(require('@fastify/cookie'));

  await fastify.register(require('@fastify/rate-limit'), {
    global: false
  });

  // App plugins
  await fastify.register(require('./plugins/db'));
  await fastify.register(require('./plugins/auth'));
  await fastify.register(require('./plugins/drivePoller'));
};

// Register routes
const registerRoutes = async () => {
  // Auth routes (with rate limiting)
  await fastify.register(require('./routes/auth'), {
    prefix: '/api/v1/auth',
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '15 minutes'
      }
    }
  });

  // Protected resource routes
  await fastify.register(require('./routes/notebooks'), { prefix: '/api/v1/notebooks' });
  await fastify.register(require('./routes/stacks'), { prefix: '/api/v1/stacks' });
  await fastify.register(require('./routes/notes'), { prefix: '/api/v1/notes' });
  await fastify.register(require('./routes/tags'), { prefix: '/api/v1/tags' });
  await fastify.register(require('./routes/tasks'), { prefix: '/api/v1/tasks' });
  await fastify.register(require('./routes/search'), { prefix: '/api/v1/search' });
  await fastify.register(require('./routes/attachments'), { prefix: '/api/v1' });
  await fastify.register(require('./routes/reminders'), { prefix: '/api/v1/reminders' });
  await fastify.register(require('./routes/integrations'), { prefix: '/api/v1/integrations' });
  await fastify.register(require('./routes/links'), { prefix: '/api/v1/notes' });
  await fastify.register(require('./routes/graph'), { prefix: '/api/v1/graph' });
  await fastify.register(require('./routes/clips'), { prefix: '/api/v1/clips' });
  await fastify.register(require('./routes/voice'), { prefix: '/api/v1/notes/voice' });
  await fastify.register(require('./routes/export'), { prefix: '/api/v1/notes/export' });
  await fastify.register(require('./routes/aiAssist'), { prefix: '/api/v1/ai-assist' });
  await fastify.register(require('./routes/system'), { prefix: '/api/v1/system' });
};

// Health check
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Global error handler
fastify.setErrorHandler((error, request, reply) => {
  const statusCode = error.statusCode || 500;

  if (statusCode === 500) {
    fastify.log.error(error);
  }

  reply.code(statusCode).send({
    error: error.name || 'Error',
    message: statusCode === 500 ? 'Internal server error' : error.message,
    statusCode
  });
});

// Start server
const start = async () => {
  try {
    await registerPlugins();
    await registerRoutes();

    const port = parseInt(process.env.PORT, 10) || 3001;
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });
    fastify.log.info(`Noted API running on ${host}:${port}`);

    // Mark any AI Assist jobs left in pending/running as failed — their
    // upstream gateway requests don't survive a restart.
    if (fastify.aiAssistJobRunner) {
      fastify.aiAssistJobRunner.failOrphanedJobs().catch((err) => {
        fastify.log.error({ err }, 'failed to clean up orphaned ai-assist jobs');
      });
    }
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
