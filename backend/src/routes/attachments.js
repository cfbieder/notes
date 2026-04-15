const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { pipeline } = require('stream/promises');
const llmService = require('../services/llmService');

const ALLOWED_MIME_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv', 'text/markdown',
  'application/octet-stream'
]);

// Map file extensions to MIME types for when browser sends octet-stream
const EXT_TO_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain', '.csv': 'text/csv', '.md': 'text/markdown'
};

async function attachmentRoutes(fastify) {
  // Register multipart support for this scope
  await fastify.register(require('@fastify/multipart'), {
    limits: {
      fileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 25 * 1024 * 1024
    }
  });

  const uploadDir = process.env.UPLOAD_DIR || './uploads';

  // POST /api/v1/notes/:id/attachments — upload file
  fastify.post('/notes/:id/attachments', { onRequest: fastify.authenticate }, async (request, reply) => {
    const { id: noteId } = request.params;
    const userId = request.user.id;

    // Verify note belongs to user
    const noteCheck = await fastify.db.query(
      'SELECT id FROM notes WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [noteId, userId]
    );
    if (noteCheck.rows.length === 0) {
      return reply.code(404).send({ error: 'Not Found', message: 'Note not found', statusCode: 404 });
    }

    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'Bad Request', message: 'No file uploaded', statusCode: 400 });
    }

    // Resolve MIME type — prefer extension-based lookup when browser sends octet-stream
    const ext = path.extname(data.filename).toLowerCase();
    let mimeType = data.mimetype;
    if (mimeType === 'application/octet-stream' && EXT_TO_MIME[ext]) {
      mimeType = EXT_TO_MIME[ext];
    }
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: `File type "${mimeType}" is not allowed`,
        statusCode: 400
      });
    }

    // Build storage path: {uploadDir}/{year}/{month}/{noteId}/
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const dirPath = path.join(uploadDir, year, month, noteId);

    await fsp.mkdir(dirPath, { recursive: true });

    // Sanitize filename, add timestamp to avoid collisions
    const fileExt = path.extname(data.filename) || '';
    const baseName = path.basename(data.filename, fileExt)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 100);
    const storedName = `${Date.now()}_${baseName}${fileExt}`;
    const filePath = path.join(dirPath, storedName);

    // Stream file to disk
    const writeStream = fs.createWriteStream(filePath);
    await pipeline(data.file, writeStream);

    // Get actual file size from disk
    const stat = await fsp.stat(filePath);
    const sizeBytes = stat.size;

    // Check if file was truncated (exceeded size limit)
    if (data.file.truncated) {
      await fsp.unlink(filePath);
      return reply.code(413).send({
        error: 'Payload Too Large',
        message: 'File exceeds maximum size limit',
        statusCode: 413
      });
    }

    // Store relative path from uploadDir
    const storagePath = path.join(year, month, noteId, storedName);

    const result = await fastify.db.query(
      `INSERT INTO attachments (note_id, user_id, filename, mime_type, size_bytes, storage_path)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, note_id, filename, mime_type, size_bytes, created_at`,
      [noteId, userId, data.filename, mimeType, sizeBytes, storagePath]
    );

    const attachment = result.rows[0];

    if (llmService.isEnabled() && llmService.isOcrCandidate(mimeType)) {
      const absPath = filePath;
      llmService.ocrFile({ filePath: absPath, filename: data.filename, mimeType })
        .then(async (text) => {
          if (!text) return;
          await fastify.db.query(
            'UPDATE attachments SET ocr_text = $1 WHERE id = $2',
            [text, attachment.id]
          );
          fastify.log.info({ attachmentId: attachment.id, chars: text.length }, 'ocr complete');
        })
        .catch((err) => {
          fastify.log.warn({ err, attachmentId: attachment.id }, 'ocr failed');
        });
    }

    return reply.code(201).send({ data: attachment });
  });

  // GET /api/v1/attachments/:id — stream file (supports ?token= for inline rendering)
  fastify.get('/attachments/:id', {
    onRequest: async (request, reply) => {
      // Try Bearer header first, then query param token (for <img> tags)
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const decoded = fastify.auth.verifyAccessToken(authHeader.split(' ')[1]);
          request.user = decoded;
          return;
        } catch { /* fall through to query param */ }
      }

      const token = request.query.token;
      if (token) {
        try {
          const decoded = fastify.auth.verifyAccessToken(token);
          request.user = decoded;
          return;
        } catch { /* invalid token */ }
      }

      return reply.code(401).send({ error: 'Unauthorized', message: 'Missing or invalid token', statusCode: 401 });
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.id;

    const result = await fastify.db.query(
      'SELECT * FROM attachments WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Not Found', message: 'Attachment not found', statusCode: 404 });
    }

    const attachment = result.rows[0];
    const filePath = path.join(uploadDir, attachment.storage_path);

    try {
      await fsp.access(filePath);
    } catch {
      return reply.code(404).send({ error: 'Not Found', message: 'File not found on disk', statusCode: 404 });
    }

    const stream = fs.createReadStream(filePath);
    reply.header('Content-Type', attachment.mime_type);
    reply.header('Content-Disposition', `inline; filename="${attachment.filename}"`);
    reply.header('Cache-Control', 'private, max-age=31536000');
    return reply.send(stream);
  });

  // GET /api/v1/notes/:id/attachments — list attachments for a note
  fastify.get('/notes/:id/attachments', { onRequest: fastify.authenticate }, async (request) => {
    const { id: noteId } = request.params;
    const userId = request.user.id;

    const result = await fastify.db.query(
      `SELECT id, note_id, filename, mime_type, size_bytes, created_at
       FROM attachments
       WHERE note_id = $1 AND user_id = $2
       ORDER BY created_at DESC`,
      [noteId, userId]
    );

    return { data: result.rows };
  });

  // DELETE /api/v1/attachments/:id
  fastify.delete('/attachments/:id', { onRequest: fastify.authenticate }, async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.id;

    const result = await fastify.db.query(
      'DELETE FROM attachments WHERE id = $1 AND user_id = $2 RETURNING storage_path',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Not Found', message: 'Attachment not found', statusCode: 404 });
    }

    // Delete file from disk (best-effort)
    const filePath = path.join(uploadDir, result.rows[0].storage_path);
    try {
      await fsp.unlink(filePath);
    } catch {
      fastify.log.warn(`Could not delete file: ${filePath}`);
    }

    return reply.code(204).send();
  });
}

module.exports = attachmentRoutes;
