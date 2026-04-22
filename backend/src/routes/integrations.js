const { google } = require('googleapis');

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

const SCOPES = [
  'https://www.googleapis.com/auth/drive'
];

async function integrationRoutes(fastify) {
  // OAuth callback — public (no auth), registered in its own encapsulated scope
  fastify.register(async function publicRoutes(scope) {
    scope.get('/google-drive/callback', async (request, reply) => {
      const { code, state: userId } = request.query;

      if (!code || !userId) {
        return reply.code(400).type('text/html').send(`
          <html><body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: #e2e8f0;">
            <div style="text-align: center;">
              <h2>Connection Failed</h2>
              <p>Missing authorization code. Please try again.</p>
            </div>
          </body></html>
        `);
      }

      try {
        const oauth2Client = getOAuth2Client();
        const { tokens } = await oauth2Client.getToken(code);

        await fastify.db.query(
          `INSERT INTO integrations (user_id, provider, access_token, refresh_token, token_expiry, config)
           VALUES ($1, 'google_drive', $2, $3, $4, '{"poll_interval_minutes": 5}')
           ON CONFLICT (user_id, provider) DO UPDATE
           SET access_token = $2, refresh_token = COALESCE($3, integrations.refresh_token),
               token_expiry = $4, auth_error = NULL, auth_error_at = NULL, updated_at = NOW()`,
          [userId, tokens.access_token, tokens.refresh_token, tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null]
        );

        return reply.type('text/html').send(`
          <html><body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: #e2e8f0;">
            <div style="text-align: center;">
              <h2 style="color: #22c55e;">Google Drive Connected</h2>
              <p>You can close this tab and return to Noted.</p>
              <script>setTimeout(() => window.close(), 2000);</script>
            </div>
          </body></html>
        `);
      } catch (err) {
        fastify.log.error(err, 'Google OAuth callback failed');
        return reply.code(500).type('text/html').send(`
          <html><body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: #e2e8f0;">
            <div style="text-align: center;">
              <h2 style="color: #ef4444;">Connection Failed</h2>
              <p>${err.message}</p>
            </div>
          </body></html>
        `);
      }
    });
  });

  // All remaining routes require authentication
  fastify.register(async function protectedRoutes(scope) {
    scope.addHook('onRequest', fastify.authenticate);

    // GET /google-drive/auth-url — returns OAuth consent URL
    scope.get('/google-drive/auth-url', async (request) => {
      const oauth2Client = getOAuth2Client();
      const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        state: request.user.id,
        prompt: 'consent'
      });
      return { data: { url } };
    });

    // GET /google-drive/status — connection status + config
    scope.get('/google-drive/status', async (request) => {
      const result = await fastify.db.query(
        `SELECT * FROM integrations WHERE user_id = $1 AND provider = 'google_drive'`,
        [request.user.id]
      );

      if (result.rows.length === 0) {
        return { data: { connected: false } };
      }

      const integration = result.rows[0];

      const lastImportResult = await fastify.db.query(
        `SELECT MAX(imported_at) as last_import FROM import_history WHERE integration_id = $1`,
        [integration.id]
      );

      return {
        data: {
          connected: true,
          enabled: integration.enabled,
          folderName: integration.config.folder_name || null,
          folderId: integration.config.folder_id || null,
          pollIntervalMinutes: integration.config.poll_interval_minutes || 5,
          lastImport: lastImportResult.rows[0]?.last_import || null,
          needsReconnect: Boolean(integration.auth_error),
          authError: integration.auth_error || null,
          authErrorAt: integration.auth_error_at || null
        }
      };
    });

    // PUT /google-drive/config — update folder + poll interval
    scope.put('/google-drive/config', {
      schema: {
        body: {
          type: 'object',
          properties: {
            folderName: { type: 'string', minLength: 1 },
            pollIntervalMinutes: { type: 'integer', minimum: 1, maximum: 60 },
            enabled: { type: 'boolean' }
          }
        }
      }
    }, async (request, reply) => {
      const { folderName, pollIntervalMinutes, enabled } = request.body;

      const result = await fastify.db.query(
        `SELECT * FROM integrations WHERE user_id = $1 AND provider = 'google_drive'`,
        [request.user.id]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Not Found', message: 'Google Drive not connected', statusCode: 404 });
      }

      const integration = result.rows[0];
      const config = { ...integration.config };

      // If folder name changed, look it up in Drive
      if (folderName && folderName !== config.folder_name) {
        const oauth2Client = getOAuth2Client();
        oauth2Client.setCredentials({
          access_token: integration.access_token,
          refresh_token: integration.refresh_token
        });

        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        const folderRes = await drive.files.list({
          q: `name = '${folderName.replace(/'/g, "\\'")}' AND mimeType = 'application/vnd.google-apps.folder' AND trashed = false`,
          fields: 'files(id, name)',
          spaces: 'drive'
        });

        if (folderRes.data.files.length === 0) {
          return reply.code(404).send({
            error: 'Not Found',
            message: `Folder "${folderName}" not found in Google Drive`,
            statusCode: 404
          });
        }

        config.folder_id = folderRes.data.files[0].id;
        config.folder_name = folderRes.data.files[0].name;

        // Clear processed folder ID so it gets re-created in the new folder
        delete config.processed_folder_id;
      }

      if (pollIntervalMinutes !== undefined) {
        config.poll_interval_minutes = pollIntervalMinutes;
      }

      const updates = [`config = $1`];
      const values = [JSON.stringify(config)];
      let paramIdx = 2;

      if (enabled !== undefined) {
        updates.push(`enabled = $${paramIdx++}`);
        values.push(enabled);
      }

      values.push(integration.id);
      await fastify.db.query(
        `UPDATE integrations SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
        values
      );

      return {
        data: {
          folderName: config.folder_name,
          folderId: config.folder_id,
          pollIntervalMinutes: config.poll_interval_minutes,
          enabled: enabled !== undefined ? enabled : integration.enabled
        }
      };
    });

    // POST /google-drive/scan — trigger manual scan
    scope.post('/google-drive/scan', async (request, reply) => {
      const result = await fastify.db.query(
        `SELECT * FROM integrations WHERE user_id = $1 AND provider = 'google_drive' AND enabled = TRUE`,
        [request.user.id]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Not Found', message: 'Google Drive not connected or disabled', statusCode: 404 });
      }

      const integration = result.rows[0];

      if (!integration.config.folder_id) {
        return reply.code(400).send({ error: 'Bad Request', message: 'No folder configured', statusCode: 400 });
      }

      try {
        const scanResult = await fastify.drivePoller.scanForUser(integration);
        return { data: scanResult };
      } catch (err) {
        if (err.code === 'AUTH_REQUIRED') {
          // 409 Conflict — state requires reconnect. Using 409 (not 401) so the
          // API client doesn't try to refresh the app JWT.
          return reply.code(409).send({
            error: 'AuthRequired',
            message: err.message,
            needsReconnect: true,
            statusCode: 409
          });
        }
        throw err;
      }
    });

    // DELETE /google-drive — disconnect
    scope.delete('/google-drive', async (request, reply) => {
      const result = await fastify.db.query(
        `DELETE FROM integrations WHERE user_id = $1 AND provider = 'google_drive' RETURNING id`,
        [request.user.id]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Not Found', message: 'Google Drive not connected', statusCode: 404 });
      }

      return reply.code(204).send();
    });

    // GET /google-drive/history — paginated import history
    scope.get('/google-drive/history', {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            offset: { type: 'integer', minimum: 0, default: 0 }
          }
        }
      }
    }, async (request) => {
      const { limit, offset } = request.query;

      const countResult = await fastify.db.query(
        `SELECT COUNT(*) FROM import_history WHERE user_id = $1`,
        [request.user.id]
      );

      const result = await fastify.db.query(
        `SELECT ih.id, ih.drive_file_name, ih.mime_type, ih.note_id, ih.status, ih.error_message, ih.imported_at,
                n.title as note_title
         FROM import_history ih
         LEFT JOIN notes n ON ih.note_id = n.id
         WHERE ih.user_id = $1
         ORDER BY ih.imported_at DESC
         LIMIT $2 OFFSET $3`,
        [request.user.id, limit, offset]
      );

      return {
        data: result.rows,
        meta: {
          total: parseInt(countResult.rows[0].count, 10),
          limit,
          offset
        }
      };
    });
  });
}

module.exports = integrationRoutes;
