const { google } = require('googleapis');
const { importDriveFile, moveToProcessed, ensureProcessedFolder } = require('./driveImporter');

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE, 10) || 10485760;

class DrivePoller {
  constructor(fastify) {
    this.fastify = fastify;
    this.timer = null;
    this.scanning = false;
  }

  async start() {
    // Tick every 60 seconds; each tick checks if any integration is due for a scan
    this.timer = setInterval(() => this.tick(), 60 * 1000);
    this.fastify.log.info('Google Drive poller started (60s tick interval)');
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.fastify.log.info('Google Drive poller stopped');
  }

  async tick() {
    if (this.scanning) return;
    this.scanning = true;

    try {
      const result = await this.fastify.db.query(
        `SELECT * FROM integrations WHERE provider = 'google_drive' AND enabled = TRUE`
      );

      for (const integration of result.rows) {
        const pollMinutes = integration.config.poll_interval_minutes || 5;
        const intervalMs = pollMinutes * 60 * 1000;
        const lastImport = await this.getLastImportTime(integration.id);

        if (!lastImport || (Date.now() - new Date(lastImport).getTime()) >= intervalMs) {
          try {
            await this.scanForUser(integration);
          } catch (err) {
            this.fastify.log.error({ err, integrationId: integration.id }, 'Drive scan failed for user');
          }
        }
      }
    } catch (err) {
      this.fastify.log.error(err, 'Drive poller tick error');
    } finally {
      this.scanning = false;
    }
  }

  getOAuth2Client(integration) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: integration.access_token,
      refresh_token: integration.refresh_token,
      expiry_date: integration.token_expiry ? new Date(integration.token_expiry).getTime() : undefined
    });

    // Persist refreshed tokens back to DB
    oauth2Client.on('tokens', async (tokens) => {
      try {
        const updates = [];
        const values = [];
        let paramIdx = 1;

        if (tokens.access_token) {
          updates.push(`access_token = $${paramIdx++}`);
          values.push(tokens.access_token);
        }
        if (tokens.refresh_token) {
          updates.push(`refresh_token = $${paramIdx++}`);
          values.push(tokens.refresh_token);
        }
        if (tokens.expiry_date) {
          updates.push(`token_expiry = $${paramIdx++}`);
          values.push(new Date(tokens.expiry_date).toISOString());
        }

        if (updates.length > 0) {
          values.push(integration.id);
          await this.fastify.db.query(
            `UPDATE integrations SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
            values
          );
        }
      } catch (err) {
        this.fastify.log.error(err, 'Failed to persist refreshed Google tokens');
      }
    });

    return oauth2Client;
  }

  async scanForUser(integration) {
    const folderId = integration.config.folder_id;
    if (!folderId) {
      this.fastify.log.warn({ integrationId: integration.id }, 'No folder configured, skipping scan');
      return { imported: 0, errors: [] };
    }

    const oauth2Client = this.getOAuth2Client(integration);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // List files in the configured folder (not in subfolders, not trashed)
    const res = await drive.files.list({
      q: `'${folderId}' in parents AND trashed = false AND mimeType != 'application/vnd.google-apps.folder'`,
      fields: 'files(id, name, mimeType, size, createdTime, modifiedTime)',
      spaces: 'drive',
      pageSize: 100
    });

    const files = res.data.files || [];
    if (files.length === 0) {
      return { imported: 0, errors: [] };
    }

    // Filter out already-imported files (unless they match an auto-update note)
    const fileIds = files.map(f => f.id);
    const existing = await this.fastify.db.query(
      `SELECT ih.drive_file_id, ih.note_id, ih.imported_at, n.auto_update
       FROM import_history ih
       LEFT JOIN notes n ON n.id = ih.note_id AND n.deleted_at IS NULL
       WHERE ih.integration_id = $1 AND ih.drive_file_id = ANY($2) AND ih.status = 'success'`,
      [integration.id, fileIds]
    );

    const importedMap = new Map();
    for (const row of existing.rows) {
      importedMap.set(row.drive_file_id, row);
    }

    const filesToProcess = files.filter(f => {
      const prev = importedMap.get(f.id);
      if (!prev) return true; // never imported
      // Re-import if note has auto_update and file was modified after last import
      if (prev.auto_update && f.modifiedTime) {
        return new Date(f.modifiedTime) > new Date(prev.imported_at);
      }
      return false;
    });

    if (filesToProcess.length === 0) {
      return { imported: 0, errors: [] };
    }

    const newFiles = filesToProcess;

    let imported = 0;
    const errors = [];

    for (const file of newFiles) {
      try {
        // Skip files exceeding size limit (Google Docs have no size field)
        if (file.size && parseInt(file.size, 10) > MAX_FILE_SIZE) {
          this.fastify.log.warn({ fileName: file.name, size: file.size }, 'File exceeds size limit, skipping');
          const { logImport } = require('./driveImporter');
          await logImport(this.fastify, integration.user_id, integration.id, file, null, 'skipped', `File size ${file.size} exceeds limit ${MAX_FILE_SIZE}`);
          continue;
        }

        await importDriveFile(this.fastify, drive, file, integration.user_id, integration.id);
        imported++;

        // Don't move to Processed if this was an auto-update re-import —
        // the file must stay in the folder for future update scans.
        const prevImport = importedMap.get(file.id);
        const isAutoUpdateReimport = prevImport && prevImport.auto_update;

        if (!isAutoUpdateReimport) {
          // Try to move to Processed subfolder, but don't fail the import if it errors
          try {
            let processedFolderId = integration.config.processed_folder_id;
            if (!processedFolderId) {
              processedFolderId = await ensureProcessedFolder(drive, folderId);
              const updatedConfig = { ...integration.config, processed_folder_id: processedFolderId };
              await this.fastify.db.query(
                `UPDATE integrations SET config = $1 WHERE id = $2`,
                [JSON.stringify(updatedConfig), integration.id]
              );
              integration.config.processed_folder_id = processedFolderId;
            }
            await moveToProcessed(drive, file.id, processedFolderId);
          } catch (moveErr) {
            this.fastify.log.warn({ fileName: file.name, err: moveErr.message }, 'Could not move file to Processed folder (import succeeded)');
          }
        }
      } catch (err) {
        this.fastify.log.error({ err, fileName: file.name }, 'Failed to import file');
        errors.push({ file: file.name, error: err.message });
      }
    }

    this.fastify.log.info({ imported, errors: errors.length }, 'Drive scan completed');
    return { imported, errors };
  }

  async getLastImportTime(integrationId) {
    const result = await this.fastify.db.query(
      `SELECT MAX(imported_at) as last_import FROM import_history WHERE integration_id = $1`,
      [integrationId]
    );
    return result.rows[0]?.last_import || null;
  }
}

module.exports = DrivePoller;
