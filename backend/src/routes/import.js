const path = require('path');

// Match the existing attachment cap so users have one mental model for "max upload".
const MAX_IMPORT_SIZE = parseInt(process.env.MAX_FILE_SIZE, 10) || 25 * 1024 * 1024;

const EXT_TO_FORMAT = {
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.txt': 'markdown',
  '.html': 'html',
  '.htm': 'html'
};

const MIME_TO_FORMAT = {
  'text/markdown': 'markdown',
  'text/x-markdown': 'markdown',
  'text/plain': 'markdown',
  'text/html': 'html',
  'application/xhtml+xml': 'html'
};

function resolveFormat(filename, mimetype) {
  const ext = path.extname(filename || '').toLowerCase();
  if (EXT_TO_FORMAT[ext]) return EXT_TO_FORMAT[ext];
  if (MIME_TO_FORMAT[mimetype]) return MIME_TO_FORMAT[mimetype];
  return null;
}

// Pull <title>…</title>. Returns null if not present or empty.
function extractHtmlTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  const title = m[1].replace(/\s+/g, ' ').trim();
  return title.length > 0 ? title : null;
}

// If the HTML is a full document, return only the body content so the source
// view doesn't show <head>/<meta> boilerplate. If no <body> tag, return as-is.
function extractHtmlBody(html) {
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return m ? m[1].trim() : html.trim();
}

async function importRoutes(fastify) {
  await fastify.register(require('@fastify/multipart'), {
    limits: { fileSize: MAX_IMPORT_SIZE }
  });

  // POST /api/v1/notes/import
  fastify.post('/', { onRequest: fastify.authenticate }, async (request, reply) => {
    const userId = request.user.id;

    const data = await request.file();
    if (!data) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'No file uploaded',
        statusCode: 400
      });
    }

    const filename = data.filename || '';
    const mimetype = (data.mimetype || '').toLowerCase();
    const format = resolveFormat(filename, mimetype);

    if (!format) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: `Unsupported file type: ${mimetype || path.extname(filename) || 'unknown'}. Accepted: .md, .markdown, .txt, .html, .htm`,
        statusCode: 400
      });
    }

    // Buffer the file. Multipart already enforces the size cap; if it was
    // exceeded the stream sets `truncated`.
    const buf = await data.toBuffer();
    if (data.file.truncated) {
      return reply.code(413).send({
        error: 'Payload Too Large',
        message: `File exceeds ${MAX_IMPORT_SIZE} bytes`,
        statusCode: 413
      });
    }

    const raw = buf.toString('utf8');
    let content = raw;
    let derivedTitle = null;

    if (format === 'html') {
      derivedTitle = extractHtmlTitle(raw);
      content = extractHtmlBody(raw);
    }

    // Form fields ride alongside the file in multipart; @fastify/multipart
    // exposes them as data.fields after request.file() returns.
    const fields = data.fields || {};
    const overrideTitle = fields.title?.value?.trim();
    const notebookIdField = fields.notebook_id?.value?.trim();

    const baseFilename = filename ? path.basename(filename, path.extname(filename)) : '';
    const finalTitle = overrideTitle
      || derivedTitle
      || baseFilename
      || 'Untitled';

    // Match POST /notes default-notebook behaviour for markdown notes.
    // HTML notes also fall into the default notebook to avoid orphaned imports.
    let finalNotebookId = notebookIdField || null;
    if (!finalNotebookId) {
      const defaultNb = await fastify.db.query(
        'SELECT id FROM notebooks WHERE user_id = $1 AND is_default = TRUE LIMIT 1',
        [userId]
      );
      if (defaultNb.rows.length > 0) {
        finalNotebookId = defaultNb.rows[0].id;
      }
    }

    const result = await fastify.db.query(
      `INSERT INTO notes (user_id, notebook_id, title, content, format, note_type)
       VALUES ($1, $2, $3, $4, $5, 'note')
       RETURNING id, title, format, notebook_id, created_at`,
      [userId, finalNotebookId, finalTitle.slice(0, 500), content, format]
    );

    return reply.code(201).send({ data: result.rows[0] });
  });
}

module.exports = importRoutes;
