const fp = require('fastify-plugin');
const DrivePoller = require('../services/drivePoller');

async function drivePollerPlugin(fastify) {
  const poller = new DrivePoller(fastify);

  fastify.decorate('drivePoller', poller);

  fastify.addHook('onReady', async () => {
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      await poller.start();
    } else {
      fastify.log.warn('Google Drive integration not configured (missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)');
    }
  });

  fastify.addHook('onClose', async () => {
    poller.stop();
  });
}

module.exports = fp(drivePollerPlugin, {
  name: 'drivePoller',
  dependencies: ['db']
});
