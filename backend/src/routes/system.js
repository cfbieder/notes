const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

// Recursively sum file sizes under `dir`. Returns 0 if the dir is missing.
async function dirSize(dir) {
  let total = 0;
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  await Promise.all(entries.map(async (entry) => {
    const p = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) {
        total += await dirSize(p);
      } else if (entry.isFile()) {
        const st = await fsp.stat(p);
        total += st.size;
      }
    } catch { /* skip unreadable */ }
  }));
  return total;
}

async function diskFree(dir) {
  try {
    const s = await fsp.statfs(dir);
    return {
      total_bytes: s.blocks * s.bsize,
      free_bytes: s.bavail * s.bsize
    };
  } catch {
    return null;
  }
}

async function pingGateway(url, timeoutMs = 2000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/health`, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

async function gatewayModels(url, timeoutMs = 2000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/llm/models`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const body = await res.json();
    if (Array.isArray(body)) return body.length;
    if (Array.isArray(body?.models)) return body.models.length;
    if (Array.isArray(body?.data)) return body.data.length;
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function listBackups(dir) {
  try {
    const files = await fsp.readdir(dir);
    const backups = files.filter(f => /^noted_.*\.sql(\.gz)?$/.test(f));
    if (backups.length === 0) return { count: 0, last_at: null, last_size_bytes: null };
    const stats = await Promise.all(
      backups.map(async f => ({ f, st: await fsp.stat(path.join(dir, f)) }))
    );
    stats.sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
    return {
      count: stats.length,
      last_at: stats[0].st.mtime.toISOString(),
      last_size_bytes: stats[0].st.size
    };
  } catch {
    return { count: 0, last_at: null, last_size_bytes: null };
  }
}

async function systemRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /api/v1/system/stats — single-call dashboard for the Settings page.
  // All collectors run in parallel; failures degrade to nulls rather than
  // blowing up the whole response.
  fastify.get('/stats', async (request) => {
    const userId = request.user.id;
    const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
    const backupDir = path.resolve(process.env.BACKUP_DIR || './backups');
    const gatewayUrl = (process.env.LLM_GATEWAY_URL || 'http://localhost:8080').replace(/\/$/, '');
    const llmEnabled = process.env.LLM_ENABLED !== 'false';

    let appVersion = null;
    try {
      const pkg = require('../../package.json');
      appVersion = pkg.version;
    } catch { /* ignore */ }

    const countsQuery = fastify.db.query(
      `SELECT
        (SELECT COUNT(*)::int FROM notes WHERE user_id = $1 AND deleted_at IS NULL AND note_type = 'note') AS notes,
        (SELECT COUNT(*)::int FROM notes WHERE user_id = $1 AND deleted_at IS NULL AND note_type = 'idea') AS ideas,
        (SELECT COUNT(*)::int FROM notes WHERE user_id = $1 AND deleted_at IS NOT NULL) AS trashed,
        (SELECT COUNT(*)::int FROM tasks WHERE user_id = $1 AND is_done = FALSE) AS tasks_open,
        (SELECT COUNT(*)::int FROM tasks WHERE user_id = $1 AND is_done = TRUE) AS tasks_done,
        (SELECT COUNT(*)::int FROM attachments WHERE user_id = $1) AS attachments,
        (SELECT COUNT(*)::int FROM attachments WHERE user_id = $1 AND ocr_text IS NOT NULL AND ocr_text <> '') AS attachments_ocr,
        (SELECT COUNT(*)::int FROM tags WHERE user_id = $1) AS tags`,
      [userId]
    );

    const dbSizeQuery = fastify.db.query(
      `SELECT pg_database_size(current_database())::bigint AS size`
    );

    const driveQuery = fastify.db.query(
      `SELECT enabled, updated_at FROM integrations
       WHERE user_id = $1 AND provider = 'google_drive'`,
      [userId]
    );

    const [
      countsRes,
      dbSizeRes,
      driveRes,
      attachmentsBytes,
      diskInfo,
      backupInfo,
      gatewayUp,
      modelCount
    ] = await Promise.all([
      countsQuery.catch(() => ({ rows: [{}] })),
      dbSizeQuery.catch(() => ({ rows: [{ size: null }] })),
      driveQuery.catch(() => ({ rows: [] })),
      dirSize(uploadDir),
      diskFree(uploadDir),
      listBackups(backupDir),
      llmEnabled ? pingGateway(gatewayUrl) : Promise.resolve(false),
      llmEnabled ? gatewayModels(gatewayUrl) : Promise.resolve(null)
    ]);

    return {
      data: {
        storage: {
          attachments_bytes: attachmentsBytes,
          attachments_path: uploadDir,
          db_size_bytes: dbSizeRes.rows[0]?.size != null ? Number(dbSizeRes.rows[0].size) : null,
          disk_total_bytes: diskInfo?.total_bytes ?? null,
          disk_free_bytes: diskInfo?.free_bytes ?? null
        },
        content: {
          notes: countsRes.rows[0]?.notes ?? 0,
          ideas: countsRes.rows[0]?.ideas ?? 0,
          trashed: countsRes.rows[0]?.trashed ?? 0,
          tasks_open: countsRes.rows[0]?.tasks_open ?? 0,
          tasks_done: countsRes.rows[0]?.tasks_done ?? 0,
          attachments: countsRes.rows[0]?.attachments ?? 0,
          attachments_ocr: countsRes.rows[0]?.attachments_ocr ?? 0,
          tags: countsRes.rows[0]?.tags ?? 0
        },
        server: {
          app_version: appVersion,
          node_version: process.version,
          uptime_seconds: Math.round(process.uptime()),
          memory_rss_bytes: process.memoryUsage().rss,
          env: process.env.NODE_ENV || 'development'
        },
        integrations: {
          llm_enabled: llmEnabled,
          llm_gateway_url: gatewayUrl,
          llm_reachable: llmEnabled ? gatewayUp : null,
          llm_model_count: modelCount,
          google_drive_connected: driveRes.rows.length > 0,
          google_drive_enabled: driveRes.rows[0]?.enabled ?? null
        },
        backup: {
          dir: backupDir,
          ...backupInfo
        }
      }
    };
  });
}

module.exports = systemRoutes;
