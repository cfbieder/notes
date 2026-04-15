// POST /api/v1/clips — web clipper ingestion endpoint.
//
// Accepts clipped content from the browser extension (Phase 7). The clipper
// handles HTML→Markdown conversion client-side (Turndown) so the body arrives
// as already-normalized markdown. Screenshots arrive as base64 data URLs and
// get uploaded as attachments on the new note — OCR runs automatically via
// the existing attachment pipeline.

const path = require('path');
const fs = require('fs/promises');
const llmService = require('../services/llmService');

const VALID_MODES = new Set(['article', 'selection', 'screenshot', 'link']);
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024; // 10MB decoded
const URL_MAX = 2048;
const TITLE_MAX = 500;
const CONTENT_MAX = 500_000;

function parseDataUrl(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > MAX_SCREENSHOT_BYTES) return null;
  const ext = match[1] === 'image/jpeg' ? '.jpg' : `.${match[1].split('/')[1]}`;
  return { mimeType: match[1], buffer, ext };
}

async function upsertTagsByName(fastify, userId, names) {
  if (!Array.isArray(names) || names.length === 0) return [];
  const normalized = [...new Set(
    names
      .map(n => typeof n === 'string' ? n.trim().toLowerCase() : null)
      .filter(n => n && n.length > 0 && n.length <= 100)
  )];
  if (normalized.length === 0) return [];

  const ids = [];
  for (const name of normalized) {
    const result = await fastify.db.query(
      `INSERT INTO tags (user_id, name)
       VALUES ($1, $2)
       ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [userId, name]
    );
    ids.push(result.rows[0].id);
  }
  return ids;
}

async function clipRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['url', 'mode'],
        properties: {
          url: { type: 'string', minLength: 1, maxLength: URL_MAX },
          title: { type: 'string', maxLength: TITLE_MAX },
          content: { type: 'string', maxLength: CONTENT_MAX },
          mode: { type: 'string', enum: ['article', 'selection', 'screenshot', 'link'] },
          notebook_id: { type: ['string', 'null'], format: 'uuid' },
          tag_names: { type: 'array', items: { type: 'string' }, maxItems: 20 },
          send_to_inbox: { type: 'boolean' },
          screenshot_data_url: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const userId = request.user.id;
    const {
      url, title, content, mode,
      notebook_id, tag_names, send_to_inbox,
      screenshot_data_url
    } = request.body;

    if (!VALID_MODES.has(mode)) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Invalid mode', statusCode: 400 });
    }

    // Validate URL shape — must be http(s)
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    } catch {
      return reply.code(400).send({ error: 'Bad Request', message: 'URL must be http(s)', statusCode: 400 });
    }

    // If a notebook is specified, verify ownership. Otherwise inbox implicit.
    let finalNotebookId = null;
    if (notebook_id) {
      const nb = await fastify.db.query(
        'SELECT id FROM notebooks WHERE id = $1 AND user_id = $2',
        [notebook_id, userId]
      );
      if (nb.rows.length === 0) {
        return reply.code(404).send({ error: 'Not Found', message: 'Notebook not found', statusCode: 404 });
      }
      finalNotebookId = notebook_id;
    }

    const isInbox = send_to_inbox === true || !finalNotebookId;

    // Build note body. For link mode we just save the URL; for others we
    // prepend a small source header so readers see provenance without opening
    // any external panel.
    const header = `> Clipped from [${title || url}](${url})\n\n`;
    let noteContent = '';
    if (mode === 'link') {
      noteContent = header;
    } else if (mode === 'screenshot') {
      // The image markdown is appended after the attachment is created below
      // (we need the attachment id to build the URL).
      noteContent = header + (content || '');
    } else {
      noteContent = header + (content || '');
    }

    const noteTitle = (title && title.trim()) || (mode === 'link' ? url : 'Untitled clip');

    const noteResult = await fastify.db.query(
      `INSERT INTO notes (user_id, notebook_id, title, content, is_inbox, source_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, notebook_id, title, content, is_inbox, source_url, created_at, updated_at`,
      [userId, finalNotebookId, noteTitle.slice(0, TITLE_MAX), noteContent, isInbox, url]
    );
    const note = noteResult.rows[0];

    // Tags
    const tagIds = await upsertTagsByName(fastify, userId, tag_names);
    if (tagIds.length > 0) {
      const values = tagIds.map((_, i) => `($1, $${i + 2})`).join(', ');
      await fastify.db.query(
        `INSERT INTO note_tags (note_id, tag_id) VALUES ${values} ON CONFLICT DO NOTHING`,
        [note.id, ...tagIds]
      );
    }

    // Screenshot attachment (if any)
    let attachmentId = null;
    if (mode === 'screenshot' && screenshot_data_url) {
      const parsed = parseDataUrl(screenshot_data_url);
      if (!parsed) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Invalid screenshot_data_url (must be data:image/png|jpeg|webp;base64, ≤10MB)',
          statusCode: 400
        });
      }

      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      const now = new Date();
      const year = now.getFullYear().toString();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const dirPath = path.join(uploadDir, year, month, note.id);
      await fs.mkdir(dirPath, { recursive: true });

      const filename = `screenshot${parsed.ext}`;
      const storedName = `${Date.now()}_screenshot${parsed.ext}`;
      const filePath = path.join(dirPath, storedName);
      await fs.writeFile(filePath, parsed.buffer);

      const storagePath = path.join(year, month, note.id, storedName);
      const attRes = await fastify.db.query(
        `INSERT INTO attachments (note_id, user_id, filename, mime_type, size_bytes, storage_path)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [note.id, userId, filename, parsed.mimeType, parsed.buffer.length, storagePath]
      );
      attachmentId = attRes.rows[0].id;

      // Embed the screenshot inline in the note body using the same markdown
      // format the editor emits when a user drag-drops an image. The frontend
      // renderer appends the auth token at display time.
      const imageMarkdown = `\n![${filename}](/api/v1/attachments/${attachmentId})\n`;
      const updatedContent = (note.content || '') + imageMarkdown;
      await fastify.db.query(
        'UPDATE notes SET content = $1 WHERE id = $2',
        [updatedContent, note.id]
      );
      note.content = updatedContent;

      // Fire-and-forget OCR — same pattern as the upload route.
      if (llmService.isEnabled() && llmService.isOcrCandidate(parsed.mimeType)) {
        llmService.ocrFile({ filePath, filename, mimeType: parsed.mimeType })
          .then(async (text) => {
            if (!text) return;
            await fastify.db.query(
              'UPDATE attachments SET ocr_text = $1 WHERE id = $2',
              [text, attachmentId]
            );
            fastify.log.info({ attachmentId, chars: text.length }, 'ocr complete (clip)');
          })
          .catch((err) => {
            fastify.log.warn({ err, attachmentId }, 'ocr failed (clip)');
          });
      }
    }

    return reply.code(201).send({
      data: {
        note,
        attachment_id: attachmentId,
        tag_ids: tagIds
      }
    });
  });
}

module.exports = clipRoutes;
